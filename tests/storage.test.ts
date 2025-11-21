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
  clearAllData
} from '@/lib/storage/indexeddb';
import type { WebAuthnCredential } from '@/lib/types/credential';

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
      fileName: 'secret.txt.dpf',
      encryptedSize: blob.size,
      createdAt: new Date().toISOString(),
      mimeType: 'application/docprotect'
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
      fileName: 'a.dpf',
      encryptedSize: 4,
      createdAt: new Date().toISOString(),
      mimeType: 'application/docprotect'
    });

    await deleteBundle('bundle-2');

    expect(await getBundle('bundle-2')).toBeNull();
    expect(await listBundles()).toHaveLength(0);
  });
});

