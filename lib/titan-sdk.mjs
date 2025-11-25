import { gzip, gunzip, brotliCompress, brotliDecompress, zstdCompress, zstdDecompress } from 'http-encoding';
import { Encoder, Decoder } from '@msgpack/msgpack';
import pkg from 'websocket';

// This module contains defintions for wire format interfaces used across
// multiple modules or versions of the protocol.
/**
 * Type of swap to perform.
 */
var SwapMode;
(function (SwapMode) {
    /**
     * Amount specifed is the exact input amount, slippage is on output.
     */
    SwapMode["ExactIn"] = "ExactIn";
    /**
     * Amount specified is the exact output amount, slippage is on input.
     */
    SwapMode["ExactOut"] = "ExactOut";
})(SwapMode || (SwapMode = {}));

var common = /*#__PURE__*/Object.freeze({
    __proto__: null,
    get SwapMode () { return SwapMode; }
});

const WEBSOCKET_SUBPROTO_BASE = "v1.api.titan.ag";
const WEBSOCKET_SUBPROTOCOLS = [
    `${WEBSOCKET_SUBPROTO_BASE}+zstd`,
    `${WEBSOCKET_SUBPROTO_BASE}+brotli`,
    `${WEBSOCKET_SUBPROTO_BASE}+gzip`,
    WEBSOCKET_SUBPROTO_BASE,
];
var StreamDataType;
(function (StreamDataType) {
    StreamDataType["SwapQuotes"] = "SwapQuotes";
})(StreamDataType || (StreamDataType = {}));

var v1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    get StreamDataType () { return StreamDataType; },
    WEBSOCKET_SUBPROTOCOLS: WEBSOCKET_SUBPROTOCOLS,
    WEBSOCKET_SUBPROTO_BASE: WEBSOCKET_SUBPROTO_BASE
});

var index = /*#__PURE__*/Object.freeze({
    __proto__: null,
    common: common,
    v1: v1
});

class NullCompressor {
    name() {
        return null;
    }
    compress(data) {
        return Promise.resolve(data);
    }
    decompress(data) {
        return Promise.resolve(data);
    }
}
class GzipCompressor {
    name() {
        return "gzip";
    }
    compress(data) {
        return gzip(data);
    }
    decompress(data) {
        return gunzip(data);
    }
}
class BrotliCompressor {
    name() {
        return "brotli";
    }
    compress(data) {
        return brotliCompress(data);
    }
    decompress(data) {
        return brotliDecompress(data);
    }
}
class ZstdCompressor {
    name() {
        return "zstd";
    }
    compress(data) {
        return zstdCompress(data);
    }
    decompress(data) {
        return zstdDecompress(data);
    }
}
/**
 * Error thrown when failing to decode a message from the server.
 */
class DecodeError extends Error {
    /**
     * Reason why the decoding was not possible.
     */
    reason;
    /**
     * The decoded value that cause the issue.
     */
    value;
    constructor(value, reason) {
        super(`Failed to decode server message: ${reason}`);
        this.name = "DecodeError";
        Object.setPrototypeOf(this, DecodeError.prototype);
        this.reason = reason;
        this.value = value;
    }
}
/**
 * Thrown when constructing a client codec from an invalid protocol string.
 */
class InvalidProtocolError extends Error {
    constructor(protocol, reason) {
        super(`Invalid protocol '${protocol}': ${reason}`);
        this.name = "InvalidProtocolError";
        Object.setPrototypeOf(this, InvalidProtocolError.prototype);
    }
}
class V1ClientCodec {
    compressor;
    encoder;
    decoder;
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
    static from_protocol(protocol) {
        if (!protocol.startsWith(WEBSOCKET_SUBPROTO_BASE)) {
            throw new InvalidProtocolError(protocol, `does not start with ${WEBSOCKET_SUBPROTO_BASE}`);
        }
        const encoding = protocol.substring(WEBSOCKET_SUBPROTO_BASE.length);
        let compressor;
        switch (encoding) {
            case "":
                compressor = new NullCompressor();
                break;
            case "+zstd":
                compressor = new ZstdCompressor();
                break;
            case "+brotli":
                compressor = new BrotliCompressor();
                break;
            case "+gzip":
                compressor = new GzipCompressor();
                break;
            default:
                throw new InvalidProtocolError(protocol, `unknown encoding ${encoding}`);
        }
        return new V1ClientCodec(compressor);
    }
    /**
     * Constructs a new client codec using the given compression scheme.
     */
    constructor(compressor) {
        this.compressor = compressor;
        this.encoder = new Encoder({
            useBigInt64: true,
        });
        this.decoder = new Decoder({
            useBigInt64: true,
        });
    }
    /**
     * Returns the name of the compression algorithm used, or null if no
     * compression is enabled.
     */
    compression() {
        return this.compressor.name();
    }
    /**
     * Encodes the given client request to binary, with compression if enabled.
     */
    encode(message) {
        const encoded = this.encoder.encode(message);
        return this.compressor.compress(encoded);
    }
    /**
     * Attempts to decode the given buffer as a server message, by first decompressing
     * then decoding the data via MessasgePack.
     *
     * Performs some basic validation on the decoded message.
     */
    async decode(data) {
        const decompressed = await this.compressor.decompress(data);
        const decoded = this.decoder.decode(decompressed);
        if (decoded === null) {
            throw new DecodeError(decoded, "decoded value was null");
        }
        if (typeof decoded !== "object") {
            throw new DecodeError(decoded, `value decoded to ${typeof decoded}, expected object`);
        }
        if (Array.isArray(decoded)) {
            throw new DecodeError(decoded, "got array, expected object");
        }
        return decoded;
    }
}

