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


