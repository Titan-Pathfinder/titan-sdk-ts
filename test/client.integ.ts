import http from "node:http";
import { V1Client } from "../src/client";
import { V1ClientCodec } from "../src/codec";
import * as v1 from "../src/types/v1";
import { server as WebSocketServer } from "websocket";
import { minimalServerInfo, minimalSwapQuotes } from "./helpers";

async function createServer() {
	const httpServer = http.createServer();
	await new Promise<void>((resolve) => httpServer.listen(0, resolve));
	const address = httpServer.address();
	const port = typeof address === "object" && address ? address.port : 0;
	const wsServer = new WebSocketServer({ httpServer, autoAcceptConnections: false });
	return { httpServer, wsServer, port };
}

describe("V1Client (integration)", () => {
	let httpServer: http.Server;
	let wsServer: WebSocketServer;
	let port: number;

	beforeEach(async () => {
		const s = await createServer();
		httpServer = s.httpServer as any;
		wsServer = s.wsServer as any;
		port = s.port as any;
	});

	afterEach(async () => {
		wsServer.shutDown();
		httpServer.close();
	});

	test("getInfo round-trip", async () => {
		wsServer.on("request", (req) => {
			// Pick base protocol (no compression) for simplicity
			const selected = v1.WEBSOCKET_SUBPROTO_BASE;
			const conn = req.accept(selected);
			const codec = V1ClientCodec.from_protocol(selected);
			conn.on("message", async (msg) => {
				if (msg.type === "binary") {
					const data = new Uint8Array(msg.binaryData);
					const decoded = (await codec.decode(data)) as any;
					if (decoded?.data?.GetInfo !== undefined) {
						const response: v1.ServerMessage = {
							Response: {
								requestId: decoded.id,
								data: { GetInfo: minimalServerInfo() },
							},
						};
						const encoded = await (codec as any).encode(response);
						conn.sendBytes(Buffer.from(encoded));
					}
				}
			});
		});

		const client = await V1Client.connect(`ws://127.0.0.1:${port}/`);
		const info = await client.getInfo();
		expect(info.protocolVersion.major).toBe(1);
	});

	test("stream create, receive data, and end", async () => {
		wsServer.on("request", (req) => {
			const selected = req.requestedProtocols.find((p) => p.startsWith(v1.WEBSOCKET_SUBPROTO_BASE)) || v1.WEBSOCKET_SUBPROTO_BASE;
			const conn = req.accept(selected);
			const codec = V1ClientCodec.from_protocol(selected);
			conn.on("message", async (msg) => {
				if (msg.type !== "binary") return;
				const data = new Uint8Array(msg.binaryData);
				const decoded = (await codec.decode(data)) as any;
				if (decoded?.data?.NewSwapQuoteStream) {
					const streamId = 77;
					const response: v1.ServerMessage = {
						Response: {
							requestId: decoded.id,
							data: { NewSwapQuoteStream: { intervalMs: 1000 } },
							stream: { id: streamId, dataType: v1.StreamDataType.SwapQuotes },
						},
					};
					conn.sendBytes(Buffer.from(await (codec as any).encode(response)));
					// Send a data packet then end
					const dataMsg: v1.ServerMessage = { StreamData: { id: streamId, seq: 0, payload: { SwapQuotes: minimalSwapQuotes() } } };
					conn.sendBytes(Buffer.from(await (codec as any).encode(dataMsg)));
					const endMsg: v1.ServerMessage = { StreamEnd: { id: streamId } };
					conn.sendBytes(Buffer.from(await (codec as any).encode(endMsg)));
				}
			});
		});

		const client = await V1Client.connect(`ws://127.0.0.1:${port}/`);
		const { stream } = await client.newSwapQuoteStream({
			swap: { inputMint: new Uint8Array(32) as any, outputMint: new Uint8Array(32) as any, amount: 10 },
			transaction: { userPublicKey: new Uint8Array(32) as any },
		});
		const reader = stream.getReader();
		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(first.value).toBeDefined();
		const done = await reader.read();
		expect(done.done).toBe(true);
	});

	test("malformed frame triggers client close and inflight rejection", async () => {
		wsServer.on("request", (req) => {
			const selected = req.requestedProtocols.find((p) => p.startsWith(v1.WEBSOCKET_SUBPROTO_BASE)) || v1.WEBSOCKET_SUBPROTO_BASE;
			const conn = req.accept(selected);
			// Wait for the client to send its first request, then reply with malformed bytes
			conn.on("message", () => {
				conn.sendBytes(Buffer.from(new Uint8Array([0, 1, 2, 3])));
			});
		});

		const client = await V1Client.connect(`ws://127.0.0.1:${port}/`);
		await expect(client.getInfo()).rejects.toMatchObject({ name: "ConnectionError" });
	});
});


