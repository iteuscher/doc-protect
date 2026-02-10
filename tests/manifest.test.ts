import { describe, it, expect } from 'vitest';
import { createManifest, createDefaultPolicy, validatePolicy, updatePolicy } from '@/lib/crypto/manifest';
import type { WebAuthnCredential } from '@/lib/types/credential';
import type { KeypairCredential } from '@/lib/types/encryption-credential';

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

  it('creates manifest with PQ keypair credential', () => {
    const pqCredential: KeypairCredential = {
      type: 'pq-keypair',
      keypairId: 'pq-1',
      identity: 'AGE-SECRET-KEY-PQ-1TEST',
      recipient: 'age1pq1test...',
      label: 'Test PQ Key'
    };

    const manifest = createManifest({
      fileName: 'secret.pdf',
      fileType: 'application/pdf',
      originalSize: 100,
      encryptedSize: 200,
      ownerCredential: pqCredential,
      recipients: []
    });

    expect(manifest.encryptionInfo.algorithm).toBe('age-pq');
    expect(manifest.encryptionInfo.recipients[0].type).toBe('pq-hybrid');
    expect(manifest.encryptionInfo.recipients[0].publicKey).toBe('age1pq1test...');
    expect(manifest.encryptionInfo.recipients[0].role).toBe('owner');
    expect(manifest.encryptionInfo.recipients[0].label).toBe('Test PQ Key');
  });

  it('creates manifest with x25519 keypair credential', () => {
    const x25519Credential: KeypairCredential = {
      type: 'x25519-keypair',
      keypairId: 'x-1',
      identity: 'AGE-SECRET-KEY-1TEST',
      recipient: 'age1test...',
      label: 'Test x25519 Key'
    };

    const manifest = createManifest({
      fileName: 'data.csv',
      fileType: 'text/csv',
      originalSize: 50,
      encryptedSize: 100,
      ownerCredential: x25519Credential,
      recipients: []
    });

    expect(manifest.encryptionInfo.algorithm).toBe('age-x25519');
    expect(manifest.encryptionInfo.recipients[0].type).toBe('x25519');
    expect(manifest.encryptionInfo.recipients[0].publicKey).toBe('age1test...');
    expect(manifest.encryptionInfo.recipients[0].role).toBe('owner');
  });

  it('includes PQ recipient in policy dissem list', () => {
    const pqCredential: KeypairCredential = {
      type: 'pq-keypair',
      keypairId: 'pq-1',
      identity: 'AGE-SECRET-KEY-PQ-1TEST',
      recipient: 'age1pq1test...',
      label: 'Test PQ Key'
    };

    const manifest = createManifest({
      fileName: 'test.txt',
      fileType: 'text/plain',
      originalSize: 10,
      encryptedSize: 20,
      ownerCredential: pqCredential,
      recipients: []
    });

    expect(manifest.policy.body.dissem).toContain('age1pq1test...');
  });
});

