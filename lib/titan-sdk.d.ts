import { ICloseEvent, w3cwebsocket } from 'websocket';

/**
 * A Solana account public key.
 *
 * Encoded as binary data of length 32. This just gets decoded as a Uint8Array
 * by msgpack.
 */
type Pubkey = Uint8Array;
/**
 * Solana account metadata for an instruction.
 *
 * Has a custom encoding for
 */
interface AccountMeta {
    /**
     * Public key for the account.
     */
    p: Pubkey;
    /**
     * Whether the account is a signer on the instruction.
     */
    s: boolean;
    /**
     * Whether the account is writable on the transaction.
     */
    w: boolean;
}
/**
 * A single instruction to be executed as part of a transaction.
 */
interface Instruction {
    /**
     * Public key of the program executing the transaction.
     */
    p: Pubkey;
    /**
     * Account metadata for the transaction.
     */
    a: AccountMeta[];
    /**
     * Transaction data.
     */
    d: Uint8Array;
}
/**
 * Type of swap to perform.
 */
declare enum SwapMode {
    /**
     * Amount specifed is the exact input amount, slippage is on output.
     */
    ExactIn = "ExactIn",
    /**
     * Amount specified is the exact output amount, slippage is on input.
     */
    ExactOut = "ExactOut"
}

type common_AccountMeta = AccountMeta;
type common_Instruction = Instruction;
type common_Pubkey = Pubkey;
type common_SwapMode = SwapMode;
declare const common_SwapMode: typeof SwapMode;
declare namespace common {
  export { common_SwapMode as SwapMode };
  export type { common_AccountMeta as AccountMeta, common_Instruction as Instruction, common_Pubkey as Pubkey };
}

declare const WEBSOCKET_SUBPROTO_BASE = "v1.api.titan.ag";
declare const WEBSOCKET_SUBPROTOCOLS: string[];
/****** Client Requests ******/
/**
 * Denotes the type is encoded as an unsigned 64-bit integer.
 *
 * This can be decoded by MessagePack as either a normal number (if less than 53 bits),
 * otherwise it is decoded as a BigInt for accuracy.
 */
type Uint64 = number | bigint;
/**
 * Request sent by the client to the server.
 */