var codec = /*#__PURE__*/Object.freeze({
    __proto__: null,
    DecodeError: DecodeError,
    InvalidProtocolError: InvalidProtocolError,
    V1ClientCodec: V1ClientCodec
});

// Runtime constructor
const WebSocket = pkg.w3cwebsocket;

// Polyfill Promise.withResolvers if not available.
// Implementation based on the example from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
if (typeof Promise.withResolvers === 'undefined') {
    Object.assign(Promise, {
        withResolvers: () => {
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        }
    });
}
/**
 * Error returned if the request or stream was cancelled due to the underlying
 * connection closing.
 */
class ConnectionClosed extends Error {
    code;
    reason;
    wasClean;
    constructor(event) {
        super(`Client WebSocket closed with code ${event.code}: ${event.reason}`);
        this.name = "ConnectionClosed";
        Object.setPrototypeOf(this, ConnectionClosed.prototype);
        this.code = event.code;
        this.reason = event.reason;
        this.wasClean = event.wasClean;
    }
}
/**
 * Error returned if the request or stream was cancelled due to the underlying
 * connection experiencing an error.
 */
class ConnectionError extends Error {
    constructor(cause) {
        super("Client WebSocket encountered error");
        this.name = "ConnectionError";
        this.cause = cause;
        Object.setPrototypeOf(this, ConnectionError.prototype);
    }
}
/**
 * Represents an error returned by the server in response to a request.
 */
class ErrorResponse extends Error {
    /**
     * The error response that resulted from the request.
     */
    response;
    constructor(response) {
        super(`Request ${response.requestId} failed with code ${response.code}: ${response.message}`);
        this.name = "ErrorResponse";
        Object.setPrototypeOf(this, ErrorResponse.prototype);
        this.response = response;
    }
}
/**
 * Represents an error that terminated a stream.
 */
class StreamError extends Error {
    streamId;
    errorCode;
    errorMessage;
    constructor(packet) {
        const code = packet.errorCode ? packet.errorCode : 0;
        const message = packet.errorMessage ? packet.errorMessage : "";
        super(`Stream ${packet.id} ended with error code ${code}: ${message}`);
        this.name = "StreamError";
        Object.setPrototypeOf(this, StreamError.prototype);
        this.streamId = packet.id;
        this.errorCode = code;
        this.errorMessage = message;
    }
}
/**
 * Represents a protocol-level error, usually an error in the server or client
 * implementation.
 */
