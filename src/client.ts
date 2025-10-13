import { DecodeError, InvalidProtocolError, V1ClientCodec } from "./codec";

import { WebSocket, WebSocketInstance, IMessageEvent, ICloseEvent } from "./websocket";

import * as v1 from "./types/v1";

// Polyfill Promise.withResolvers if not available.
// Implementation based on the example from MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
if (typeof Promise.withResolvers === 'undefined') {
	Object.assign(Promise, {
		withResolvers: <T>() => {
			let resolve!: (value: T | PromiseLike<T>) => void;
			let reject!: (reason?: unknown) => void;
			const promise = new Promise<T>((res, rej) => {
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
export class ConnectionClosed extends Error {
	code: number;
	reason: string;
	wasClean: boolean;

	constructor(event: ICloseEvent) {
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
export class ConnectionError extends Error {
	constructor(cause: Error) {
		super("Client WebSocket encountered error");
		this.name = "ConnectionError";
		this.cause = cause;
		Object.setPrototypeOf(this, ConnectionError.prototype);
	}
}

/**
 * Represents an error returned by the server in response to a request.
 */
export class ErrorResponse extends Error {
	/**
	 * The error response that resulted from the request.
	 */
	response: v1.ResponseError;

	constructor(response: v1.ResponseError) {
		super(
			`Request ${response.requestId} failed with code ${response.code}: ${response.message}`,
		);
		this.name = "ErrorResponse";
		Object.setPrototypeOf(this, ErrorResponse.prototype);

		this.response = response;
	}
}

/**
 * Represents an error that terminated a stream.
 */
export class StreamError extends Error {
	streamId: number;
	errorCode: number;
	errorMessage: string;

	constructor(packet: v1.StreamEnd) {
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
export class ProtocolError extends Error {
	/** Message explaining what went wrong */
	reason: string;
	/** Any associated data that helps explain what happened */
	data: unknown;

	constructor(data: unknown, reason: string) {
		super(`Protocol error, please report to the Titan developers: ${reason}`);
		this.name = "ProtocolError";
		Object.setPrototypeOf(this, ProtocolError.prototype);

		this.data = data;
		this.reason = reason;
	}
}

type Resolver<T> = (result: T | PromiseLike<T>) => void;
type Rejector = (error?: unknown) => void;
type ResolverAndRejector<T> = {
	resolve: Resolver<T>,
	reject: Rejector,
};

enum ResponseHandlerKind {
	GetInfo = "GetInfo",
	StopStream = "StopStream",
	NewSwapQuoteStream = "NewSwapQuoteStream",
	GetVenues = "GetVenues",
	ListProviders = "ListProviders",
}

interface HandlerAndPromise<T> {
	promise: Promise<T>,
	handler: ResponseHandler
}

// Base class for response handlers.
// By default rejects all results with the result being wrong, so that subclasses can
// implement only their own handler.
abstract class ResponseHandler {
	private _kind: ResponseHandlerKind;
	private rejector: Rejector;

	constructor(kind: ResponseHandlerKind, rejector: Rejector) {
		this._kind = kind;
		this.rejector = rejector;
	}

	get kind(): ResponseHandlerKind {
		return this._kind;
	}

	reject(reason?: unknown) {
		this.rejector(reason);
	}

	resolveGetInfo(result: v1.ServerInfo) {
		this.reject(new ProtocolError(result, `incorrect result type (ServerInfo) for handler of kind ${this.kind}`));
	}

	resolveStopStream(result: v1.StopStreamResponse) {
		this.reject(new ProtocolError(result, `incorrect type (StopStreamResponse) for handler of kind ${this.kind}`));
	}

	resolveNewSwapQuoteStream(result: ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>) {
		this.reject(new ProtocolError(result, `incorrect type (QuoteSwapStreamResponse) for handler of kind ${this.kind}`))
	}

	resolveGetVenues(result: v1.VenueInfo) {
		this.reject(new ProtocolError(result, `incorrect type (VenueInfo) for handler of kind ${this.kind}`));
	}

	resolveListProviders(result: v1.ProviderInfo[]) {
		this.reject(new ProtocolError(result, `incorrect type (ProviderInfo[]) for handler of kind ${this.kind}`));
	}
}

class ServerInfoResponseHandler extends ResponseHandler {
	resolver: Resolver<v1.ServerInfo>;

	constructor(resolver: Resolver<v1.ServerInfo>, rejector: Rejector) {
		super(ResponseHandlerKind.GetInfo, rejector);
		this.resolver = resolver;
	}

	override resolveGetInfo(result: v1.ServerInfo): void {
		this.resolver(result);
	}

	static create(): HandlerAndPromise<v1.ServerInfo> {
		const { promise, resolve, reject } = Promise.withResolvers<v1.ServerInfo>();
		const handler = new ServerInfoResponseHandler(resolve, reject);
		return { promise, handler };
	}
}

class StopStreamResponseHandler extends ResponseHandler {
	resolver: Resolver<v1.StopStreamResponse>;

	constructor(resolver: Resolver<v1.StopStreamResponse>, rejector: Rejector) {
		super(ResponseHandlerKind.StopStream, rejector);
		this.resolver = resolver;
	}

	override resolveStopStream(result: v1.StopStreamResponse): void {
		this.resolver(result);
	}

	static create(): HandlerAndPromise<v1.StopStreamResponse> {
		const { promise, resolve, reject } = Promise.withResolvers<v1.StopStreamResponse>();
		const handler = new StopStreamResponseHandler(resolve, reject);
		return { promise, handler };
	}
}

class NewSwapQuoteStreamHandler extends ResponseHandler {
	resolver: Resolver<ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>>;

	constructor(resolver: Resolver<ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>>, rejector: Rejector) {
		super(ResponseHandlerKind.NewSwapQuoteStream, rejector);
		this.resolver = resolver;
	}

	override resolveNewSwapQuoteStream(result: ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>): void {
		this.resolver(result);
	}

	static create(): HandlerAndPromise<ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>> {
		const { promise, resolve, reject } = Promise.withResolvers<ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>>();
		const handler = new NewSwapQuoteStreamHandler(resolve, reject);
		return { promise, handler };
	}
}

class VenueInfoResponseHandler extends ResponseHandler {
	resolver: Resolver<v1.VenueInfo>;

	constructor(resolver: Resolver<v1.VenueInfo>, rejector: Rejector) {
		super(ResponseHandlerKind.GetVenues, rejector);
		this.resolver = resolver;
	}

	override resolveGetVenues(result: v1.VenueInfo): void {
		this.resolver(result);
	}

	static create(): HandlerAndPromise<v1.VenueInfo> {
		const { promise, resolve, reject } = Promise.withResolvers<v1.VenueInfo>();
		const handler = new VenueInfoResponseHandler(resolve, reject);
		return { promise, handler };
	}
}

class ProviderInfoResponseHandler extends ResponseHandler {
	resolver: Resolver<v1.ProviderInfo[]>;

	constructor(resolver: Resolver<v1.ProviderInfo[]>, rejector: Rejector) {
		super(ResponseHandlerKind.ListProviders, rejector);
		this.resolver = resolver;
	}

	override resolveListProviders(result: v1.ProviderInfo[]): void {
		this.resolver(result);
	}

	static create(): HandlerAndPromise<v1.ProviderInfo[]> {
		const { promise, resolve, reject } = Promise.withResolvers<v1.ProviderInfo[]>();
		const handler = new ProviderInfoResponseHandler(resolve, reject);
		return { promise, handler };
	}
}

/**
 * Resolved value of requests that result in a stream.
 */
export interface ResponseWithStream<T, D> {
	response: T;
	stream: ReadableStream<D>;
	streamId: number;
}

export class V1Client {
	private socket: WebSocketInstance;
	private codec: V1ClientCodec;
	private nextId: number;
	private _closed: boolean;
	private _closing: boolean;
	private _closeEvent: ICloseEvent | null;

	private results: Map<number, ResponseHandler>;
	private quoteStreams: Map<number, ReadableStreamDefaultController<v1.SwapQuotes>>;
	private streamStopping: Map<number, boolean>;
	private closeListeners: ResolverAndRejector<ICloseEvent>[];

	static connect(url: string): Promise<V1Client> {
		const ws: WebSocketInstance = new WebSocket(url, v1.WEBSOCKET_SUBPROTOCOLS);
		ws.binaryType = "arraybuffer";

		const { promise, resolve, reject } = Promise.withResolvers<V1Client>();

		ws.onopen = () => {
			if (!ws.protocol) {
				reject(
					new InvalidProtocolError("", "no protocol selected during handshake"),
				);
				return;
			}
			try {
				const codec = V1ClientCodec.from_protocol(ws.protocol);
				const client = new V1Client(ws, codec);
				resolve(client);
			} catch (err) {
				reject(err);
			}
		};
		ws.onerror = (err) => {
			reject(err);
		};

		return promise;
	}

	constructor(socket: WebSocketInstance, codec: V1ClientCodec) {
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

	private nextRequestId(): number {
		const id = this.nextId;
		this.nextId += 1;
		return id;
	}

	/**
	 * Returns true if the underlying WebSocket connection is closed.
	 */
	public get closed() {
		return this._closed;
	}

	/**
	 * Returns a promise that resolves when the underlying WebSocket connection is closed.
	 */
	public listen_closed(): Promise<ICloseEvent> {
		if (this._closeEvent === null) {
			let { promise, resolve, reject } = Promise.withResolvers<ICloseEvent>();
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
	public close(): Promise<ICloseEvent> {
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
	public stopStream(streamId: number): Promise<v1.StreamEnd> {
		const requestId = this.nextRequestId();
		const { promise, handler } = StopStreamResponseHandler.create();
		this.results.set(requestId, handler);

		const message: v1.ClientRequest = {
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
	public getInfo(): Promise<v1.ServerInfo> {
		const requestId = this.nextRequestId();
		const { promise, handler } = ServerInfoResponseHandler.create();
		this.results.set(requestId, handler);

		const message: v1.ClientRequest = {
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
	public newSwapQuoteStream(
		params: v1.SwapQuoteRequest,
	): Promise<ResponseWithStream<v1.QuoteSwapStreamResponse, v1.SwapQuotes>> {
		const requestId = this.nextRequestId();
		const { promise, handler } = NewSwapQuoteStreamHandler.create();
		this.results.set(requestId, handler);

		const message: v1.ClientRequest = {
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
	public getVenues(params?: v1.GetVenuesRequest): Promise<v1.VenueInfo> {
		const requestId = this.nextRequestId();
		const { promise, handler } = VenueInfoResponseHandler.create();
		this.results.set(requestId, handler);

		const message: v1.ClientRequest = {
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
	public listProviders(params?: v1.ListProvidersRequest): Promise<v1.ProviderInfo[]> {
		const requestId = this.nextRequestId();
		const { promise, handler } = ProviderInfoResponseHandler.create();
		this.results.set(requestId, handler);

		const message: v1.ClientRequest = {
			id: requestId,
			data: {
				ListProviders: params || {},
			},
		};
		this.sendMessage(message);

		return promise;
	}

	// Sends the message on the socket, rejecting the promise if there is any encoding error.
	private sendMessage(message: v1.ClientRequest) {
		this.codec
			.encode(message)
			.then((data) => {
				this.socket.send(data);
			})
			.catch((err) => {
				this.rejectWithError(message.id, err);
			});
	}

	private handleMessage(message: IMessageEvent) {
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
					} else {
						this.handleError(
							new DecodeError(data, `got unknown error: ${error}`),
						);
					}
					this.socket.close(1002, "failed to decode message");
				});
		}
	}

	private handleServerMessage(message: v1.ServerMessage) {
		if ("Response" in message) {
			this.handleResponseSuccess(message.Response);
		} else if ("Error" in message) {
			this.handleResponseError(message.Error);
		} else if ("StreamData" in message) {
			this.handleStreamData(message.StreamData);
		} else if ("StreamEnd" in message) {
			this.handleStreamEnd(message.StreamEnd);
		} else {
			console.warn(
				"unhandled message type, keys:",
				Object.getOwnPropertyNames(message),
			);
		}
	}

	private handleResponseSuccess(message: v1.ResponseSuccess) {
		const handler = this.results.get(message.requestId);
		if (handler === undefined) {
			console.error("Got response for unknown request ID", message);
			return;
		}
		this.results.delete(message.requestId);

		if ("GetInfo" in message.data) {
			handler.resolveGetInfo(message.data.GetInfo);
		} else if ("NewSwapQuoteStream" in message.data) {
			const streamInfo = message.stream;
			if (streamInfo === undefined) {
				handler.reject(
					new ProtocolError(
						message,
						"No stream associated with NewSwapQuoteStream response",
					),
				);
			} else {
				const stream = new ReadableStream({
					start: (controller) => {
						this.quoteStreams.set(streamInfo.id, controller);
					},
					cancel: (reason) => {
						return this.handleStreamCancel(streamInfo.id, reason);
					},
				});
				const result: ResponseWithStream<
					v1.QuoteSwapStreamResponse,
					v1.SwapQuotes
				> = {
					response: message.data.NewSwapQuoteStream,
					stream: stream,
					streamId: streamInfo.id,
				};
				handler.resolveNewSwapQuoteStream(result);
			}
		} else if ("GetVenues" in message.data) {
			handler.resolveGetVenues(message.data.GetVenues);
		} else if ("ListProviders" in message.data) {
			handler.resolveListProviders(message.data.ListProviders);
		}
		else if ("StreamStopped" in message.data) {
			handler.resolveStopStream(message.data.StreamStopped);
		} else {
			const response_type = Object.keys(message.data).at(0) || "<none>";
			handler.reject(new ProtocolError(message, `unknown resonse type ${response_type} for handler of type ${handler.kind}`));
		}
	}

	private async handleStreamCancel(
		streamId: number,
		reason?: string,
	): Promise<void> {
		if (this.streamStopping.get(streamId) || !this.quoteStreams.has(streamId)) {
			// Stream already in process of stopping or has already stopped.
			return;
		}
		this.streamStopping.set(streamId, true);
		console.log(
			"Requested to cancel stream %i with reason: %s",
			streamId,
			reason,
		);
		await this.stopStream(streamId);
	}

	private handleResponseError(error: v1.ResponseError) {
		const executor = this.results.get(error.requestId);
		if (executor === undefined) {
			console.error("Got error response for unknown request ID", error);
			return;
		}
		this.results.delete(error.requestId);
		executor.reject(new ErrorResponse(error));
	}

	private handleStreamData(packet: v1.StreamData) {
		const controller = this.quoteStreams.get(packet.id);
		if (controller === undefined) {
			console.error("Got stream data for unknown stream", packet);
			return;
		}
		if (packet.payload.SwapQuotes !== undefined) {
			controller.enqueue(packet.payload.SwapQuotes);
		} else {
			console.error("Stream data has unknown payload type", packet);
		}
	}

	private handleStreamEnd(packet: v1.StreamEnd) {
		const controller = this.quoteStreams.get(packet.id);
		if (controller === undefined) {
			console.error("Got stream end for unknown stream", packet);
			return;
		}
		this.quoteStreams.delete(packet.id);
		this.streamStopping.delete(packet.id);

		if (packet.errorCode !== undefined) {
			controller.error(new StreamError(packet));
		} else {
			controller.close();
		}
	}

	private rejectAllWithError(error: Error) {
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

	private handleClose(event: ICloseEvent) {
		this._closed = true;
		const error = new ConnectionClosed(event);
		this.rejectAllWithError(error);
		for (const listener of this.closeListeners) {
			listener.resolve(event);
		}
		this.closeListeners = [];
	}

	private handleError(error: Error) {
		this.socket.close(1002); // protocol error
		const new_error = new ConnectionError(error);
		this.rejectAllWithError(new_error);
	}

	private rejectWithError(requestId: number, error: unknown) {
		const executor = this.results.get(requestId);
		if (executor === undefined) {
			console.error(
				"Tried to reject untracked request %i with error",
				requestId,
				error,
			);
			return;
		}
		this.results.delete(requestId);
		executor.reject(error);
	}
}