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
	| { StopStream: StopStreamRequest }
	| { GetVenues: GetVenuesRequest }
	| { ListProviders: ListProvidersRequest }
	| { GetSwapPrice: SwapPriceRequest };

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
	// The size constraint to use when `addSizeConstraint` is set.
	// Default is set by the server, but is normally set to a value slightly less
	// than the maximum transaction size of 1232 to allow room for additional
	// instructions, such as compute budgets and fee accounts.
	sizeConstraint?: number;
	// If set, limit quotes to the given set of provider IDs.
	providers?: string[];
}

export interface TransactionParams {
	// Public key of the user requesting the swap, needed for transaction generation.
	userPublicKey: Pubkey;
	// If true, close the input token account as part of the transaction.
	closeInputTokenAccount?: boolean;
	// If true, an idempotent ATA will be added to the transactions, if supported
	// by the providers.
	createOutputTokenAccount?: boolean;
	// The address of a token account for the output mint that will be used
	// to collect fees.
	// This account must already exist, or the user must add the ATA creation
	// instruction themselves.
	feeAccount?: Pubkey;
	// Fee amount to take, in basis points.
	//
	// If not specified, default fee for the requester is used.
	feeBps?: number;
	// Whether the fee should be taken in terms of the input mint.
	// Default is false, in which case the fee is taken in terms of the output mint.
	feeFromInputMint?: boolean;
	// Address of the token account into which to place the output of the swap.
	// If not specified, the funds will be deposited into an ATA associated with the user's
	// wallet.
	outputAccount?: Pubkey;
}

export interface QuoteUpdateParams {
	// How often the server should send updates for this quote request, in milliseconds.
	//
	// If not specified, the server default will be used.
	intervalMs?: Uint64;
	num_quotes: number;
}

export interface StopStreamRequest {
	// ID of the stream to stop.
	id: number;
}

export interface GetVenuesRequest {
	includeProgramIds?: boolean;
}

export interface ListProvidersRequest {
	// Whether or not to include icon URLs for each provider.
	// By default, icons are not included.
	includeIcons?: boolean;
}

export interface SwapPriceRequest {
	/** Address of the input mint of the swap. */
	inputMint: Pubkey;
	/** Address of the desired output token for the swap. */
	outputMint: Pubkey;
	/** Raw number of tokens to swap, not scaled by decimals. */
	amount: Uint64;
	/** If set, constrain quotes to the given set of DEXes.
	 *
	 * Note: setting both `dexes` and `exclude_dexes` may result in excluding all dexes, resulting
	 * in no routes.
	 */
	dexes?: string[];
	/** If set, exclude the following DEXes when determining routes.
	 *
	 * Note: setting both `dexes` and `exclude_dexes` may result in excluding all dexes, resulting
	 * in no routes.
	 */
	excludeDexes?: string[];
}

/****** Server Messages ******/

export type ServerMessage =
	| { Response: ResponseSuccess }
	| { Error: ResponseError }
	| { StreamData: StreamData }
	| { StreamEnd: StreamEnd };

export type ResponseData =
	| { GetInfo: ServerInfo }
	| { NewSwapQuoteStream: QuoteSwapStreamResponse }
	| { StreamStopped: StopStreamResponse }
	| { GetVenues: VenueInfo }
	| { ListProviders: ProviderInfo[] }
	| { GetSwapPrice: SwapPrice };

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

export type StreamDataPayload = { SwapQuotes: SwapQuotes };

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
		min: number;
		max: number;
		default: number;
	};
	num_quotes: {
		min: number;
		max: number;
		default: number;
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

export interface ConnectionSettings {
	// Number of concurrent streams the user is allowed.
	concurrentStreams: number;
}

export interface ServerSettings {
	// Settings and parameter bounds for quote updates.
	quoteUpdate: QuoteUpdateSettings;
	// Settings and parameter bounds for swaps.
	swap: SwapSettings;
	// Settings and parameter bounds for transaction generation.
	transaction: TransactionSettings;
	// Settings and limits for the user's connection to the server.
	connection: ConnectionSettings;
}

export interface ServerInfo {
	/// Server protocol version information.
	protocolVersion: VersionInfo;
	// Server settings and parameter bounds.
	settings: ServerSettings;
}

export interface QuoteSwapStreamResponse {
	// The interval, in milliseconds, in which the server will provide updates to the quotes.
	intervalMs: number;
}

export interface StopStreamResponse {
	// Identifier of the stream that was stopped.
	id: number;
}

export interface VenueInfo {
	labels: string[];
	programIds?: Pubkey[];
}

export interface ProviderInfo {
	id: string;
	name: string;
	kind: ProviderKind;
	iconUri48?: string;
}

export type ProviderKind = "DexAggregator" | "RFQ";

export interface SwapQuotes {
	// Unique Quote identifier.
	id: string;
	// Address of the input mint for this quote.
	inputMint: Uint8Array;
	// Address of the output mint for this quote.
	outputMint: Uint8Array;
	// What swap mode was used for the quotes.
	swapMode: SwapMode;
	// Amount used for the quotes.
	amount: number;
	// A mapping of a provider identifier to their quoted route.
	quotes: { [key: string]: SwapRoute };
}

export interface SwapRoute {
	// How many input tokens are expected to go through this route.
	inAmount: number;
	// How many output tokens are expected to come out of this route.
	outAmount: number;
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
	contextSlot?: number;
	// Amount of time taken to generate the quote in nanoseconds; if known.
	timeTaken?: number;
	// If this route expires by time, the time at which it expires,
	// as a millisecond UNIX timestamp.
	expiresAtMs?: number;
	// If this route expires by slot, the last slot at which the route is valid.
	expiresAfterSlot?: number;
	// The number of compute units this transaction is expected to consume, if known.
	computeUnits?: number;
	// Recommended number of compute units to use for the budget for this route, if known.
	// The number of compute units used by a route can fluctuate based on changes on-chain,
	// so the server will recommend a higher limit that should allow the transaction to execute
	// in the vast majority of cases.
	computeUnitsSafe?: number;
	// Transaction for the user to sign, if instructions not provided.
	transaction?: Uint8Array;
	// Provider-specific reference ID for this quote.
	//
	// Mainly provided by RFQ-based providers such as Pyth Express Relay and Hashflow.
	referenceId?: string;
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
	inAmount: number;
	// How many output tokens are expected to come out of this step.
	outAmount: number;
	// What what proportion, in parts per billion, of the order flow is allocated
	// to flow through this pool.
	allocPpb: number;
	// Address of the mint in which the fee is charged.
	feeMint?: Uint8Array;
	// The amount of tokens charged as a fee for this swap.
	feeAmount?: number;
	// Context slot for the pool data, if known.
	contextSlot?: number;
}

export interface PlatformFee {
	/// Amount of tokens taken as a fee.
	amount: number;
	/// Fee percentage, in basis points.
	fee_bps: number;
}

export interface SwapPrice {
	/** Identifier for this particular set of prices. */
	id: string,
	/** Address of the input mint for this price. */
	inputMint: Pubkey,
	/** Address of the output mint for this price. */
	outputMint: Pubkey,
	/** Amount that was used for the price. */
	amountIn: Uint64,
	/** The amount out of the best simulated quote for pricing. */
	amountOut: Uint64,
}