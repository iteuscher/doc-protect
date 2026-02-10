import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptFile, decryptFile } from '@/lib/crypto/encryption';
import type { RecipientInfo, DocProtectManifest } from '@/lib/types/bundle';
import type { WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { KeypairCredential } from '@/lib/types/encryption-credential';

const { createBundleMock, parseBundleMock, fallbackMocks } = vi.hoisted(() => {
  return {
    createBundleMock: vi.fn(async (manifest) => ({
      bundleId: 'bundle-1',
      blob: new Blob(),
      manifest,
      createdAt: new Date()
    })),
    parseBundleMock: vi.fn(),
    fallbackMocks: {
      encryptWithFallback: vi.fn(),
      decryptWithFallback: vi.fn(),
      isFallbackCredential: (credential: WebAuthnCredential | FallbackCredential | KeypairCredential) =>
        credential.type === 'fallback-pbkdf2'
    }
  };
});

vi.mock('@/lib/crypto/bundle', () => ({
  createBundle: createBundleMock,
  parseBundle: parseBundleMock
}));

vi.mock('@/lib/auth/fallback', () => fallbackMocks);

vi.mock('age-encryption', () => ({
  Encrypter: class {
    recipients: RecipientInfo[] = [];
    addRecipient(recipient: RecipientInfo) {
      this.recipients.push(recipient);
    }
    async encrypt(data: Uint8Array) {
      return data;
    }
  },
  Decrypter: class {
    async decrypt() {
      return new Uint8Array([104, 101, 108, 108, 111]);
    }
    addIdentity() {}
  },
  webauthn: {
    WebAuthnRecipient: class {},
    WebAuthnIdentity: class {}
  }
}));

const fallbackCredential: FallbackCredential = {
  credentialId: 'fallback-1',
  type: 'fallback-pbkdf2',
  keyName: 'Fallback Key',
  userId: 'user@example.com',
  userName: 'User',
  prfEnabled: false,
  createdAt: new Date().toISOString()
};

const fallbackManifest: DocProtectManifest = {
  version: '1.0.0',
  manifestVersion: 1,
  createdAt: new Date().toISOString(),
  fileInfo: {
    name: 'hello.txt',
    type: 'text/plain',
    encryptedSize: 3,
    originalSize: 3
  },
  encryptionInfo: {
    algorithm: 'age-fallback',
    format: 'age-encryption.org/v1',
    recipients: [
      { type: 'fallback-pbkdf2', credentialId: 'fallback-1', role: 'owner', salt: 'AAA=' }
    ]
  },
  policy: {
    uuid: '12345678-1234-5678-1234-567812345678',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    body: {
      dataAttributes: [],
      dissem: ['fallback-1']
    },
    abacRules: {
      enabled: false,
      rules: []
    }
  }
};

describe('Encryption engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encrypts file in fallback mode with salt in manifest', async () => {
    fallbackMocks.encryptWithFallback.mockResolvedValue({
      encryptedData: new Uint8Array([1, 2, 3]),
      salt: new Uint8Array([9, 9, 9])
    });

    const file = {
      name: 'hello.txt',
      type: 'text/plain',
      size: 5,
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer
    } as File;
    await encryptFile({
      file,
      ownerCredential: fallbackCredential,
      recipients: []
    });

    expect(fallbackMocks.encryptWithFallback).toHaveBeenCalled();
    expect(createBundleMock).toHaveBeenCalled();
    const manifest = createBundleMock.mock.calls[0][0];
    expect(manifest.encryptionInfo.algorithm).toBe('age-fallback');
    expect(manifest.warnings?.[0]).toContain('fallback');
  });

  it('decrypts fallback bundle with provided credential', async () => {
    parseBundleMock.mockResolvedValue({
      manifest: fallbackManifest,
      encryptedPayload: new Uint8Array([1, 2, 3]),
      bundleId: 'bundle-1'
    });

    fallbackMocks.decryptWithFallback.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const result = await decryptFile({
      bundle: {
        bundleId: 'bundle-1',
        blob: new Blob(),
        manifest: fallbackManifest,
        createdAt: new Date()
      },
      credential: fallbackCredential
    });

    expect(result.fileName).toBe('hello.txt');
    expect(fallbackMocks.decryptWithFallback).toHaveBeenCalled();
  });

  it('encrypts file with PQ keypair credential', async () => {
    const pqCredential: KeypairCredential = {
      type: 'pq-keypair',
      keypairId: 'pq-1',
      identity: 'AGE-SECRET-KEY-PQ-1TEST',
      recipient: 'age1pq1test...',
      label: 'Test PQ Key'
    };

    const file = {
      name: 'secret.txt',
      type: 'text/plain',
      size: 5,
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer
    } as File;

    await encryptFile({
      file,
      ownerCredential: pqCredential
    });

    expect(createBundleMock).toHaveBeenCalled();
    const manifest = createBundleMock.mock.calls[0][0];
    expect(manifest.encryptionInfo.algorithm).toBe('age-pq');
    expect(manifest.encryptionInfo.recipients[0].type).toBe('pq-hybrid');
    expect(manifest.encryptionInfo.recipients[0].publicKey).toBe('age1pq1test...');
  });

  it('encrypts file with x25519 keypair credential', async () => {
    const x25519Credential: KeypairCredential = {
      type: 'x25519-keypair',
      keypairId: 'x-1',
      identity: 'AGE-SECRET-KEY-1TEST',
      recipient: 'age1test...',
      label: 'Test x25519 Key'
    };

    const file = {
      name: 'secret.txt',
      type: 'text/plain',
      size: 5,
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer
    } as File;

    await encryptFile({
      file,
      ownerCredential: x25519Credential
    });

    expect(createBundleMock).toHaveBeenCalled();
    const manifest = createBundleMock.mock.calls[0][0];
    expect(manifest.encryptionInfo.algorithm).toBe('age-x25519');
    expect(manifest.encryptionInfo.recipients[0].type).toBe('x25519');
    expect(manifest.encryptionInfo.recipients[0].publicKey).toBe('age1test...');
  });

  it('decrypts PQ-encrypted bundle with keypair credential', async () => {
    const pqManifest: DocProtectManifest = {
      version: '1.0.0',
      manifestVersion: 1,
      createdAt: new Date().toISOString(),
      fileInfo: {
        name: 'secret.txt',
        type: 'text/plain',
        encryptedSize: 5,
        originalSize: 5
      },
      encryptionInfo: {
        algorithm: 'age-pq',
        format: 'age-encryption.org/v1',
        recipients: [
          { type: 'pq-hybrid', publicKey: 'age1pq1test...', identity: 'AGE-SECRET-KEY-PQ-1TEST', role: 'owner', label: 'Test PQ Key' }
        ]
      },
      policy: {
        uuid: '12345678-1234-5678-1234-567812345678',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        body: { dataAttributes: [], dissem: ['age1pq1test...'] },
        abacRules: { enabled: false, rules: [] }
      }
    };

    parseBundleMock.mockResolvedValue({
      manifest: pqManifest,
      encryptedPayload: new Uint8Array([1, 2, 3]),
      bundleId: 'bundle-pq-1'
    });

    const pqCredential: KeypairCredential = {
      type: 'pq-keypair',
      keypairId: 'pq-1',
      identity: 'AGE-SECRET-KEY-PQ-1TEST',
      recipient: 'age1pq1test...',
      label: 'Test PQ Key'
    };

    const result = await decryptFile({
      bundle: {
        bundleId: 'bundle-pq-1',
        blob: new Blob(),
        manifest: pqManifest,
        createdAt: new Date()
      },
      credential: pqCredential
    });

    expect(result.fileName).toBe('secret.txt');
    expect(result.mimeType).toBe('text/plain');
  });
});

