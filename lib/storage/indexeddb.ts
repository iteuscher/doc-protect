/**
 * IndexedDB Storage for Credentials
 * 
 * Stores WebAuthn credentials locally using IndexedDB.
 * Uses localForage for simpler API.
 * 
 * References:
 * - IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 * - localForage: https://github.com/localForage/localForage
 */

import localforage from 'localforage';
import type { WebAuthnCredential, FallbackCredential, StoredCredential } from '@/lib/types/credential';
import type { EncryptionSettings, StoredKeypair } from '@/lib/types/settings';

// Configure localForage
const credentialStore = localforage.createInstance({
  name: 'DocProtect',
  storeName: 'credentials',
  description: 'WebAuthn credentials for DocProtect'
});

const bundleStore = localforage.createInstance({
  name: 'DocProtect',
  storeName: 'bundles',
  description: 'Locally stored encrypted bundles'
});

const settingsStore = localforage.createInstance({
  name: 'DocProtect',
  storeName: 'settings',
  description: 'Encryption settings for DocProtect'
});

const keypairStore = localforage.createInstance({
  name: 'DocProtect',
  storeName: 'keypairs',
  description: 'PQ and x25519 keypairs for DocProtect'
});

/**
 * Store credential in IndexedDB
 * 
 * @param credential - Credential to store
 * @returns Stored credential with ID
 */
export async function storeCredential(
  credential: WebAuthnCredential | FallbackCredential
): Promise<StoredCredential> {
  validateBrowserStorageSupport();

  const id = credential.credentialId || crypto.randomUUID();
  if (credential.type === 'fallback-pbkdf2') {
    const fallbackCredential: FallbackCredential = {
      ...credential,
      credentialId: id
    };
    const storedFallback: StoredCredential = {
      id,
      credential: fallbackCredential
    };
    await credentialStore.setItem(storedFallback.id, storedFallback);
    return storedFallback;
  }

  const webCredential = credential as WebAuthnCredential;
  const normalizedCredential: WebAuthnCredential = {
    ...webCredential,
    credentialId: id
  };
  const storedCredential: StoredCredential = {
    id,
    credential: normalizedCredential
  };

  await credentialStore.setItem(storedCredential.id, storedCredential);
  return storedCredential;
}

/**
 * Get credential by ID
 * 
 * @param credentialId - Credential ID
 * @returns Credential or null if not found
 */
export async function getCredential(
  credentialId: string
): Promise<WebAuthnCredential | FallbackCredential | null> {
  validateBrowserStorageSupport();

  const stored = await credentialStore.getItem<StoredCredential>(credentialId);
  return stored?.credential ?? null;
}

/**
 * List all stored credentials
 * 
 * @returns Array of stored credentials
 */
export async function listCredentials(): Promise<Array<WebAuthnCredential | FallbackCredential>> {
  validateBrowserStorageSupport();

  const results: Array<WebAuthnCredential | FallbackCredential> = [];

  await credentialStore.iterate<StoredCredential, void>((value) => {
    if (value?.credential) {
      results.push(value.credential);
    }
  });

  return results;
}

/**
 * Delete credential
 * 
 * @param credentialId - Credential ID to delete
 */
export async function deleteCredential(credentialId: string): Promise<void> {
  validateBrowserStorageSupport();
  await credentialStore.removeItem(credentialId);
}

/**
 * Update credential metadata (e.g., lastUsed timestamp)
 * 
 * @param credentialId - Credential ID
 * @param updates - Fields to update
 */
export async function updateCredential(
  credentialId: string,
  updates: Partial<WebAuthnCredential | FallbackCredential>
): Promise<void> {
  validateBrowserStorageSupport();

  const stored = await credentialStore.getItem<StoredCredential>(credentialId);
  if (!stored) {
    throw new Error(`Credential ${credentialId} not found`);
  }

  const updated: StoredCredential = {
    ...stored,
    credential: {
      ...stored.credential,
      ...updates,
      credentialId
    } as WebAuthnCredential | FallbackCredential
  };

  await credentialStore.setItem(credentialId, updated);
}

/**
 * Store bundle locally (for offline access)
 * 
 * @param bundleId - Bundle identifier
 * @param bundleBlob - Bundle blob
 * @param metadata - Bundle metadata
 */
