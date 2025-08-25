import { encode } from '@msgpack/msgpack';

const esmUrl = process.argv[2];
if (!esmUrl) {
  console.error('Missing esm module path');
  process.exit(2);
}

const mod = await import(esmUrl);
const V1ClientCodec = (mod.codec && mod.codec.V1ClientCodec) ? mod.codec.V1ClientCodec : mod.V1ClientCodec;
if (!V1ClientCodec) {
  console.error('V1ClientCodec not found in ESM module exports');
  process.exit(1);
}

const serverMsg = {
  Response: {
    requestId: 0,
    data: {
      GetInfo: {
        protocolVersion: { major: 1, minor: 0, patch: 0 },
        settings: {
          quoteUpdate: { intervalMs: { min: 1, max: 2, default: 1 } },
          swap: { slippageBps: { min: 0, max: 1000, default: 50 }, onlyDirectRoutes: false, addSizeConstraint: false },
          transaction: { closeInputTokenAccount: false, createOutputTokenAccount: true }
        }
      }
    }
  }
};

const codec = V1ClientCodec.from_protocol('v1.api.titan.ag');
const packed = encode(serverMsg);
const decoded = await codec.decode(packed);
if (!decoded || !decoded.Response) {
  console.error('decode failed');
  process.exit(1);
}
console.log('OK');


