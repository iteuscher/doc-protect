import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  storeCredential,
  getCredential,
  listCredentials,
  updateCredential,
  deleteCredential,
  storeBundle,
  getBundle,
  listBundles,
  deleteBundle,
  clearAllData,
  getSettings,
  saveSettings,
  storeKeypair,
  getKeypair,
  listKeypairs,
  deleteKeypair
} from '@/lib/storage/indexeddb';
import type { WebAuthnCredential } from '@/lib/types/credential';
import type { EncryptionSettings, StoredKeypair } from '@/lib/types/settings';

const baseCredential: WebAuthnCredential = {
  credentialId: 'cred-1',
  identity: 'AGE-PLUGIN-FIDO2PRF-1-abc',
  type: 'passkey',
  keyName: 'Primary Key',
  userId: 'user@example.com',
  userName: 'User Example',
  prfEnabled: true,
  createdAt: new Date().toISOString()
};

describe('IndexedDB credential storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('stores and retrieves credential', async () => {
    await storeCredential(baseCredential);
    const fetched = (await getCredential('cred-1')) as WebAuthnCredential | null;

    expect(fetched).not.toBeNull();
    expect(fetched?.identity).toBe(baseCredential.identity);
  });

  it('lists stored credentials', async () => {
    await storeCredential(baseCredential);
    await storeCredential({
      ...baseCredential,
      credentialId: 'cred-2',
      identity: 'AGE-PLUGIN-FIDO2PRF-1-def',
      keyName: 'Backup Key'
    });

    const all = await listCredentials();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.credentialId).sort()).toEqual(['cred-1', 'cred-2']);
  });

  it('updates credential metadata', async () => {
    await storeCredential(baseCredential);
    await updateCredential('cred-1', { keyName: 'Updated Name' });

    const updated = await getCredential('cred-1');
    expect(updated?.keyName).toBe('Updated Name');
  });

  it('deletes credential', async () => {
    await storeCredential(baseCredential);
    await deleteCredential('cred-1');

    const fetched = await getCredential('cred-1');
    expect(fetched).toBeNull();
  });
});

describe('IndexedDB bundle storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('stores bundle and lists metadata', async () => {
    const blob = new Blob(['ciphertext']);
    const metadata = {
      fileName: 'secret.txt.rico',
      encryptedSize: blob.size,
      createdAt: new Date().toISOString(),
      mimeType: 'application/rico'
    };

    await storeBundle('bundle-1', blob, metadata);

    const storedBlob = await getBundle('bundle-1');
    expect(storedBlob).not.toBeNull();

    expect(storedBlob).toBeInstanceOf(Blob);

    const bundles = await listBundles();
    expect(bundles).toEqual([
      {
        bundleId: 'bundle-1',
        fileName: metadata.fileName,
        encryptedSize: metadata.encryptedSize,
        createdAt: metadata.createdAt,
        mimeType: metadata.mimeType
      }
    ]);
  });

  it('deletes bundle data', async () => {
    await storeBundle('bundle-2', new Blob(['data']), {
      fileName: 'a.rico',
      encryptedSize: 4,
      createdAt: new Date().toISOString(),
      mimeType: 'application/rico'
    });

    await deleteBundle('bundle-2');

    expect(await getBundle('bundle-2')).toBeNull();
    expect(await listBundles()).toHaveLength(0);
  });
});

describe('IndexedDB settings storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('returns null when no settings are saved', async () => {
    const settings = await getSettings();
    expect(settings).toBeNull();
  });

  it('saves and retrieves settings', async () => {
    const settings: EncryptionSettings = {
      algorithm: 'age-pq',
      updatedAt: new Date().toISOString()
    };

    await saveSettings(settings);
    const fetched = await getSettings();

    expect(fetched).not.toBeNull();
    expect(fetched?.algorithm).toBe('age-pq');
  });

  it('overwrites settings on save', async () => {
    await saveSettings({ algorithm: 'age-pq', updatedAt: new Date().toISOString() });
    await saveSettings({ algorithm: 'age-x25519', updatedAt: new Date().toISOString() });

    const fetched = await getSettings();
    expect(fetched?.algorithm).toBe('age-x25519');
  });
});

describe('IndexedDB keypair storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  const baseKeypair: StoredKeypair = {
    id: 'kp-1',
    algorithm: 'age-pq',
    identity: 'AGE-SECRET-KEY-PQ-1TEST',
    recipient: 'age1pq1test...',
    label: 'Test PQ Key',
    createdAt: new Date().toISOString()
  };

  it('stores and retrieves keypair', async () => {
    await storeKeypair(baseKeypair);
    const fetched = await getKeypair('kp-1');

    expect(fetched).not.toBeNull();
    expect(fetched?.algorithm).toBe('age-pq');
    expect(fetched?.identity).toBe('AGE-SECRET-KEY-PQ-1TEST');
    expect(fetched?.recipient).toBe('age1pq1test...');
  });

  it('lists all keypairs', async () => {
    await storeKeypair(baseKeypair);
    await storeKeypair({
      ...baseKeypair,
      id: 'kp-2',
      algorithm: 'age-x25519',
      identity: 'AGE-SECRET-KEY-1X',
      recipient: 'age1x...',
      label: 'x25519 Key'
    });

    const all = await listKeypairs();
    expect(all).toHaveLength(2);
  });

  it('deletes keypair', async () => {
    await storeKeypair(baseKeypair);
    await deleteKeypair('kp-1');

    const fetched = await getKeypair('kp-1');
    expect(fetched).toBeNull();
  });

  it('clearAllData clears keypairs and settings', async () => {
    await storeKeypair(baseKeypair);
    await saveSettings({ algorithm: 'age-pq', updatedAt: new Date().toISOString() });

    await clearAllData();

    expect(await listKeypairs()).toHaveLength(0);
    expect(await getSettings()).toBeNull();
  });
});