export async function storeBundle(
  bundleId: string,
  bundleBlob: Blob,
  metadata: {
    fileName: string;
    encryptedSize: number;
    createdAt: string;
    mimeType?: string;
  }
): Promise<void> {
  validateBrowserStorageSupport();

  const buffer = await new Response(bundleBlob).arrayBuffer();
  const record: BundleRecord = {
    bundleId,
    data: new Uint8Array(buffer),
    mimeType: metadata.mimeType ?? bundleBlob.type ?? 'application/octet-stream',
    metadata
  };

  await bundleStore.setItem(bundleId, record);
}

/**
 * Get stored bundle
 * 
 * @param bundleId - Bundle ID
 * @returns Bundle blob or null
 */
export async function getBundle(bundleId: string): Promise<Blob | null> {
  validateBrowserStorageSupport();

  const record = await bundleStore.getItem<BundleRecord>(bundleId);
  if (!record) {
    return null;
  }

  return new Blob([record.data as BlobPart], { type: record.mimeType });
}

/**
 * List locally stored bundles
 * 
 * @returns Array of bundle metadata
 */
export async function listBundles(): Promise<Array<{
  bundleId: string;
  fileName: string;
  encryptedSize: number;
  createdAt: string;
  mimeType?: string;
}>> {
  validateBrowserStorageSupport();

  const results: Array<{
    bundleId: string;
    fileName: string;
    encryptedSize: number;
    createdAt: string;
    mimeType?: string;
  }> = [];

  await bundleStore.iterate<BundleRecord, void>((record) => {
    if (record?.metadata) {
      results.push({
        bundleId: record.bundleId,
        fileName: record.metadata.fileName,
        encryptedSize: record.metadata.encryptedSize,
        createdAt: record.metadata.createdAt,
        mimeType: record.mimeType
      });
    }
  });

  return results;
}

/**
 * Delete bundle
 * 
 * @param bundleId - Bundle ID to delete
 */
export async function deleteBundle(bundleId: string): Promise<void> {
  validateBrowserStorageSupport();
  await bundleStore.removeItem(bundleId);
}

/**
 * Clear all stored data (credentials and bundles)
 * 
 * WARNING: This is irreversible!
 */
export async function clearAllData(): Promise<void> {
  await credentialStore.clear();
  await bundleStore.clear();
  await settingsStore.clear();
  await keypairStore.clear();
}

/**
 * Clear only credentials (keeps bundles)
 * 
 * WARNING: This is irreversible!
 */
export async function clearCredentials(): Promise<void> {
  await credentialStore.clear();
}

// ====================
// SETTINGS OPERATIONS
// ====================

const SETTINGS_KEY = 'encryption-settings';

/**
 * Get encryption settings
 */
export async function getSettings(): Promise<EncryptionSettings | null> {
  validateBrowserStorageSupport();
  return settingsStore.getItem<EncryptionSettings>(SETTINGS_KEY);
}

/**
 * Save encryption settings
 */
export async function saveSettings(settings: EncryptionSettings): Promise<void> {
  validateBrowserStorageSupport();
  await settingsStore.setItem(SETTINGS_KEY, settings);
}

// ====================
// KEYPAIR OPERATIONS
// ====================

/**
 * Store a PQ or x25519 keypair
 */
export async function storeKeypair(keypair: StoredKeypair): Promise<StoredKeypair> {
  validateBrowserStorageSupport();
  await keypairStore.setItem(keypair.id, keypair);
  return keypair;
}

/**
 * Get keypair by ID
 */
export async function getKeypair(id: string): Promise<StoredKeypair | null> {
  validateBrowserStorageSupport();
  return keypairStore.getItem<StoredKeypair>(id);
}

/**
 * List all stored keypairs
 */
export async function listKeypairs(): Promise<StoredKeypair[]> {
  validateBrowserStorageSupport();

  const results: StoredKeypair[] = [];
  await keypairStore.iterate<StoredKeypair, void>((value) => {
    if (value?.id) {
      results.push(value);
    }
  });

  return results;
}

/**
 * Delete keypair by ID
 */
export async function deleteKeypair(id: string): Promise<void> {
  validateBrowserStorageSupport();
  await keypairStore.removeItem(id);
}

interface BundleRecord {
  bundleId: string;
  data: Uint8Array;
  mimeType: string;
  metadata: {
    fileName: string;
    encryptedSize: number;
    createdAt: string;
    mimeType?: string;
  };
}

function validateBrowserStorageSupport(): void {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment');
  }
}

