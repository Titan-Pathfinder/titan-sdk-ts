import * as v1 from "../src/types/v1";

export class FakeWebSocket {
	protocol: string | null = v1.WEBSOCKET_SUBPROTO_BASE;
	binaryType = "arraybuffer";
	onopen?: () => void;
	onmessage?: (e: { data: ArrayBuffer }) => void;
	onclose?: (e: { code: number; reason?: string; wasClean: boolean }) => void;
	onerror?: (e: Error) => void;
	sent: Uint8Array[] = [];
	closed?: { code?: number; reason?: string };

	send = (data: Uint8Array) => {
		this.sent.push(data);
	};
	close = (code?: number, reason?: string) => {
		this.closed = { code, reason };
		this.onclose?.({ code: code ?? 1000, reason, wasClean: true });
	};

	emitBinary(buffer: ArrayBuffer) {
		this.onmessage?.({ data: buffer });
	}
}

export class StubCodec {
	encodedMessages: any[] = [];
	private decodeQueue: v1.ServerMessage[] = [];
	private nextDecodeErr?: Error;

	setNextDecode(messages: v1.ServerMessage[]) {
		this.decodeQueue.push(...messages);
	}
	setNextDecodeError(error: Error) {
		this.nextDecodeErr = error;
	}

	encode = async (message: any) => {
		this.encodedMessages.push(message);
		return new Uint8Array([1]);
	};
	decode = async (_data: Uint8Array): Promise<v1.ServerMessage> => {
		if (this.nextDecodeErr) {
			const err = this.nextDecodeErr;
			this.nextDecodeErr = undefined;
			throw err;
		}
		return this.decodeQueue.shift() ?? ({} as v1.ServerMessage);
	};
}

export function minimalServerInfo(): v1.ServerInfo {
	return {
		protocolVersion: { major: 1, minor: 0, patch: 0 },
		settings: {
			quoteUpdate: { intervalMs: { min: 100, max: 5000, default: 1000 } },
			swap: {
				slippageBps: { min: 0, max: 1000, default: 50 },
				onlyDirectRoutes: false,
				addSizeConstraint: false,
			},
			transaction: {
				closeInputTokenAccount: false,
				createOutputTokenAccount: true,
			},
		},
	};
}

export function minimalSwapQuotes(): v1.SwapQuotes {
	return {
		inputMint: new Uint8Array(32),
		outputMint: new Uint8Array(32),
		swapMode: "ExactIn" as any,
		amount: 10,
		quotes: {
			providerA: {
				inAmount: 10,
				outAmount: 9,
				slippageBps: 50,
				steps: [],
				instructions: [],
				addressLookupTables: [],
			},
		},
	};
}

// Emit helpers for unit tests
export function emitResponseGetInfo(socket: FakeWebSocket, codec: StubCodec, requestId: number, info: v1.ServerInfo) {
	codec.setNextDecode([{ Response: { requestId, data: { GetInfo: info } } }]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function emitResponseNewSwapQuoteStream(
	socket: FakeWebSocket,
	codec: StubCodec,
	requestId: number,
	streamId: number,
	intervalMs: number,
) {
	codec.setNextDecode([
		{
			Response: {
				requestId,
				data: { NewSwapQuoteStream: { intervalMs } },
				stream: { id: streamId, dataType: v1.StreamDataType.SwapQuotes },
			},
		},
	]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function emitResponseStopStream(
	socket: FakeWebSocket,
	codec: StubCodec,
	requestId: number,
	streamId: number,
) {
	codec.setNextDecode([{ Response: { requestId, data: { StreamStopped: { id: streamId } } } }]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function emitStreamData(socket: FakeWebSocket, codec: StubCodec, streamId: number, quotes: v1.SwapQuotes) {
	codec.setNextDecode([{ StreamData: { id: streamId, seq: 0, payload: { SwapQuotes: quotes } } }]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function emitStreamEnd(
	socket: FakeWebSocket,
	codec: StubCodec,
	streamId: number,
	errorCode?: number,
	errorMessage?: string,
) {
	codec.setNextDecode([{ StreamEnd: { id: streamId, errorCode, errorMessage } }]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function emitError(socket: FakeWebSocket, codec: StubCodec, requestId: number, code: number, message: string) {
	codec.setNextDecode([{ Error: { requestId, code, message } }]);
	socket.emitBinary(new Uint8Array([0]).buffer);
}

export function failNextDecode(socket: FakeWebSocket, codec: StubCodec, error: Error) {
	codec.setNextDecodeError(error);
	socket.emitBinary(new Uint8Array([0]).buffer);
}


