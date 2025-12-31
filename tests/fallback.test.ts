import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createFallbackCredential,
  deriveKeyFromAssertion,
  encryptWithFallback,
  decryptWithFallback
} from '@/lib/auth/fallback';

const signatureBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
// Mock authenticatorData (37 bytes: 32-byte RP ID hash + 1 byte flags + 4-byte counter)
const authenticatorDataBuffer = new Uint8Array(37).fill(0).buffer;

type NavigatorMocks = {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const setupNavigatorMocks = (): NavigatorMocks => {
  const create = vi.fn();
  const get = vi.fn().mockResolvedValue({
    response: {
      authenticatorData: authenticatorDataBuffer,
      signature: signatureBuffer
    }
  });

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create, get }
  });

  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');

  return { create, get };
};

describe('Fallback WebAuthn helpers', () => {
  let navigatorMocks: NavigatorMocks;

  beforeEach(() => {
    vi.restoreAllMocks();
    navigatorMocks = setupNavigatorMocks();
  });

  it('creates fallback credential without PRF', async () => {
    const rawId = new Uint8Array([10, 20, 30, 40]).buffer;
    navigatorMocks.create.mockResolvedValue({
      rawId
    });

    const credential = await createFallbackCredential({
      userId: 'user@example.com',
      userName: 'User',
      keyName: 'Fallback Key'
    });

    expect(credential.type).toBe('fallback-pbkdf2');
    expect(credential.prfEnabled).toBe(false);
    expect(credential.credentialId).toBeDefined();
    expect(credential.metadata?.userAgent).toContain('Macintosh');
  });

  it('derives deterministic key material from assertion', async () => {
    const credentialId = 'AQID'; // base64url for 0x01 0x02 0x03

    const key = await deriveKeyFromAssertion(credentialId, new Uint8Array(32).fill(5));

    expect(key).toHaveLength(32);
    expect(navigatorMocks.get).toHaveBeenCalledTimes(1);
  });

  it('encrypts and decrypts using fallback credential', async () => {
    const rawId = new Uint8Array([1, 2, 3]).buffer;
    navigatorMocks.create.mockResolvedValue({
      rawId
    });

    const credential = await createFallbackCredential({
      userId: 'fallback@example.com',
      userName: 'Fallback User',
      keyName: 'Fallback Key'
    });

    const fileLike = {
      arrayBuffer: async () => new TextEncoder().encode('DocProtect').buffer,
      type: 'text/plain',
      name: 'doc.txt',
      size: 10
    } as File;

    const encrypted = await encryptWithFallback(fileLike, credential);

    expect(encrypted.encryptedData.length).toBeGreaterThan(0);
    expect(encrypted.salt.length).toBe(32);

    const decrypted = await decryptWithFallback(
      encrypted.encryptedData,
      encrypted.salt,
      credential
    );

    expect(new TextDecoder().decode(decrypted)).toBe('DocProtect');

    const getCalls = navigatorMocks.get.mock.calls;
    expect(getCalls).toHaveLength(2);
    expect(getCalls[0][0].publicKey.challenge).toBe(encrypted.salt);
    expect(getCalls[1][0].publicKey.challenge).toBe(encrypted.salt);
  });
});

