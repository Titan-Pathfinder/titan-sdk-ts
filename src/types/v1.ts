import type { Pubkey, Instruction, SwapMode } from "./common";

export const WEBSOCKET_SUBPROTO_BASE = "v1.api.titan.ag";

export const WEBSOCKET_SUBPROTOCOLS = [
	`${WEBSOCKET_SUBPROTO_BASE}+zstd`,
	`${WEBSOCKET_SUBPROTO_BASE}+brotli`,
	`${WEBSOCKET_SUBPROTO_BASE}+gzip`,
	WEBSOCKET_SUBPROTO_BASE,
];

/****** Client Requests ******/

/**
 * Denotes the type is encoded as an unsigned 64-bit integer.
 *
 * This can be decoded by MessagePack as either a normal number (if less than 53 bits),
 * otherwise it is decoded as a BigInt for accuracy.
 */
export type Uint64 = number | bigint;

/**
 * Request sent by the client to the server.
 */
export interface ClientRequest {
	id: number;
	data: RequestData;
}

export type RequestData =
	| { GetInfo: GetInfoRequest }
	| { NewSwapQuoteStream: SwapQuoteRequest }
	| { StopStream: StopStreamRequest };

export type GetInfoRequest = { [k: string]: never };

export interface SwapQuoteRequest {
	// Parameters for the swap.
	swap: SwapParams;
	// Parameters for transaction generation.
	transaction: TransactionParams;
	// Parameters for the stream of quote updates.
	update?: QuoteUpdateParams;
}

export interface SwapParams {
	// Address of input mint for the swap.
	inputMint: Pubkey;
	// Address of output mint of the swap.
	outputMint: Pubkey;
	// Raw number of tokens to swap, not scaled by decimals.
	// Whether this is in terms of the input or
	// output depends on the value of swapMode.
	amount: Uint64;
	// Whether amount is in terms of inputMint or outputMint.
	// Defaults to ExactIn.
	swapMode?: SwapMode;
	// Maximum allowed slippage, in basis points.
	slippageBps?: number;
	// If set, constrain quotes to the given set of DEXes.
	dexes?: string[];
	// If set, exclude the following DEXes when determining routes.
	excludeDexes?: string[];
	// If true, only direct routes between the input and output mint will be considered.
	onlyDirectRoutes?: boolean;
	// If set to true, only quotes that fit within 1232 bytes are returned.
	addSizeConstraint?: boolean;
}

export interface TransactionParams {
	// Public key of the user requesting the swap, needed for transaction generation.
	userPublicKey: Pubkey;
	// If true, close the input token account as part of the transaction.
	closeInputTokenAccount?: boolean;
	// If true, an idempotent ATA will be added to the transactions, if supported
	// by the providers.
	createOutputTokenAccount?: boolean;
}

export interface QuoteUpdateParams {
	// How often the server should send updates for this quote request, in milliseconds.
	//
	// If not specified, the server default will be used.
	intervalMs?: Uint64;
}

export interface StopStreamRequest {
	// ID of the stream to stop.
	id: number;
}

/****** Server Messages ******/

// Note: not an ideal representation, but TypeScript doesn't really seem to like
// defining an exeternally tagged enumeration as a discriminated union, or at
// least I am unsure of how to do that effectively.
export interface ServerMessage {
	Response?: ResponseSuccess;
	Error?: ResponseError;
	StreamData?: StreamData;
	StreamEnd?: StreamEnd;
}

export interface ResponseData {
	GetInfo?: ServerInfo;
	NewSwapQuoteStream?: QuoteSwapStreamResponse;
	StreamStopped?: StopStreamResponse;
}

export enum StreamDataType {
	SwapQuotes = "SwapQuotes",
}

export interface StreamStart {
	// ID of the stream. All StreamData and StreamEnd messages for this stream will
	// be tagged with this ID.
	id: number;
	// Data type that will be encoded in the stream.
	dataType: StreamDataType;
}

export interface ResponseSuccess {
	// Identifier of the request that triggered this response.
	requestId: number;
	// The response data.
	data: ResponseData;
	// If the request started a new stream, contains information about the stream.
	stream?: StreamStart;
}

export interface ResponseError {
	// Identifier of the request that triggered this response.
	requestId: number;
	// A numeric error code representing the specific error that occurred.
	code: number;
	// A message describing the error.
	message: string;
}

export interface StreamDataPayload {
	SwapQuotes?: SwapQuotes;
}