class ProtocolError extends Error {
    /** Message explaining what went wrong */
    reason;
    /** Any associated data that helps explain what happened */
    data;
    constructor(data, reason) {
        super(`Protocol error, please report to the Titan developers: ${reason}`);
        this.name = "ProtocolError";
        Object.setPrototypeOf(this, ProtocolError.prototype);
        this.data = data;
        this.reason = reason;
    }
}
var ResponseHandlerKind;
(function (ResponseHandlerKind) {
    ResponseHandlerKind["GetInfo"] = "GetInfo";
    ResponseHandlerKind["StopStream"] = "StopStream";
    ResponseHandlerKind["NewSwapQuoteStream"] = "NewSwapQuoteStream";
    ResponseHandlerKind["GetVenues"] = "GetVenues";
    ResponseHandlerKind["ListProviders"] = "ListProviders";
    ResponseHandlerKind["GetSwapPrice"] = "GetSwapPrice";
})(ResponseHandlerKind || (ResponseHandlerKind = {}));
// Base class for response handlers.
// By default rejects all results with the result being wrong, so that subclasses can
// implement only their own handler.
class ResponseHandler {
    _kind;
    rejector;
    constructor(kind, rejector) {
        this._kind = kind;
        this.rejector = rejector;
    }
    get kind() {
        return this._kind;
    }
    reject(reason) {
        this.rejector(reason);
    }
    resolveGetInfo(result) {
        this.reject(new ProtocolError(result, `incorrect result type (ServerInfo) for handler of kind ${this.kind}`));
    }
    resolveStopStream(result) {
        this.reject(new ProtocolError(result, `incorrect type (StopStreamResponse) for handler of kind ${this.kind}`));
    }
    resolveNewSwapQuoteStream(result) {
        this.reject(new ProtocolError(result, `incorrect type (QuoteSwapStreamResponse) for handler of kind ${this.kind}`));
    }
    resolveGetVenues(result) {
        this.reject(new ProtocolError(result, `incorrect type (VenueInfo) for handler of kind ${this.kind}`));
    }
    resolveListProviders(result) {
        this.reject(new ProtocolError(result, `incorrect type (ProviderInfo[]) for handler of kind ${this.kind}`));
    }
    resolveGetSwapPrice(result) {
        this.reject(new ProtocolError(result, `incorrect type (SwapPrice) for handler of kind ${this.kind}`));
    }
}
class ServerInfoResponseHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.GetInfo, rejector);
        this.resolver = resolver;
    }
    resolveGetInfo(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new ServerInfoResponseHandler(resolve, reject);
        return { promise, handler };
    }
}
class StopStreamResponseHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.StopStream, rejector);
        this.resolver = resolver;
    }
    resolveStopStream(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new StopStreamResponseHandler(resolve, reject);
        return { promise, handler };
    }
}
class NewSwapQuoteStreamHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.NewSwapQuoteStream, rejector);
        this.resolver = resolver;
    }
    resolveNewSwapQuoteStream(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new NewSwapQuoteStreamHandler(resolve, reject);
        return { promise, handler };
    }
}
class VenueInfoResponseHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.GetVenues, rejector);
        this.resolver = resolver;
    }
    resolveGetVenues(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new VenueInfoResponseHandler(resolve, reject);
        return { promise, handler };
    }
}
class ProviderInfoResponseHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.ListProviders, rejector);
        this.resolver = resolver;
    }
    resolveListProviders(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new ProviderInfoResponseHandler(resolve, reject);
        return { promise, handler };
    }
}
class GetSwapPriceResponseHandler extends ResponseHandler {
    resolver;
    constructor(resolver, rejector) {
        super(ResponseHandlerKind.GetSwapPrice, rejector);
        this.resolver = resolver;
    }
    resolveGetSwapPrice(result) {
        this.resolver(result);
    }
    static create() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const handler = new GetSwapPriceResponseHandler(resolve, reject);
        return { promise, handler };
    }
}
class V1Client {
    socket;
    codec;
    nextId;
    _closed;
    _closing;
    _closeEvent;
    results;
    quoteStreams;
    streamStopping;
    closeListeners;
    static connect(url) {
        const ws = new WebSocket(url, WEBSOCKET_SUBPROTOCOLS);
        ws.binaryType = "arraybuffer";
        const { promise, resolve, reject } = Promise.withResolvers();
        ws.onopen = () => {
            if (!ws.protocol) {
                reject(new InvalidProtocolError("", "no protocol selected during handshake"));
                return;
            }
            try {
                const codec = V1ClientCodec.from_protocol(ws.protocol);
                const client = new V1Client(ws, codec);
                resolve(client);
            }
            catch (err) {
                reject(err);
            }
        };
        ws.onerror = (err) => {
            reject(err);
        };
        return promise;
    }
    constructor(socket, codec) {
        this.socket = socket;
        this.codec = codec;
        this.nextId = 0;
        this.results = new Map();
        this.quoteStreams = new Map();
        this.streamStopping = new Map();
        this._closed = false;
        this._closing = false;
        this._closeEvent = null;
        this.closeListeners = [];
        this.socket.onmessage = (message) => {
            this.handleMessage(message);
        };
        this.socket.onclose = (event) => {
            this.handleClose(event);
        };
        this.socket.onerror = (event) => {
            this.handleError(event);
        };
    }
    nextRequestId() {
        const id = this.nextId;
        this.nextId += 1;
        return id;
    }
    /**
     * Returns true if the underlying WebSocket connection is closed.
     */
    get closed() {
        return this._closed;
    }
    /**
     * Returns a promise that resolves when the underlying WebSocket connection is closed.
     */
    listen_closed() {
        if (this._closeEvent === null) {
            let { promise, resolve, reject } = Promise.withResolvers();
            this.closeListeners.push({ resolve, reject });
            return promise;
        }
        return Promise.resolve(this._closeEvent);
    }
    /**
     * Closes the WebSocket if it is not already closed.
     *
     * @returns A promise that is resolved when the WebSocket is closed.
     */
    close() {
        let promise = this.listen_closed();
        // Start closing socket if not already closed or closing.
        if (!this._closing && !this._closed) {
            this._closing = true;
            this.socket.close();
        }
        return promise;
    }
    /**
     * Requests the server stop a running stream with the given ID.
     *
     * Alternatively, you may call {@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/cancel | the cancel() method}
     * method on the stream.
     *
     * @param streamId - The ID of the stream to stop.
     * @returns A promise that completes once the stream has been stopped.
     */
    stopStream(streamId) {
        const requestId = this.nextRequestId();
        const { promise, handler } = StopStreamResponseHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                StopStream: {
                    id: streamId,
                },
            },
        };
        this.sendMessage(message);
        return promise;
    }
    /**
     * Requests information from the server regarding protocol version and settings.
     *
     * @returns A promise that is resolved with the requested information.
     */
    getInfo() {
        const requestId = this.nextRequestId();
        const { promise, handler } = ServerInfoResponseHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                GetInfo: {},
            },
        };
        this.sendMessage(message);
        return promise;
    }
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
    newSwapQuoteStream(params) {
        const requestId = this.nextRequestId();
        const { promise, handler } = NewSwapQuoteStreamHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                NewSwapQuoteStream: params,
            },
        };
        this.sendMessage(message);
        return promise;
    }
    /**
     * Requests a list of venues from the server.
     *
     * @param params - (optional) includeProgramIds - Whether to include program ID for each venue..
     *
     * @returns A promise that is resolved with the list of venues.
     */
    getVenues(params) {
        const requestId = this.nextRequestId();
        const { promise, handler } = VenueInfoResponseHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                GetVenues: params || {},
            },
        };
        this.sendMessage(message);
        return promise;
    }
    /**
     * Requests a list of providers from the server.
     *
     * @param params - (optional) includeIcons - Whether to include icons in the response.
     *
     * @returns A promise that is resolved with the list of providers.
     */
    listProviders(params) {
        const requestId = this.nextRequestId();
        const { promise, handler } = ProviderInfoResponseHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                ListProviders: params || {},
            },
        };
        this.sendMessage(message);
        return promise;
    }
    /**
     * Requests pricing information for a swap between two tokens at a given input amount.
     *
     * @param params - Parameters for the swap to be quoted.
     * @returns A promise that is resolved with the quote information.
     */
    getSwapPrice(params) {
        const requestId = this.nextRequestId();
        const { promise, handler } = GetSwapPriceResponseHandler.create();
        this.results.set(requestId, handler);
        const message = {
            id: requestId,
            data: {
                GetSwapPrice: params,
            },
        };
        this.sendMessage(message);
        return promise;
    }
    // Sends the message on the socket, rejecting the promise if there is any encoding error.
    sendMessage(message) {
        this.codec
            .encode(message)
            .then((data) => {
            this.socket.send(data);
        })
            .catch((err) => {
            this.rejectWithError(message.id, err);
        });
    }
    handleMessage(message) {
        if (message.data instanceof ArrayBuffer) {
            const data = new Uint8Array(message.data, 0, message.data.byteLength);
            this.codec
                .decode(data)
                .then((message) => {
                this.handleServerMessage(message);
            })
                .catch((error) => {
                if (error instanceof Error) {
                    this.handleError(error);
                }
                else {
                    this.handleError(new DecodeError(data, `got unknown error: ${error}`));
                }
                this.socket.close(1002, "failed to decode message");
            });
        }
    }
    handleServerMessage(message) {
        if ("Response" in message) {
            this.handleResponseSuccess(message.Response);
        }
        else if ("Error" in message) {
            this.handleResponseError(message.Error);
        }
        else if ("StreamData" in message) {
            this.handleStreamData(message.StreamData);
        }
        else if ("StreamEnd" in message) {
            this.handleStreamEnd(message.StreamEnd);
        }
        else {
            console.warn("unhandled message type, keys:", Object.getOwnPropertyNames(message));
        }
    }
    handleResponseSuccess(message) {
        const handler = this.results.get(message.requestId);
        if (handler === undefined) {
            console.error("Got response for unknown request ID", message);
            return;
        }
        this.results.delete(message.requestId);
        if ("GetInfo" in message.data) {
            handler.resolveGetInfo(message.data.GetInfo);
        }
        else if ("NewSwapQuoteStream" in message.data) {
            const streamInfo = message.stream;
            if (streamInfo === undefined) {
                handler.reject(new ProtocolError(message, "No stream associated with NewSwapQuoteStream response"));
            }
            else {
                const stream = new ReadableStream({
                    start: (controller) => {
                        this.quoteStreams.set(streamInfo.id, controller);
                    },
                    cancel: (reason) => {
                        return this.handleStreamCancel(streamInfo.id, reason);
                    },
                });
                const result = {
                    response: message.data.NewSwapQuoteStream,
                    stream: stream,
                    streamId: streamInfo.id,
                };
                handler.resolveNewSwapQuoteStream(result);
            }
        }
        else if ("GetVenues" in message.data) {
            handler.resolveGetVenues(message.data.GetVenues);
        }
        else if ("ListProviders" in message.data) {
            handler.resolveListProviders(message.data.ListProviders);
        }
        else if ("StreamStopped" in message.data) {
            handler.resolveStopStream(message.data.StreamStopped);
        }
        else if ("GetSwapPrice" in message.data) {
            handler.resolveGetSwapPrice(message.data.GetSwapPrice);
        }
        else {
            const response_type = Object.keys(message.data).at(0) || "<none>";
            handler.reject(new ProtocolError(message, `unknown resonse type ${response_type} for handler of type ${handler.kind}`));
        }
    }
    async handleStreamCancel(streamId, reason) {
        if (this.streamStopping.get(streamId) || !this.quoteStreams.has(streamId)) {
            // Stream already in process of stopping or has already stopped.
            return;
        }
        this.streamStopping.set(streamId, true);
        console.log("Requested to cancel stream %i with reason: %s", streamId, reason);
        await this.stopStream(streamId);
    }
    handleResponseError(error) {
        const executor = this.results.get(error.requestId);
        if (executor === undefined) {
            console.error("Got error response for unknown request ID", error);
            return;
        }
        this.results.delete(error.requestId);
        executor.reject(new ErrorResponse(error));
    }
    handleStreamData(packet) {
        const controller = this.quoteStreams.get(packet.id);
        if (controller === undefined) {
            console.error("Got stream data for unknown stream", packet);
            return;
        }
        if (packet.payload.SwapQuotes !== undefined) {
            controller.enqueue(packet.payload.SwapQuotes);
        }
        else {
            console.error("Stream data has unknown payload type", packet);
        }
    }
    handleStreamEnd(packet) {
        const controller = this.quoteStreams.get(packet.id);
        if (controller === undefined) {
            console.error("Got stream end for unknown stream", packet);
            return;
        }
        this.quoteStreams.delete(packet.id);
        this.streamStopping.delete(packet.id);
        if (packet.errorCode !== undefined) {
            controller.error(new StreamError(packet));
        }
        else {
            controller.close();
        }
    }
    rejectAllWithError(error) {
        // Reject any pending requests
        this.results.forEach((value) => {
            value.reject(error);
        });
        this.results.clear();
        // Close any pending streams.
        for (const stream of this.quoteStreams.values()) {
            stream.error(error);
        }
        this.quoteStreams.clear();
        this.streamStopping.clear();
    }
    handleClose(event) {
        this._closed = true;
        const error = new ConnectionClosed(event);
        this.rejectAllWithError(error);
        for (const listener of this.closeListeners) {
            listener.resolve(event);
        }
        this.closeListeners = [];
    }
    handleError(error) {
        const new_error = new ConnectionError(error);
        this.rejectAllWithError(new_error);
        this.socket.close(1002); // protocol error
    }
    rejectWithError(requestId, error) {
        const executor = this.results.get(requestId);
        if (executor === undefined) {
            console.error("Tried to reject untracked request %i with error", requestId, error);
            return;
        }
        this.results.delete(requestId);
        executor.reject(error);
    }
}

var client = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ConnectionClosed: ConnectionClosed,
    ConnectionError: ConnectionError,
    ErrorResponse: ErrorResponse,
    ProtocolError: ProtocolError,
    StreamError: StreamError,
    V1Client: V1Client
});

export { V1Client, client, codec, index as types };
