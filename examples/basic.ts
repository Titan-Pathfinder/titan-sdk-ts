import { V1Client, types } from "titan-sdk-ts";
import bs58 from "bs58";

// WebSocket URL with authentication token
const WS_URL = "WS_URL?auth=AUTH_TOKEN";

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

    // Create a simple swap quote request
    const swapParams = {
      swap: {
        inputMint: bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC
        outputMint: bs58.decode("So11111111111111111111111111111111111111112"), // wSOL
        amount: 1_000_000, // 1 USDC (6 decimals)
        swapMode: types.common.SwapMode.ExactIn,
        slippageBps: 50 // 0.5% slippage
      },
      transaction: {
        userPublicKey: bs58.decode("USER_PUBLIC_KEY") // Replace with actual user pubkey
      },
      update: {
        num_quotes: 3 // Get 3 quotes total
      }
    };

    // Start the quote stream
    const { stream, response } = await client.newSwapQuoteStream(swapParams);
    console.log("Response:", response);

    console.log("Starting quote stream...");

    const venues = await client.getVenues();
    console.log("Venues:", venues);

    const providers = await client.listProviders();
    console.log("Providers:", providers);
    
    // Read quotes from the stream using async iteration
    let quoteCount = 0;
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
      if (quoteCount >= 3) {
        break;
      }
    }

    console.log("Stream completed");

  } catch (error) {
    console.error("Error:", error);
  }
}

basicExample();
