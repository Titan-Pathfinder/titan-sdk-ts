import { encode } from "@msgpack/msgpack";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as v1 from "../src/types/v1";

class FakeWebSocket {
	protocol: string | null = v1.WEBSOCKET_SUBPROTO_BASE;
	binaryType = "arraybuffer";
	onopen?: () => void;
	onmessage?: (e: { data: ArrayBuffer }) => void;
	onclose?: (e: { code: number; reason?: string; wasClean: boolean }) => void;
	onerror?: (e: Error) => void;
	sent: Uint8Array[] = [];

	send = (data: Uint8Array) => {
		this.sent.push(data);
	};
	close = (_code?: number, _reason?: string) => {
		this.onclose?.({ code: 1000, reason: "", wasClean: true });
	};

	emitBinary(buffer: ArrayBuffer) {
		this.onmessage?.({ data: buffer });
	}
}

class StubCodec {
	private queue: any[] = [];
	encode = async (_: any) => new Uint8Array([1]);
	decode = async (_: Uint8Array) => (this.queue.shift() ?? {});
	push(msg: any) { this.queue.push(msg); }
}

function getExports(mod: any) {
	return {
		V1Client: mod.V1Client ?? mod.client?.V1Client,
		V1ClientCodec: mod.codec?.V1ClientCodec ?? mod.V1ClientCodec,
		types: mod.types,
	};
}

describe("distribution imports", () => {
	test("CJS exports load and work", async () => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const cjs = require("../lib/titan-sdk.cjs");
		const { V1Client, V1ClientCodec } = getExports(cjs);
		expect(V1Client).toBeDefined();
		expect(V1ClientCodec).toBeDefined();

		// codec basic encode/decode round trips
		const codec = V1ClientCodec.from_protocol(v1.WEBSOCKET_SUBPROTO_BASE);
		const req: v1.ClientRequest = { id: 0, data: { GetInfo: {} } };
		const encoded = await codec.encode(req);
		expect(encoded).toBeInstanceOf(Uint8Array);
		// decode a ServerMessage encoded via msgpack
		const serverMsg: v1.ServerMessage = { Response: { requestId: 0, data: { GetInfo: { protocolVersion: { major:1, minor:0, patch:0 }, settings: { quoteUpdate: { intervalMs: { min: 1, max: 2, default: 1 }, num_quotes: { min: 1, max: 100, default: 3 } }, swap: { slippageBps: { min: 0, max:1000, default: 50 }, onlyDirectRoutes: false, addSizeConstraint: false }, transaction: { closeInputTokenAccount: false, createOutputTokenAccount: true }, connection: { concurrentStreams: 5 } } } } } };
		const packed = encode(serverMsg);
		const decoded = await codec.decode(packed);
		expect(decoded).toHaveProperty("Response");

		// client minimal flow with stub codec and fake socket
		const socket = new FakeWebSocket();
		const stub = new StubCodec();
		const client = new V1Client(socket as any, stub as any);
		const p = client.getInfo();
		stub.push(serverMsg);
		socket.emitBinary(new Uint8Array([0]).buffer);
		await expect(p).resolves.toBeDefined();
	});

	test("ESM exports load and work", async () => {
		// Run ESM import verification in a separate Node process to avoid Jest's CJS loader
		const run = promisify(execFile);
		const nodeBin = process.execPath;
		const esmUrl = pathToFileURL(path.resolve(__dirname, "../lib/titan-sdk.mjs")).href;
		const smokePath = path.resolve(__dirname, "./esm-smoke.mjs");
		const { stdout } = await run(nodeBin, [smokePath, esmUrl]);
		expect(stdout.trim()).toBe("OK");
	});
});


