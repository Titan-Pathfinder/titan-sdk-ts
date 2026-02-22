import { V1Client } from "../src/client";
import * as v1 from "../src/types/v1";
import { SwapMode } from "../src/types/common";

// Required env vars:
//   TITAN_WS_URL   - WebSocket endpoint, e.g. wss://example.com/api/v1/ws
//   TITAN_API_KEY  - API key / auth token
const WS_URL = process.env.TITAN_WS_URL;
const API_KEY = process.env.TITAN_API_KEY;

// Well-known Solana mints (raw 32-byte public keys)
// USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
const USDC_MINT = new Uint8Array([
	198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116,
	49, 177, 187, 228, 194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93,
	97,
]);
// SOL (Wrapped): So11111111111111111111111111111111111111112
const WSOL_MINT = new Uint8Array([
	6, 155, 136, 87, 254, 171, 129, 132, 251, 104, 127, 99, 70, 24, 192, 53,
	218, 196, 57, 220, 26, 235, 59, 85, 152, 160, 240, 0, 0, 0, 0, 1,
]);
// A dummy user public key (random 32 bytes, generated once)
const DUMMY_USER_PUBKEY = new Uint8Array([
	174, 47, 154, 16, 202, 55, 73, 13, 129, 218, 31, 236, 91, 108, 251, 12,
	67, 203, 242, 233, 19, 5, 144, 60, 182, 89, 225, 43, 102, 7, 170, 215,
]);

const skip = !WS_URL || !API_KEY;

const describeIf = skip ? describe.skip : describe;

describeIf("Swap V3 integration (live)", () => {
	let client: V1Client;

	beforeAll(async () => {
		const url = `${WS_URL}?auth=${API_KEY}`;
		client = await V1Client.connect(url);
	}, 15_000);

	afterAll(async () => {
		if (client && !client.closed) {
			await client.close();
		}
	});


	test("newSwapQuoteStream with SwapVersion.V3 receives at least one quote", async () => {
		const { response, stream, streamId } = await client.newSwapQuoteStream({
			swap: {
				inputMint: USDC_MINT,
				outputMint: WSOL_MINT,
				amount: 1_000_000, // 1 USDC
				swapMode: SwapMode.ExactIn,
				slippageBps: 100,
			},
			transaction: {
				userPublicKey: DUMMY_USER_PUBKEY,
				titanSwapVersion: v1.SwapVersion.V3,
			},
		});

		expect(response.intervalMs).toBeGreaterThan(0);

		// The first stream event may arrive with an empty quotes object before
		// providers have responded. Read up to 10 events waiting for one that
		// contains at least one provider quote.
		const reader = stream.getReader();
		let quotesWithProviders: v1.SwapQuotes | undefined;
		const receivedEvents: Array<{ index: number; id: string; providerCount: number; providers: string[] }> = [];

		for (let i = 0; i < 10; i++) {
			const result = await reader.read();
			if (result.done) {
				console.log(`[stream] event ${i}: stream ended (done=true)`);
				break;
			}

			const q = result.value!;
			const providers = Object.keys(q.quotes);
			receivedEvents.push({ index: i, id: q.id, providerCount: providers.length, providers });
			console.log(`[stream] event ${i}: id=${q.id}, providers=[${providers.join(", ")}] (${providers.length})`);

			if (providers.length > 0) {
				quotesWithProviders = q;
				break;
			}
		}

		console.log(`[stream] total events received: ${receivedEvents.length}`);
		console.log(`[stream] events summary:`, JSON.stringify(receivedEvents, null, 2));

		expect(quotesWithProviders).toBeDefined();
		expect(Object.keys(quotesWithProviders!.quotes).length).toBeGreaterThan(0);

		// Clean up - stop the stream
		reader.releaseLock();
		await client.stopStream(streamId);
	}, 30_000);
});
