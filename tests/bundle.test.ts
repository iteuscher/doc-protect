import { describe, it, expect } from 'vitest';
import { createBundle, parseBundle, validateBundle, getBundleMetadata } from '@/lib/crypto/bundle';
import type { DocProtectManifest } from '@/lib/types/bundle';

const manifest: DocProtectManifest = {
  version: '1.0.0',
  manifestVersion: 1,
  createdAt: new Date().toISOString(),
  fileInfo: {
    name: 'secret.txt',
    type: 'text/plain',
    encryptedSize: 3,
    originalSize: 3
  },
  encryptionInfo: {
    algorithm: 'age',
    format: 'age-encryption.org/v1',
    recipients: [
      {
        type: 'webauthn-passkey',
        identity: 'AGE-PLUGIN-FIDO2PRF-1-owner',
        role: 'owner'
      }
    ]
  },
  policy: {
    uuid: crypto.randomUUID(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    body: {
      dataAttributes: [],
      dissem: ['AGE-PLUGIN-FIDO2PRF-1-owner']
    },
    abacRules: {
      enabled: false,
      rules: []
    }
  }
};

describe('Bundle utilities', () => {
  it('creates and parses bundle roundtrip', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const bundle = await createBundle(manifest, payload);

    const parsed = await parseBundle(bundle.blob);

    expect(parsed.manifest.fileInfo.name).toBe('secret.txt');
    expect(parsed.encryptedPayload).toHaveLength(3);
  });

  it('validates bundle structure', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const bundle = await createBundle(manifest, payload);

    const validation = await validateBundle(bundle.blob);
    expect(validation.valid).toBe(true);
  });

  it('extracts bundle metadata without payload', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const bundle = await createBundle(manifest, payload);

    const metadata = await getBundleMetadata(bundle.blob);
    expect(metadata.fileName).toBe('secret.txt');
    expect(metadata.recipientCount).toBe(1);
  });
});

