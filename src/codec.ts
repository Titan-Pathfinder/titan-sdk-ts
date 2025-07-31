import {
	gzip,
	gunzip,
	brotliCompress,
	brotliDecompress,
	zstdCompress,
	zstdDecompress,
} from "http-encoding";
import { Encoder, Decoder } from "@msgpack/msgpack";

import {
	type ClientRequest,
	type ServerMessage,
	WEBSOCKET_SUBPROTO_BASE,
} from "./types/v1";

interface Compressor {
	name(): string | null;
	compress(data: Uint8Array): Promise<Uint8Array>;
	decompress(data: Uint8Array): Promise<Uint8Array>;
}

class NullCompressor implements Compressor {
	name(): string | null {
		return null;
	}
	compress(data: Uint8Array): Promise<Uint8Array> {
		return Promise.resolve(data);
	}
	decompress(data: Uint8Array): Promise<Uint8Array> {
		return Promise.resolve(data);
	}
}

class GzipCompressor implements Compressor {
	name(): string | null {
		return "gzip";
	}
	compress(data: Uint8Array): Promise<Uint8Array> {
		return gzip(data);
	}
	decompress(data: Uint8Array): Promise<Uint8Array> {
		return gunzip(data);
	}
}

class BrotliCompressor implements Compressor {
	name(): string | null {
		return "brotli";
	}
	compress(data: Uint8Array): Promise<Uint8Array> {
		return brotliCompress(data);
	}
	decompress(data: Uint8Array): Promise<Uint8Array> {
		return brotliDecompress(data);
	}
}

class ZstdCompressor implements Compressor {
	name(): string | null {
		return "zstd";
	}
	compress(data: Uint8Array): Promise<Uint8Array> {
		return zstdCompress(data);
	}
	decompress(data: Uint8Array): Promise<Uint8Array> {
		return zstdDecompress(data);
	}
}

/**
 * Error thrown when failing to decode a message from the server.
 */
export class DecodeError extends Error {
	/**
	 * Reason why the decoding was not possible.
	 */
	reason: string;
	/**
	 * The decoded value that cause the issue.
	 */
	value: unknown;

	constructor(value: unknown, reason: string) {
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
export class InvalidProtocolError extends Error {
	constructor(protocol: string, reason: string) {
		super(`Invalid protocol '${protocol}': ${reason}`);
		this.name = "InvalidProtocolError";
		Object.setPrototypeOf(this, InvalidProtocolError.prototype);
	}
}

export class V1ClientCodec {
	private compressor: Compressor;
	private encoder: Encoder;
	private decoder: Decoder;

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
	static from_protocol(protocol: string): V1ClientCodec {
		if (!protocol.startsWith(WEBSOCKET_SUBPROTO_BASE)) {
			throw new InvalidProtocolError(
				protocol,
				`does not start with ${WEBSOCKET_SUBPROTO_BASE}`,
			);
		}
		const encoding = protocol.substring(WEBSOCKET_SUBPROTO_BASE.length);
		let compressor: Compressor;
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
				throw new InvalidProtocolError(
					protocol,
					`unknown encoding ${encoding}`,
				);
		}
		return new V1ClientCodec(compressor);
	}

	/**
	 * Constructs a new client codec using the given compression scheme.
	 */
	constructor(compressor: Compressor) {
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
	compression(): string | null {
		return this.compressor.name();
	}

	/**
	 * Encodes the given client request to binary, with compression if enabled.
	 */
	encode(message: ClientRequest): Promise<Uint8Array> {
		const encoded = this.encoder.encode(message);
		return this.compressor.compress(encoded);
	}

	/**
	 * Attempts to decode the given buffer as a server message, by first decompressing
	 * then decoding the data via MessasgePack.
	 *
	 * Performs some basic validation on the decoded message.
	 */
	async decode(data: Uint8Array): Promise<ServerMessage> {
		const decompressed = await this.compressor.decompress(data);
		const decoded = this.decoder.decode(decompressed);
		if (decoded === null) {
			throw new DecodeError(decoded, "decoded value was null");
		}
		if (typeof decoded !== "object") {
			throw new DecodeError(
				decoded,
				`value decoded to ${typeof decoded}, expected object`,
			);
		}
		if (Array.isArray(decoded)) {
			throw new DecodeError(decoded, "got array, expected object");
		}
		return decoded as ServerMessage;
	}
}