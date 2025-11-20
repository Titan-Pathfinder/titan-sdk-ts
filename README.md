# Titan SDK for TypeScript

Official TypeScript/JavaScript SDK for the Titan Swap API - Stream live swap quotes from multiple DEXes and liquidity providers on Solana.

---

## Overview

The Titan SDK provides a WebSocket-based client for requesting and receiving live streams of token swap quotes on Solana. The API aggregates quotes across multiple decentralized exchanges and liquidity providers, delivering continuously updated simulated results at configurable intervals. The SDK handles connection management, quote streaming, and returns ready-to-execute transactions.

**Key Features:**
- Live quote streaming with continuous updates from multiple providers
- Automatic compression negotiation (zstd, brotli, gzip)
- Pre-built transactions ready for signing and execution
- TypeScript support with full type definitions
- Browser and Node.js compatible

---

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
  - [Connecting to the API](#connecting-to-the-api)
  - [Streaming Swap Quotes](#streaming-swap-quotes)
  - [Executing Swaps](#executing-swaps)
  - [Stopping a Stream](#stopping-a-stream)
  - [Understanding Instruction Format](#understanding-instruction-format)
  - [Getting Server Info](#getting-server-info)
  - [Listing Venues and Providers](#listing-venues-and-providers)
- [Browser Usage](#browser-usage)
- [Types](#types)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Links](#links)
- [License](#license)

---

## Installation

```bash
# npm
npm install @titanexchange/sdk-ts

# yarn
yarn add @titanexchange/sdk-ts

# pnpm
pnpm add @titanexchange/sdk-ts
```

**Requirements:** Node.js >=18.19

---

## Basic Usage

To get started with the Titan SDK, you'll connect to the API, stream live quotes, and execute swaps. This section walks through the core workflow.

### Connecting to the API

Establish a WebSocket connection to the Titan API using your authentication token.

```typescript
import { V1Client } from "@titanexchange/sdk-ts";

// Connect with authentication token in query string
const url = "wss://YOUR_API_ENDPOINT/ws?auth=YOUR_AUTH_TOKEN";
const client = await V1Client.connect(url);

// Check connection status
console.log("Connected:", !client.closed);

// Monitor connection close events (optional)
client.listen_closed().then((event) => {
  console.log("Connection closed:", event.code, event.reason);
});

// Close connection when done
await client.close();
```

**Notes:**
- Connection automatically negotiates compression (zstd, brotli, gzip, or none)
- Authentication token is passed as a query parameter
- `listen_closed()` returns a promise that resolves when the connection closes
- Contact info@titandex.io for API-related inquiries

### Streaming Swap Quotes

Once connected, you can request a continuous stream of swap quotes. The API will send you updated quotes at regular intervals from multiple providers, allowing you to compare prices in real-time.

```typescript
import { V1Client, types } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

// Example token mint addresses (replace with actual mints)
const USDC = bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC mainnet
const SOL = bs58.decode("So11111111111111111111111111111111111111112");  // Wrapped SOL
const USER_PUBKEY = bs58.decode("YOUR_WALLET_PUBLIC_KEY_HERE"); // Replace with your wallet

const { stream, streamId, response } = await client.newSwapQuoteStream({
  swap: {
    inputMint: USDC,              // Pubkey (32-byte Uint8Array)
    outputMint: SOL,              // Pubkey (32-byte Uint8Array)
    amount: 1_000_000,            // Uint64 - raw token amount (not scaled)
    swapMode: types.common.SwapMode.ExactIn,
    slippageBps: 50,              // Optional - defaults to server setting
    dexes: ["Raydium", "Orca"],   // Optional - filter to specific DEXes
    excludeDexes: ["Phoenix"],    // Optional - exclude DEXes
    // providers: ["provider_id"], // Optional - filter by provider ID
  },
  transaction: {
    userPublicKey: USER_PUBKEY,   // Required for transaction generation
    feeBps: 10,                   // Optional - fee in basis points
  },
  update: {
    num_quotes: 3,                // Number of top quotes per update
    intervalMs: 1000,             // Optional - update interval (server has min/max)
  },
});

// Consume quote stream using async iteration
for await (const quotes of stream) {
  for (const [providerId, route] of Object.entries(quotes.quotes)) {
    console.log(`${providerId}:`, {
      inAmount: route.inAmount,
      outAmount: route.outAmount,
      slippageBps: route.slippageBps,
      instructions: route.instructions.length,
    });
  }
}
```

**Swap Modes:**
- `SwapMode.ExactIn` - Amount is input tokens, slippage applied to output
- `SwapMode.ExactOut` - Amount is output tokens, slippage applied to input

**Optional Filters:**
- `dexes` / `excludeDexes` - Control which DEX venues are used
- `providers` - Limit to specific provider IDs
- `onlyDirectRoutes` - Only allow direct swaps (no intermediate tokens)

**Important Notes:**
- `num_quotes` uses snake_case (not `numQuotes`)
- The `quotes` field is an object with provider names as keys, not an array
- Transform to array: `Object.entries(quotes.quotes).map(([provider, route]) => ({ ...route, provider }))`

### Executing Swaps

When you've found a quote you want to execute, the SDK provides a pre-built transaction ready for signing and submission to Solana.

```typescript
import { Connection, VersionedTransaction } from "@solana/web3.js";

// Get the best quote
const bestRoute = Object.values(quotes.quotes)[0];

// Deserialize and sign the transaction
const tx = VersionedTransaction.deserialize(bestRoute.transaction);
tx.sign([yourKeypair]); // or use wallet.signTransaction(tx) in browser

// Send to Solana
const connection = new Connection("https://api.mainnet-beta.solana.com");
const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction(signature);
```

**Note:** Quotes have expiration times (`expiresAtMs`, `expiresAfterSlot`). Execute promptly for best results.

### Stopping a Stream

If you want to stop receiving quotes before the stream ends naturally, you can cancel it manually. This is useful when you've already executed a swap or no longer need updates.

```typescript
const { stream, streamId } = await client.newSwapQuoteStream(params);

// Method 1: Using client.stopStream() with stream ID
let count = 0;
for await (const quotes of stream) {
  console.log("Quote:", quotes.id);

  if (++count >= 5) {
    const result = await client.stopStream(streamId);
    console.log("Stopped stream:", result.id);
    break;
  }
}

// Method 2: Using stream.cancel() directly
const { stream } = await client.newSwapQuoteStream(params);

setTimeout(() => {
  stream.cancel("Timeout reached"); // Reason is optional
}, 10000);

for await (const quotes of stream) {
  console.log("Quote:", quotes.id);
}
```

**Notes:**
- Both methods send a stop request to the server
- `stopStream(streamId)` returns a confirmation with the stream ID
- `cancel(reason?)` internally calls `stopStream()` on the server

### Understanding Instruction Format

For advanced use cases, you might need to work with raw Solana instructions. The SDK uses compact field names to minimize bandwidth usage.

```typescript
interface Instruction {
  p: Uint8Array;      // programId
  a: AccountMeta[];   // accounts
  d: Uint8Array;      // instruction data
}

interface AccountMeta {
  p: Uint8Array;      // pubkey
  s: boolean;         // isSigner
  w: boolean;         // isWritable
}
```

### Getting Server Info

Before making requests, you can query the server to learn about supported settings, parameter limits, and protocol version. This helps you configure requests within valid ranges.

```typescript
const info = await client.getInfo();

console.log("Protocol version:", {
  major: info.protocolVersion.major,
  minor: info.protocolVersion.minor,
  patch: info.protocolVersion.patch,
});

console.log("Quote update settings:", {
  intervalMs: info.settings.quoteUpdate.intervalMs,    // { min, max, default }
  num_quotes: info.settings.quoteUpdate.num_quotes,    // { min, max, default }
});

console.log("Swap settings:", {
  slippageBps: info.settings.swap.slippageBps,         // { min, max, default }
  onlyDirectRoutes: info.settings.swap.onlyDirectRoutes,
  addSizeConstraint: info.settings.swap.addSizeConstraint,
});

console.log("Connection limits:", {
  concurrentStreams: info.settings.connection.concurrentStreams, // number
});
```

**Notes:**
- Use this to check parameter bounds before creating swap quote requests
- `concurrentStreams` tells you how many streams you can run simultaneously
- Quote update and slippage settings include `min`, `max`, and `default` values

### Listing Venues and Providers

You can query which DEX venues and liquidity providers are available on the platform. This is helpful for filtering requests to specific sources.

```typescript
// Get list of DEX venues
const venues = await client.getVenues();
console.log("Venues:", venues.labels); // ["Raydium", "Orca", "Phoenix", ...]

// Get venues with Solana program IDs
const venuesWithIds = await client.getVenues({ includeProgramIds: true });

// Get list of quote providers
const providers = await client.listProviders();
providers.forEach((p) => {
  console.log(`${p.name} (${p.kind}): ${p.id}`);
});

// Get providers with icon URLs
const withIcons = await client.listProviders({ includeIcons: true });
```

**Notes:**
- Use venue labels in `dexes`/`excludeDexes` filters
- Use provider IDs in `providers` filter
- Provider `kind` is either `"DexAggregator"` or `"RFQ"`

---

## Browser Usage

The SDK works in modern browsers with the same API as Node.js. Simply import from the `/browser` entrypoint.

```typescript
import { V1Client } from "@titanexchange/sdk-ts/browser";

const client = await V1Client.connect("wss://YOUR_API_ENDPOINT/ws?auth=YOUR_TOKEN");
const { stream } = await client.newSwapQuoteStream(params);

for await (const quotes of stream) {
  console.log("Quotes:", quotes);
}
```

**Notes:**
- Browser builds include WebSocket and compression polyfills
- API is identical to Node.js usage
- Contact info@titandex.io for API-related inquiries

---

## Types

The SDK exports TypeScript types for all request and response structures. Import them from the `types` namespace for better type safety and autocomplete.

```typescript
import { types } from "@titanexchange/sdk-ts";

// Access types via namespace
types.v1.SwapQuoteRequest
types.v1.SwapParams
types.common.SwapMode
```

### Request Types

```typescript
interface SwapQuoteRequest {
  swap: SwapParams;
  transaction: TransactionParams;
  update?: QuoteUpdateParams;
}

interface SwapParams {
  inputMint: Uint8Array;          // 32-byte Pubkey
  outputMint: Uint8Array;         // 32-byte Pubkey
  amount: number | bigint;        // Uint64 - raw amount
  swapMode?: SwapMode;            // "ExactIn" | "ExactOut"
  slippageBps?: number;
  dexes?: string[];
  excludeDexes?: string[];
  providers?: string[];
  onlyDirectRoutes?: boolean;
  addSizeConstraint?: boolean;
  sizeConstraint?: number;
}

interface TransactionParams {
  userPublicKey: Uint8Array;          // 32-byte Pubkey
  feeBps?: number;
  feeAccount?: Uint8Array;            // 32-byte Pubkey
  feeFromInputMint?: boolean;
  outputAccount?: Uint8Array;         // 32-byte Pubkey
  closeInputTokenAccount?: boolean;
  createOutputTokenAccount?: boolean;
}
```

### Response Types

```typescript
interface SwapQuotes {
  id: string;
  inputMint: Uint8Array;
  outputMint: Uint8Array;
  swapMode: SwapMode;
  amount: number;
  quotes: { [providerId: string]: SwapRoute };
}

interface SwapRoute {
  inAmount: number;
  outAmount: number;
  slippageBps: number;
  platformFee?: PlatformFee;
  steps: RoutePlanStep[];
  instructions: Instruction[];
  addressLookupTables: Uint8Array[];  // Pubkey[]
  contextSlot?: number;
  timeTaken?: number;
  expiresAtMs?: number;
  expiresAfterSlot?: number;
  computeUnits?: number;
  computeUnitsSafe?: number;
  transaction?: Uint8Array;
  referenceId?: string;
}
```

### Handling BigInt values

The API may return `BigInt` for large numbers (Uint64 > 53 bits). For logging:

```typescript
function serializeForDisplay(data: any): string {
  return JSON.stringify(data, (key, value) => {
    if (typeof value === "bigint") {
      return value.toString() + "n";
    }
    if (value instanceof Uint8Array) {
      return `<Uint8Array: ${value.length} bytes>`;
    }
    return value;
  }, 2);
}
```

---

## Error Handling

The SDK throws specific error types for different failure scenarios. Catch and handle them to build robust applications.

```typescript
import { V1Client, client } from "@titanexchange/sdk-ts";


const {
  ConnectionClosed,
  ConnectionError,
  ErrorResponse,
  StreamError,
  ProtocolError
} = client;

try {
  const c = await V1Client.connect(url);
  const { stream } = await c.newSwapQuoteStream(params);

  for await (const quotes of stream) {
    console.log("Quotes:", quotes);
  }
} catch (err) {
  if (err instanceof ConnectionClosed) {
    console.error("Closed:", err.code, err.reason, err.wasClean);
  } else if (err instanceof ConnectionError) {
    console.error("Connection error:", err.cause);
  } else if (err instanceof ErrorResponse) {
    console.error("Server error:", err.response.code, err.response.message);
  } else if (err instanceof StreamError) {
    console.error("Stream error:", err.errorCode, err.errorMessage);
  } else if (err instanceof ProtocolError) {
    console.error("Protocol error:", err.reason);
  }
}
```

**Error Types:**
- `ConnectionClosed` - WebSocket closed (`code`, `reason`, `wasClean`)
- `ConnectionError` - WebSocket error (`cause`)
- `ErrorResponse` - Server rejected request (`response`)
- `StreamError` - Stream ended with error (`streamId`, `errorCode`, `errorMessage`)
- `ProtocolError` - Protocol error (`reason`, `data`) - report to developers

---

## Examples

See the [examples](./examples) directory for complete working examples:
- [basic.ts](./examples/basic.ts) - Complete example with swap quote streaming

---

## Links

- **GitHub Repository**: https://github.com/Titan-Pathfinder/titan-sdk-ts
- **API Documentation**: https://titan-exchange.gitbook.io/titan/titan-developer-docs/apis/swap-api

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.
