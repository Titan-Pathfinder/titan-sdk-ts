import { V1Client } from "../src/client";
import * as v1 from "../src/types/v1";
import { FakeWebSocket, StubCodec, minimalServerInfo, minimalSwapQuotes } from "./helpers";

describe("V1Client (unit)", () => {
	test("getInfo resolves with server info and increments ids", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const infoP = client.getInfo();
		// Expect first request id to be 0
		expect(codec.encodedMessages[0]).toMatchObject({ id: 0, data: { GetInfo: {} } });

		codec.setNextDecode([
			{ Response: { requestId: 0, data: { GetInfo: minimalServerInfo() } } },
		]);
		socket.emitBinary(new Uint8Array([0]).buffer);

		const info = await infoP;
		expect(info.protocolVersion.major).toBe(1);

		// Next id increments
		void client.getInfo();
		expect(codec.encodedMessages[1]).toMatchObject({ id: 1 });
	});

	test("newSwapQuoteStream returns stream, enqueues data, and closes cleanly", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const streamP = client.newSwapQuoteStream({
			swap: { inputMint: new Uint8Array(32) as any, outputMint: new Uint8Array(32) as any, amount: 10 },
			transaction: { userPublicKey: new Uint8Array(32) as any },
		});
		expect(codec.encodedMessages[0]).toMatchObject({ id: 0, data: { NewSwapQuoteStream: expect.any(Object) } });

		// Server responds with stream creation
		codec.setNextDecode([
			{
				Response: {
					requestId: 0,
					data: { NewSwapQuoteStream: { intervalMs: 1000 } },
					stream: { id: 42, dataType: v1.StreamDataType.SwapQuotes },
				},
			},
		]);
		socket.emitBinary(new Uint8Array([0]).buffer);

		const { response, stream } = await streamP;
		expect(response.intervalMs).toBe(1000);

		const reader = stream.getReader();

		// Emit a data packet
		codec.setNextDecode([
			{ StreamData: { id: 42, seq: 0, payload: { SwapQuotes: minimalSwapQuotes() } } },
		]);
		socket.emitBinary(new Uint8Array([0]).buffer);
		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(first.value).toBeDefined();

		// End the stream
		codec.setNextDecode([{ StreamEnd: { id: 42 } }]);
		socket.emitBinary(new Uint8Array([0]).buffer);
		const done = await reader.read();
		expect(done.done).toBe(true);
	});

	test("stream end with error surfaces StreamError", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const { stream } = await (async () => {
			const p = client.newSwapQuoteStream({
				swap: { inputMint: new Uint8Array(32) as any, outputMint: new Uint8Array(32) as any, amount: 10 },
				transaction: { userPublicKey: new Uint8Array(32) as any },
			});
			codec.setNextDecode([
				{ Response: { requestId: 0, data: { NewSwapQuoteStream: { intervalMs: 500 } }, stream: { id: 7, dataType: v1.StreamDataType.SwapQuotes } } },
			]);
			socket.emitBinary(new Uint8Array([0]).buffer);
			return p;
		})();

		const reader = stream.getReader();
		codec.setNextDecode([{ StreamEnd: { id: 7, errorCode: 9, errorMessage: "bad" } }]);
		socket.emitBinary(new Uint8Array([0]).buffer);
		await expect(reader.read()).rejects.toMatchObject({ name: "StreamError" });
	});

	test("stream.cancel triggers stopStream only once (idempotent)", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const { stream } = await (async () => {
			const p = client.newSwapQuoteStream({
				swap: { inputMint: new Uint8Array(32) as any, outputMint: new Uint8Array(32) as any, amount: 10 },
				transaction: { userPublicKey: new Uint8Array(32) as any },
			});
			codec.setNextDecode([
				{ Response: { requestId: 0, data: { NewSwapQuoteStream: { intervalMs: 500 } }, stream: { id: 5, dataType: v1.StreamDataType.SwapQuotes } } },
			]);
			socket.emitBinary(new Uint8Array([0]).buffer);
			return p;
		})();

		const cancelP = stream.cancel("test");
		// Client should send StopStream request
		const stopReq = codec.encodedMessages.find((m) => m?.data?.StopStream);
		expect(stopReq).toBeDefined();

		// Resolve stop stream
		codec.setNextDecode([
			{ Response: { requestId: stopReq.id, data: { StreamStopped: { id: 5 } } } },
		]);
		socket.emitBinary(new Uint8Array([0]).buffer);
		await cancelP;

		// Repeated cancel should not enqueue more StopStream
		await stream.cancel("again");
		const numStop = codec.encodedMessages.filter((m) => m?.data?.StopStream).length;
		expect(numStop).toBe(1);
	});

	test("ErrorResponse rejects corresponding promise", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const p = client.getInfo();
		codec.setNextDecode([{ Error: { requestId: 0, code: 400, message: "bad" } }]);
		socket.emitBinary(new Uint8Array([0]).buffer);
		await expect(p).rejects.toMatchObject({ name: "ErrorResponse" });
	});

	test("decode failure closes socket with 1002 and rejects inflight", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const p = client.getInfo();
		codec.setNextDecodeError(new Error("decode boom"));
		socket.emitBinary(new Uint8Array([0]).buffer);

		await expect(p).rejects.toMatchObject({ name: "ConnectionError" });
		expect(socket.closed?.code).toBe(1002);
		expect(client.closed).toBe(true);
	});

	test("StreamData for unknown id is ignored without throwing", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		// Emit data for unknown stream
		codec.setNextDecode([{ StreamData: { id: 999, seq: 0, payload: { SwapQuotes: minimalSwapQuotes() } } }]);
		expect(() => socket.emitBinary(new Uint8Array([0]).buffer)).not.toThrow();
	});

	test("multiple inflight requests resolve by requestId regardless of order", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const p0 = client.getInfo(); // id 0
		const p1 = client.getInfo(); // id 1

		// Respond to id 1 first
		codec.setNextDecode([{ Response: { requestId: 1, data: { GetInfo: minimalServerInfo() } } }]);
		socket.emitBinary(new Uint8Array([0]).buffer);

		// Then respond to id 0
		codec.setNextDecode([{ Response: { requestId: 0, data: { GetInfo: minimalServerInfo() } } }]);
		socket.emitBinary(new Uint8Array([0]).buffer);

		await expect(Promise.all([p0, p1])).resolves.toHaveLength(2);
	});
});


