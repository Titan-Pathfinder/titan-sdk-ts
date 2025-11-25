import { V1Client, types } from "@titanexchange/sdk-ts";
import bs58 from "bs58";
import { env } from "node:process";

// WebSocket URL with authentication token
// Set the following environment variables to use this script as-is:
// - WS_URL			: URL for the WebSocket API endpoint. Ex: `wss://example.com/api/v1/ws`
// - AUTH_TOKEN		: Authentication token for the API endpoint
// - USER_PUBLIC_KEY: Base58-encoded public key for user swapping tokens, used for instruction building.
// - INPUT_MINT		: Base58-encoded input mint public key, defaults to USDC
// - OUTPUT_MINT	: Base58-encoded output mint public key, defaults to WSOL
// - AMOUNT			: Number of atoms of input mint to swap, defaults to 1 million (1 USDC).
// - SLIPPAGE_BPS	: Allowable slippage in basis points, defaults to 50 (0.5%)
// - NUM_QUOTES		: Maximum number of quotes to receive per stream event, default 3
const WS_URL = `${env["WS_URL"]}?auth=${env["AUTH_TOKEN"]}`;
const USER_PUBLIC_KEY = bs58.decode(env["USER_PUBLIC_KEY"] || "Fake111111111111111111111111111111111111111");
const INPUT_MINT = bs58.decode(env["INPUT_MINT"] || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const OUTPUT_MINT = bs58.decode(env["OUTPUT_MINT"] || "So11111111111111111111111111111111111111112");
const AMOUNT = parseInt(env["AMOUNT"] || "1000000");
const SLIPPAGE_BPS = parseInt(env["SLIPPAGE_BPS"] || "50");
const NUM_QUOTES = parseInt(env["NUM_QUOTES"] || "3");

async function basicExample() {
	try {
		// Connect to the Titan API
		const client = await V1Client.connect(WS_URL);
		console.log("Connected to Titan API");

		// Get server information
		const info = await client.getInfo();
		console.log("Server info:", {
			protocol: info.protocolVersion,
			defaultInterval: info.settings.quoteUpdate.intervalMs.default,
			maxSlippage: info.settings.swap.slippageBps.max
		});

		const venues = await client.getVenues();
		console.log("Venues:", venues);

		const providers = await client.listProviders();
		console.log("Providers:", providers);

		// Pull just pricing information as an example.
		const price = await client.getSwapPrice({
			inputMint: INPUT_MINT,
			outputMint: OUTPUT_MINT,
			amount: AMOUNT,
		});
		console.log("Price:", price);

		// Create a simple swap quote request
		const swapParams = {
			swap: {
				inputMint: INPUT_MINT,
				outputMint: OUTPUT_MINT,
				amount: AMOUNT,
				swapMode: types.common.SwapMode.ExactIn,
				slippageBps: SLIPPAGE_BPS,
			},
			transaction: {
				userPublicKey: USER_PUBLIC_KEY
			},
			update: {
				numQuotes: NUM_QUOTES
			}
		};

		// Start the quote stream
		const { stream, response, streamId } = await client.newSwapQuoteStream(swapParams);
		console.log("Response:", response);

		console.log("Starting quote stream...");

		// Read quotes from the stream using async iteration
		let quoteCount = 0;
		let canceled = false;
		for await (const quote of stream) {
			quoteCount++;

			const providers = Object.keys(quote.quotes);
			const firstProvider = providers[0];
			const firstQuote = firstProvider ? quote.quotes[firstProvider] : null;
			console.log(`Quote ${quoteCount}:`, {
				id: quote.id,
				providers: providers,
				bestQuote: firstQuote ? `${(firstQuote.outAmount / 1e9).toFixed(6)} SOL` : 'N/A'
			});

			// Stop after 3 quotes
			if (quoteCount >= 3 && !canceled) {
				canceled = true;
				client.stopStream(streamId).then((res) => console.log("Stream %j stopped", res.id));
			}
		}
		console.log("Stream completed");

		let close_event = await client.close();
		console.log("Client closed: %j", close_event);
		return;
	} catch (error) {
		console.error("Error:", error);
	}
}

basicExample()
	.then(() => console.log("Completed successfully"))
	.catch((err) => console.error("Completed with error", err));