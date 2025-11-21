import { describe, it, expect } from 'vitest';
import { createManifest, createDefaultPolicy, validatePolicy, updatePolicy } from '@/lib/crypto/manifest';
import type { WebAuthnCredential } from '@/lib/types/credential';

const ownerCredential: WebAuthnCredential = {
  credentialId: 'cred-owner',
  identity: 'AGE-PLUGIN-FIDO2PRF-1-owner',
  type: 'passkey',
  keyName: 'Owner Key',
  userId: 'owner@example.com',
  userName: 'Owner',
  prfEnabled: true,
  createdAt: new Date().toISOString()
};

describe('Manifest utilities', () => {
  it('creates manifest with owner and recipients', () => {
    const manifest = createManifest({
      fileName: 'report.pdf',
      fileType: 'application/pdf',
      originalSize: 123,
      encryptedSize: 456,
      ownerCredential,
      recipients: [
        {
          type: 'x25519',
          publicKey: 'age1recipient',
          role: 'recipient',
          label: 'Bob'
        }
      ]
    });

    expect(manifest.fileInfo.name).toBe('report.pdf');
    expect(manifest.encryptionInfo.recipients).toHaveLength(2);
    expect(manifest.encryptionInfo.recipients[0].role).toBe('owner');
    expect(manifest.policy.body.dissem.length).toBeGreaterThan(0);
  });

  it('creates default policy with owner plus recipients', () => {
    const policy = createDefaultPolicy(ownerCredential.identity, [
      { type: 'x25519', publicKey: 'age1recipient', role: 'recipient' }
    ]);

    expect(policy.body.dissem).toContain(ownerCredential.identity);
    expect(policy.body.dissem).toContain('age1recipient');
    expect(validatePolicy(policy).valid).toBe(true);
  });

  it('validates invalid policy input', () => {
    const result = validatePolicy({
      uuid: 'bad-uuid',
      version: 0,
      createdAt: 'not-a-date',
      updatedAt: 'not-a-date',
      body: { dataAttributes: [], dissem: [] },
      abacRules: { enabled: false, rules: [] }
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('updates policy dissemination list', () => {
    const policy = createDefaultPolicy(ownerCredential.identity, []);
    const updated = updatePolicy(policy, {
      addDissem: ['age1recipient'],
      removeDissem: [ownerCredential.identity]
    });

    expect(updated.version).toBe(policy.version + 1);
    expect(updated.body.dissem).toContain('age1recipient');
    expect(updated.body.dissem).not.toContain(ownerCredential.identity);
  });
});

