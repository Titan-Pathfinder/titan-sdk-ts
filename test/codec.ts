import * as fs from "node:fs/promises";
import { encode, decode } from "@msgpack/msgpack";
import * as httpEncoding from "http-encoding";

import { V1ClientCodec, InvalidProtocolError, DecodeError } from "../src/codec";
import type { ClientRequest } from "../src/types/v1";

describe("V1ClientCodec", () => {
	describe("from_protocol", () => {
		test("should fail with invalid protocol", () => {
			expect(() => V1ClientCodec.from_protocol("badproto")).toThrow(
				InvalidProtocolError,
			);
		});
		test("should work with no compression", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			expect(codec.compression()).toBeNull();
		});
		test("should work with zstd compression", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+zstd");
			expect(codec.compression()).toBe("zstd");
		});
		test("should work with brotli compression", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+brotli");
			expect(codec.compression()).toBe("brotli");
		});
		test("should work with gzip compression", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+gzip");
			expect(codec.compression()).toBe("gzip");
		});
		test("should fail with an invalid compression scheme", () => {
			expect(() =>
				V1ClientCodec.from_protocol("v1.api.titan.ag+deflate"),
			).toThrow(InvalidProtocolError);
		});
	});
	describe("decode", () => {
		test("can decode uncompressed stream data", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			const data = await fs.readFile("test/data/stream_data.msgpack");
			const decoded = await codec.decode(data);
			expect(decoded).not.toBeNull();
			expect(typeof decoded).toBe("object");
			expect(Object.keys(decoded)).toStrictEqual(["StreamData"]);
		});
		test("can decode zstd-compressed stream data", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+zstd");
			const data = await fs.readFile("test/data/stream_data.msgpack.zstd");
			const decoded = await codec.decode(data);
			expect(decoded).not.toBeNull();
			expect(typeof decoded).toBe("object");
			expect(Object.keys(decoded)).toStrictEqual(["StreamData"]);
		});
		test("can decode brotli-compressed stream data", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+brotli");
			const data = await fs.readFile("test/data/stream_data.msgpack.brotli");
			const decoded = await codec.decode(data);
			expect(decoded).not.toBeNull();
			expect(typeof decoded).toBe("object");
			expect(Object.keys(decoded)).toStrictEqual(["StreamData"]);
		});
		test("can decode gzip-compressed stream data", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+gzip");
			const data = await fs.readFile("test/data/stream_data.msgpack.gz");
			const decoded = await codec.decode(data);
			expect(decoded).not.toBeNull();
			expect(typeof decoded).toBe("object");
			expect(Object.keys(decoded)).toStrictEqual(["StreamData"]);
		});
		test("fails on array", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			const data = encode([1, 2, 3]);
			expect(codec.decode(data)).rejects.toThrow(DecodeError);
		});
		test("fails on null", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			const data = encode(null);
			expect(codec.decode(data)).rejects.toThrow(DecodeError);
		});
		test("fails on non-object", () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			const data = encode(5);
			expect(codec.decode(data)).rejects.toThrow(DecodeError);
		});
	});
	describe("encode", () => {
		test("works uncompressed", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag");
			const msg: ClientRequest = {
				id: 0,
				data: {
					StopStream: { id: 1 },
				},
			};

			const encoded = await codec.encode(msg);
			expect(encoded).toBeInstanceOf(Uint8Array);

			const decoded = decode(encoded);
			expect(decoded).toStrictEqual(msg);
		});
		test("works zstd compressed", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+zstd");
			const msg: ClientRequest = {
				id: 0,
				data: {
					StopStream: { id: 1 },
				},
			};

			const encoded = await codec.encode(msg);
			expect(encoded).toBeInstanceOf(Uint8Array);

			const decompressed = await httpEncoding.zstdDecompress(encoded);
			const decoded = decode(decompressed);
			expect(decoded).toStrictEqual(msg);
		});
		test("works brotli compressed", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+brotli");
			const msg: ClientRequest = {
				id: 0,
				data: {
					StopStream: { id: 1 },
				},
			};

			const encoded = await codec.encode(msg);
			expect(encoded).toBeInstanceOf(Uint8Array);

			const decompressed = await httpEncoding.brotliDecompress(encoded);
			const decoded = decode(decompressed);
			expect(decoded).toStrictEqual(msg);
		});
		test("works gzip compressed", async () => {
			const codec = V1ClientCodec.from_protocol("v1.api.titan.ag+gzip");
			const msg: ClientRequest = {
				id: 0,
				data: {
					StopStream: { id: 1 },
				},
			};

			const encoded = await codec.encode(msg);
			expect(encoded).toBeInstanceOf(Uint8Array);

			const decompressed = await httpEncoding.gunzip(encoded);
			const decoded = decode(decompressed);
			expect(decoded).toStrictEqual(msg);
		});
	});
});