interface ClientRequest {
    id: number;
    data: RequestData;
}
type RequestData = {
    GetInfo: GetInfoRequest;
} | {
    NewSwapQuoteStream: SwapQuoteRequest;
} | {
    StopStream: StopStreamRequest;
};
type GetInfoRequest = {
    [k: string]: never;
};
interface SwapQuoteRequest {
    swap: SwapParams;
    transaction: TransactionParams;
    update?: QuoteUpdateParams;
}
interface SwapParams {
    inputMint: Pubkey;
    outputMint: Pubkey;
    amount: Uint64;
    swapMode?: SwapMode;
    slippageBps?: number;
    dexes?: string[];
    excludeDexes?: string[];
    onlyDirectRoutes?: boolean;
    addSizeConstraint?: boolean;
}
interface TransactionParams {
    userPublicKey: Pubkey;
    closeInputTokenAccount?: boolean;
    createOutputTokenAccount?: boolean;
}
interface QuoteUpdateParams {
    intervalMs?: Uint64;
}
interface StopStreamRequest {
    id: number;
}
/****** Server Messages ******/
interface ServerMessage {
    Response?: ResponseSuccess;
    Error?: ResponseError;
    StreamData?: StreamData;
    StreamEnd?: StreamEnd;
}
interface ResponseData {
    GetInfo?: ServerInfo;
    NewSwapQuoteStream?: QuoteSwapStreamResponse;
    StreamStopped?: StopStreamResponse;
}
declare enum StreamDataType {
    SwapQuotes = "SwapQuotes"
}
interface StreamStart {
    id: number;
    dataType: StreamDataType;
}
interface ResponseSuccess {
    requestId: number;
    data: ResponseData;
    stream?: StreamStart;
}
interface ResponseError {
    requestId: number;
    code: number;
    message: string;
}
interface StreamDataPayload {
    SwapQuotes?: SwapQuotes;
}
interface StreamData {
    id: number;
    seq: number;
    payload: StreamDataPayload;
}
interface StreamEnd {
    id: number;
    errorCode?: number;
    errorMessage?: string;
}
interface VersionInfo {
    major: number;
    minor: number;
    patch: number;
}
interface QuoteUpdateSettings {
    intervalMs: {
        min: Uint64;
        max: Uint64;
        default: Uint64;
    };
}
interface SwapSettings {
    slippageBps: {
        min: number;
        max: number;
        default: number;
    };
    onlyDirectRoutes: boolean;
    addSizeConstraint: boolean;
}
interface TransactionSettings {
    closeInputTokenAccount: boolean;
    createOutputTokenAccount: boolean;
}
interface ServerSettings {
    quoteUpdate: QuoteUpdateSettings;
    swap: SwapSettings;
    transaction: TransactionSettings;
}
interface ServerInfo {
    protocolVersion: VersionInfo;
    settings: ServerSettings;
}
interface QuoteSwapStreamResponse {
    intervalMs: Uint64;
}
interface StopStreamResponse {
    id: number;
}
interface SwapQuotes {
    inputMint: Uint8Array;
    outputMint: Uint8Array;
    swapMode: SwapMode;
    amount: Uint64;
    quotes: {
        [key: string]: SwapRoute;
    };
}
interface SwapRoute {
    inAmount: Uint64;
    outAmount: Uint64;
    slippageBps: number;
    platformFee?: PlatformFee;
    steps: RoutePlanStep[];
    instructions: Instruction[];
    addressLookupTables: Pubkey[];
    contextSlot?: Uint64;
    timeTaken?: Uint64;
    expiresAtMs?: Uint64;
    expiresAfterSlot?: Uint64;
}
interface RoutePlanStep {
    ammKey: Uint8Array;
    label: string;
    inputMint: Uint8Array;
    outputMint: Uint8Array;
    inAmount: Uint64;
    outAmount: Uint64;
    allocPpb: number;
    feeMint?: Pubkey;
    feeAmount?: number;
    contextSlot?: number;
}
interface PlatformFee {
    amount: Uint64;
    fee_bps: number;
}

type v1_ClientRequest = ClientRequest;
type v1_GetInfoRequest = GetInfoRequest;
type v1_PlatformFee = PlatformFee;
type v1_QuoteSwapStreamResponse = QuoteSwapStreamResponse;
type v1_QuoteUpdateParams = QuoteUpdateParams;
type v1_QuoteUpdateSettings = QuoteUpdateSettings;
type v1_RequestData = RequestData;
type v1_ResponseData = ResponseData;
type v1_ResponseError = ResponseError;
type v1_ResponseSuccess = ResponseSuccess;
type v1_RoutePlanStep = RoutePlanStep;
type v1_ServerInfo = ServerInfo;
type v1_ServerMessage = ServerMessage;
type v1_ServerSettings = ServerSettings;
type v1_StopStreamRequest = StopStreamRequest;
type v1_StopStreamResponse = StopStreamResponse;
type v1_StreamData = StreamData;
type v1_StreamDataPayload = StreamDataPayload;
type v1_StreamDataType = StreamDataType;
declare const v1_StreamDataType: typeof StreamDataType;
type v1_StreamEnd = StreamEnd;
type v1_StreamStart = StreamStart;
type v1_SwapParams = SwapParams;
type v1_SwapQuoteRequest = SwapQuoteRequest;
type v1_SwapQuotes = SwapQuotes;
type v1_SwapRoute = SwapRoute;
type v1_SwapSettings = SwapSettings;
type v1_TransactionParams = TransactionParams;
type v1_TransactionSettings = TransactionSettings;
type v1_Uint64 = Uint64;
type v1_VersionInfo = VersionInfo;
declare const v1_WEBSOCKET_SUBPROTOCOLS: typeof WEBSOCKET_SUBPROTOCOLS;
declare const v1_WEBSOCKET_SUBPROTO_BASE: typeof WEBSOCKET_SUBPROTO_BASE;
declare namespace v1 {
  export { v1_StreamDataType as StreamDataType, v1_WEBSOCKET_SUBPROTOCOLS as WEBSOCKET_SUBPROTOCOLS, v1_WEBSOCKET_SUBPROTO_BASE as WEBSOCKET_SUBPROTO_BASE };
  export type { v1_ClientRequest as ClientRequest, v1_GetInfoRequest as GetInfoRequest, v1_PlatformFee as PlatformFee, v1_QuoteSwapStreamResponse as QuoteSwapStreamResponse, v1_QuoteUpdateParams as QuoteUpdateParams, v1_QuoteUpdateSettings as QuoteUpdateSettings, v1_RequestData as RequestData, v1_ResponseData as ResponseData, v1_ResponseError as ResponseError, v1_ResponseSuccess as ResponseSuccess, v1_RoutePlanStep as RoutePlanStep, v1_ServerInfo as ServerInfo, v1_ServerMessage as ServerMessage, v1_ServerSettings as ServerSettings, v1_StopStreamRequest as StopStreamRequest, v1_StopStreamResponse as StopStreamResponse, v1_StreamData as StreamData, v1_StreamDataPayload as StreamDataPayload, v1_StreamEnd as StreamEnd, v1_StreamStart as StreamStart, v1_SwapParams as SwapParams, v1_SwapQuoteRequest as SwapQuoteRequest, v1_SwapQuotes as SwapQuotes, v1_SwapRoute as SwapRoute, v1_SwapSettings as SwapSettings, v1_TransactionParams as TransactionParams, v1_TransactionSettings as TransactionSettings, v1_Uint64 as Uint64, v1_VersionInfo as VersionInfo };
}

