import { webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

// Ensure TextEncoder/TextDecoder exist (Node 18+ already does)
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}