export interface StreamData {
	// ID of the stream.
	id: number;
	// Sequence number of this data packet.
	seq: number;
	// Data payload.
	payload: StreamDataPayload;
}

export interface StreamEnd {
	// Id of the stream that has ended.
	id: number;
	// If the stream ended due to an error, the following fields will contain
	// the numeric error code as well as a message describing the error.
	errorCode?: number;
	errorMessage?: string;
}

export interface VersionInfo {
	/// Major version number.
	major: number;
	/// Minor version number.
	minor: number;
	/// Patch version number.
	patch: number;
}

export interface QuoteUpdateSettings {
	// Bounds and default for `intervalMs` parameter.
	intervalMs: {
		min: Uint64;
		max: Uint64;
		default: Uint64;
	};
}

export interface SwapSettings {
	// Default and bounds for `slippageBps``
	slippageBps: { min: number; max: number; default: number };
	// Default value for `onlyDirectRoutes`
	onlyDirectRoutes: boolean;
	// Default value for `addSizeConstraint`
	addSizeConstraint: boolean;
}

export interface TransactionSettings {
	// Default value for `closeInputTokenAccount` field for transaction params.
	closeInputTokenAccount: boolean;
	// Default value for `createOutputTokenAccount` field for transaction params.
	createOutputTokenAccount: boolean;
}

export interface ServerSettings {
	// Settings and parameter bounds for quote updates.
	quoteUpdate: QuoteUpdateSettings;
	// Settings and parameter bounds for swaps.
	swap: SwapSettings;
	// Settings and parameter bounds for transaction generation.
	transaction: TransactionSettings;
}

export interface ServerInfo {
	/// Server protocol version information.
	protocolVersion: VersionInfo;
	// Server settings and parameter bounds.
	settings: ServerSettings;
}

export interface QuoteSwapStreamResponse {
	// The interval, in milliseconds, in which the server will provide updates to the quotes.
	intervalMs: Uint64;
}

export interface StopStreamResponse {
	// Identifier of the stream that was stopped.
	id: number;
}

export interface SwapQuotes {
	// Address of the input mint for this quote.
	inputMint: Uint8Array;
	// Address of the output mint for this quote.
	outputMint: Uint8Array;
	// What swap mode was used for the quotes.
	swapMode: SwapMode;
	// Amount used for the quotes.
	amount: Uint64;
	// A mapping of a provider identifier to their quoted route.
	quotes: { [key: string]: SwapRoute };
}

export interface SwapRoute {
	// How many input tokens are expected to go through this route.
	inAmount: Uint64;
	// How many output tokens are expected to come out of this route.
	outAmount: Uint64;
	// Amount of slippage encurred, in basis points.
	slippageBps: number;
	// Platform fee information; if such a fee is charged by the provider.
	platformFee?: PlatformFee;
	// Topologically ordered DAG containing the steps that comprise this route.
	steps: RoutePlanStep[];
	// Instructions needed to execute the route.
	instructions: Instruction[];
	// Address lookup tables necessary to load.
	addressLookupTables: Pubkey[];
	// Context slot for the route provided.
	contextSlot?: Uint64;
	// Amount of time taken to generate the quote in nanoseconds; if known.
	timeTaken?: Uint64;
	// If this route expires by time, the time at which it expires,
	// as a millisecond UNIX timestamp.
	expiresAtMs?: Uint64;
	// If this route expires by slot, the last slot at which the route is valid.
	expiresAfterSlot?: Uint64;
}

export interface RoutePlanStep {
	// Which AMM is being executed on at this step.
	ammKey: Uint8Array;
	// Label for the protocol being used.
	//
	// Examples: "Raydium AMM", "Phoenix", etc.
	label: string;
	// Address of the input mint for this swap.
	inputMint: Uint8Array;
	// Address of the output mint for this swap.
	outputMint: Uint8Array;
	// How many input tokens are expected to go through this step.
	inAmount: Uint64;
	// How many output tokens are expected to come out of this step.
	outAmount: Uint64;
	// What what proportion, in parts per billion, of the order flow is allocated
	// to flow through this pool.
	allocPpb: number;
	// Address of the mint in which the fee is charged.
	feeMint?: Pubkey;
	// The amount of tokens charged as a fee for this swap.
	feeAmount?: number;
	// Context slot for the pool data, if known.
	contextSlot?: number;
}

export interface PlatformFee {
	/// Amount of tokens taken as a fee.
	amount: Uint64;
	/// Fee percentage, in basis points.
	fee_bps: number;
}