declare const index_common: typeof common;
declare const index_v1: typeof v1;
declare namespace index {
  export {
    index_common as common,
    index_v1 as v1,
  };
}

interface Compressor {
    name(): string | null;
    compress(data: Uint8Array): Promise<Uint8Array>;
    decompress(data: Uint8Array): Promise<Uint8Array>;
}
/**
 * Error thrown when failing to decode a message from the server.
 */
declare class DecodeError extends Error {
    /**
     * Reason why the decoding was not possible.
     */
    reason: string;
    /**
     * The decoded value that cause the issue.
     */
    value: unknown;
    constructor(value: unknown, reason: string);
}
/**
 * Thrown when constructing a client codec from an invalid protocol string.
 */
declare class InvalidProtocolError extends Error {
    constructor(protocol: string, reason: string);
}
declare class V1ClientCodec {
    private compressor;
    private encoder;
    private decoder;
    /**
     * Constructs a new coded from the given protocol string.
     *
     * The protocol should be in the form "v1.api.titan.ag[+<comp>]" where `<comp>`
     * is an optional compression scheme.
     *
     * The currently supported protocol strings are:
     *
     * - v1.api.titan.ag
     * - v1.api.titan.ag+zstd
     * - v1.api.titan.ag+brotli
     * - v1.api.titan.ag+gzip
     */
    static from_protocol(protocol: string): V1ClientCodec;
    /**
     * Constructs a new client codec using the given compression scheme.
     */
    constructor(compressor: Compressor);
    /**
     * Returns the name of the compression algorithm used, or null if no
     * compression is enabled.
     */
    compression(): string | null;
    /**
     * Encodes the given client request to binary, with compression if enabled.
     */
    encode(message: ClientRequest): Promise<Uint8Array>;
    /**
     * Attempts to decode the given buffer as a server message, by first decompressing
     * then decoding the data via MessasgePack.
     *
     * Performs some basic validation on the decoded message.
     */
    decode(data: Uint8Array): Promise<ServerMessage>;
}

type codec_DecodeError = DecodeError;
declare const codec_DecodeError: typeof DecodeError;
type codec_InvalidProtocolError = InvalidProtocolError;
declare const codec_InvalidProtocolError: typeof InvalidProtocolError;
type codec_V1ClientCodec = V1ClientCodec;
declare const codec_V1ClientCodec: typeof V1ClientCodec;
declare namespace codec {
  export {
    codec_DecodeError as DecodeError,
    codec_InvalidProtocolError as InvalidProtocolError,
    codec_V1ClientCodec as V1ClientCodec,
  };
}

