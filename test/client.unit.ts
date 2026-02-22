import { V1Client } from "../src/client";
import * as v1 from "../src/types/v1";
import {
	FakeWebSocket,
	StubCodec,
	minimalServerInfo,
	minimalSwapQuotes,
	emitResponseGetInfo,
	emitResponseNewSwapQuoteStream,
	emitStreamData,
	emitStreamEnd,
	emitResponseStopStream,
	emitError,
	failNextDecode,
	emitResponseGetVenues,
	minimalVenueInfo,
	emitResponseListProviders,
	minimalProviderInfo,
} from "./helpers";

describe("V1Client (unit)", () => {
	test("getInfo resolves with server info and increments ids", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const infoP = client.getInfo();
		// Expect first request id to be 0
		expect(codec.encodedMessages[0]).toMatchObject({ id: 0, data: { GetInfo: {} } });

		emitResponseGetInfo(socket, codec, 0, minimalServerInfo());

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
		emitResponseNewSwapQuoteStream(socket, codec, 0, 42, 1000);

		const { response, stream } = await streamP;
		expect(response.intervalMs).toBe(1000);

		const reader = stream.getReader();

		// Emit a data packet
		emitStreamData(socket, codec, 42, minimalSwapQuotes());
		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(first.value).toBeDefined();

		// End the stream
		emitStreamEnd(socket, codec, 42);
		const done = await reader.read();
		expect(done.done).toBe(true);
	});

	test("getVenues returns venues", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const venuesP = client.getVenues();
		expect(codec.encodedMessages[0]).toMatchObject({ id: 0, data: { GetVenues: {} } });

		// Server responds with venues
		emitResponseGetVenues(socket, codec, 0, minimalVenueInfo());

		const info = await venuesP;
		expect(info.labels).toEqual(minimalVenueInfo().labels);
	});

	test("listProviders returns providers", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const providersP = client.listProviders();
		expect(codec.encodedMessages[0]).toMatchObject({ id: 0, data: { ListProviders: {} } });

		emitResponseListProviders(socket, codec, 0, minimalProviderInfo());
		
		const providers = await providersP;
		expect(providers).toEqual(minimalProviderInfo());
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
			emitResponseNewSwapQuoteStream(socket, codec, 0, 7, 500);
			return p;
		})();

		const reader = stream.getReader();
		emitStreamEnd(socket, codec, 7, 9, "bad");
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
			emitResponseNewSwapQuoteStream(socket, codec, 0, 5, 500);
			return p;
		})();

		const cancelP = stream.cancel("test");
		// Client should send StopStream request
		const stopReq = codec.encodedMessages.find((m) => m?.data?.StopStream);
		expect(stopReq).toBeDefined();

		// Resolve stop stream
		emitResponseStopStream(socket, codec, stopReq.id, 5);
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
		emitError(socket, codec, 0, 400, "bad");
		await expect(p).rejects.toMatchObject({ name: "ErrorResponse" });
	});

	test("decode failure closes socket with 1002 and rejects inflight", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const p = client.getInfo();
		failNextDecode(socket, codec, new Error("decode boom"));

		await expect(p).rejects.toMatchObject({ name: "ConnectionError" });
		expect(socket.closed?.code).toBe(3002);
		expect(client.closed).toBe(true);
	});

	test("StreamData for unknown id is ignored without throwing", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		// Emit data for unknown stream
		emitStreamData(socket, codec, 999, minimalSwapQuotes());
		expect(() => socket.emitBinary(new Uint8Array([0]).buffer)).not.toThrow();
	});

	test("newSwapQuoteStream with SwapVersion.V3 sends titanSwapVersion in request", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const streamP = client.newSwapQuoteStream({
			swap: { inputMint: new Uint8Array(32) as any, outputMint: new Uint8Array(32) as any, amount: 1000 },
			transaction: { userPublicKey: new Uint8Array(32) as any, titanSwapVersion: v1.SwapVersion.V3 },
		});

		const encoded = codec.encodedMessages[0];
		expect(encoded).toMatchObject({
			id: 0,
			data: { NewSwapQuoteStream: expect.any(Object) },
		});
		expect(encoded.data.NewSwapQuoteStream.transaction.titanSwapVersion).toBe(v1.SwapVersion.V3);

		// Complete the stream setup so the promise resolves
		emitResponseNewSwapQuoteStream(socket, codec, 0, 100, 1000);

		const { response, stream } = await streamP;
		expect(response.intervalMs).toBe(1000);

		const reader = stream.getReader();

		// Emit a quote and verify it arrives
		emitStreamData(socket, codec, 100, minimalSwapQuotes());
		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(first.value).toBeDefined();

		// Clean up
		emitStreamEnd(socket, codec, 100);
		const done = await reader.read();
		expect(done.done).toBe(true);
	});

	test("multiple inflight requests resolve by requestId regardless of order", async () => {
		const socket = new FakeWebSocket();
		const codec = new StubCodec();
		const client = new V1Client(socket as any, codec as any);

		const p0 = client.getInfo(); // id 0
		const p1 = client.getInfo(); // id 1

		// Respond to id 1 first
		emitResponseGetInfo(socket, codec, 1, minimalServerInfo());

		// Then respond to id 0
		emitResponseGetInfo(socket, codec, 0, minimalServerInfo());

		await expect(Promise.all([p0, p1])).resolves.toHaveLength(2);
	});
});