/**
 * Error returned if the request or stream was cancelled due to the underlying
 * connection closing.
 */
declare class ConnectionClosed extends Error {
    code: number;
    reason: string;
    wasClean: boolean;
    constructor(event: ICloseEvent);
}
/**
 * Error returned if the request or stream was cancelled due to the underlying
 * connection experiencing an error.
 */
declare class ConnectionError extends Error {
    constructor(cause: Error);
}
/**
 * Represents an error returned by the server in response to a request.
 */
declare class ErrorResponse extends Error {
    /**
     * The error response that resulted from the request.
     */
    response: ResponseError;
    constructor(response: ResponseError);
}
/**
 * Represents an error that terminated a stream.
 */
declare class StreamError extends Error {
    streamId: number;
    errorCode: number;
    errorMessage: string;
    constructor(packet: StreamEnd);
}
/**
 * Represents a protocol-level error, usually an error in the server or client
 * implementation.
 */
declare class ProtocolError extends Error {
    /** Message explaining what went wrong */
    reason: string;
    /** Any associated data that helps explain what happened */
    data: unknown;
    constructor(data: unknown, reason: string);
}
/**
 * Resolved value of requests that result in a stream.
 */
interface ResponseWithStream<T, D> {
    response: T;
    stream: ReadableStream<D>;
}
declare class V1Client {
    private socket;
    private codec;
    private nextId;
    private _closed;
    private results;
    private quoteStreams;
    private streamStopping;
    static connect(url: string): Promise<V1Client>;
    constructor(socket: w3cwebsocket, codec: V1ClientCodec);
    private nextRequestId;
    /**
     * Returns true if the underlying WebSocket connection is closed.
     */
    get closed(): boolean;
    /**
     * Requests the server stop a running stream with the given ID.
     *
     * Alternatively, you may call {@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/cancel | the cancel() method}
     * method on the stream.
     *
     * @param streamId - The ID of the stream to stop.
     * @returns A promise that completes once the stream has been stopped.
     */
    stopStream(streamId: number): Promise<StreamEnd>;
    /**
     * Requests information from the server regarding protocol version and settings.
     *
     * @returns A promise that is resolved with the requested information.
     */
    getInfo(): Promise<ServerInfo>;
    /**
     * Requests that the server start a new stream of quotes for a given swap.
     *
     * @param params - The parameters for the swap to be quoted.
     * @returns A promise that is resolved once the quote stream is initialized.
     *
     * The resolved value contains both the response, which contains information that
     * may have been filled in with defaults (such as the update interval), as well as
     * a {@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream | ReadableStream}
     * that will stream the current best quote for each provider.
     */
    newSwapQuoteStream(params: SwapQuoteRequest): Promise<ResponseWithStream<QuoteSwapStreamResponse, SwapQuotes>>;
    private sendMessage;
    private handleMessage;
    private handleServerMessage;
    private handleResponseSuccess;
    private handleStreamCancel;
    private handleResponseError;
    private handleStreamData;
    private handleStreamEnd;
    private rejectAllWithError;
    private handleClose;
    private handleError;
    private rejectWithError;
}

type client_ConnectionClosed = ConnectionClosed;
declare const client_ConnectionClosed: typeof ConnectionClosed;
type client_ConnectionError = ConnectionError;
declare const client_ConnectionError: typeof ConnectionError;
type client_ErrorResponse = ErrorResponse;
declare const client_ErrorResponse: typeof ErrorResponse;
type client_ProtocolError = ProtocolError;
declare const client_ProtocolError: typeof ProtocolError;
type client_ResponseWithStream<T, D> = ResponseWithStream<T, D>;
type client_StreamError = StreamError;
declare const client_StreamError: typeof StreamError;
type client_V1Client = V1Client;
declare const client_V1Client: typeof V1Client;
declare namespace client {
  export { client_ConnectionClosed as ConnectionClosed, client_ConnectionError as ConnectionError, client_ErrorResponse as ErrorResponse, client_ProtocolError as ProtocolError, client_StreamError as StreamError, client_V1Client as V1Client };
  export type { client_ResponseWithStream as ResponseWithStream };
}

export { V1Client, client, codec, index as types };
