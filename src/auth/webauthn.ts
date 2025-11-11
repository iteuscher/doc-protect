import * as age from 'age-encryption';

export interface WebAuthnCredentialOptions {
  keyName: string;
  type?: 'passkey' | 'security-key';
}

export interface StoredIdentity {
  identity: string;
  type: 'passkey' | 'security-key';
  createdAt: number;
  origin: string;
}

const IDENTITIES_STORE = 'webauthn-identities';
const DB_NAME = 'doc-protect-db';
const DB_VERSION = 1;

/**
 * Creates a discoverable passkey credential using WebAuthn PRF extension
 */
export async function createPasskeyCredential(
  options: WebAuthnCredentialOptions
): Promise<string> {
  try {
    const identity = await age.webauthn.createCredential({
      keyName: options.keyName,
    });
    
    // Store identity for security keys (passkeys are discoverable, but we store for consistency)
    await storeIdentity(identity, 'passkey');
    
    return identity;
  } catch (error) {
    console.error('Failed to create passkey credential:', error);
    throw new Error('Passkey creation failed');
  }
}

/**
 * Creates a non-discoverable security key credential
 */
export async function createSecurityKeyCredential(
  options: WebAuthnCredentialOptions
): Promise<string> {
  try {
    const identity = await age.webauthn.createCredential({
      type: 'security-key',
      keyName: options.keyName,
    });
    
    // Must store identity for security keys as they're non-discoverable
    await storeIdentity(identity, 'security-key');
    
    return identity;
  } catch (error) {
    console.error('Failed to create security key credential:', error);
    throw new Error('Security key creation failed');
  }
}

/**
 * Retrieves WebAuthn identity for encryption/decryption
 * For passkeys, this will prompt the user to select their passkey
 * For security keys, this retrieves the stored identity
 */
export async function getWebAuthnIdentity(
  identity?: string
): Promise<age.webauthn.WebAuthnIdentity> {
  if (identity) {
    return new age.webauthn.WebAuthnIdentity({ identity });
  }
  
  // For discoverable passkeys, no identity string needed
  return new age.webauthn.WebAuthnIdentity();
}

/**
 * Creates a WebAuthn recipient for encryption
 */
export function createWebAuthnRecipient(
  identity?: string
): age.webauthn.WebAuthnRecipient {
  if (identity) {
    return new age.webauthn.WebAuthnRecipient({ identity });
  }
  return new age.webauthn.WebAuthnRecipient();
}

/**
 * Stores identity string in IndexedDB (primarily for security keys)
 */
async function storeIdentity(
  identity: string,
  type: 'passkey' | 'security-key'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([IDENTITIES_STORE], 'readwrite');
      const store = transaction.objectStore(IDENTITIES_STORE);
      
      const stored: StoredIdentity = {
        identity,
        type,
        createdAt: Date.now(),
        origin: window.location.origin,
      };
      
      const addRequest = store.add(stored);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDENTITIES_STORE)) {
        const objectStore = db.createObjectStore(IDENTITIES_STORE, {
          keyPath: 'identity',
        });
        objectStore.createIndex('type', 'type', { unique: false });
        objectStore.createIndex('origin', 'origin', { unique: false });
      }
    };
  });
}

/**
 * Retrieves stored identities from IndexedDB
 */
export async function getStoredIdentities(): Promise<StoredIdentity[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([IDENTITIES_STORE], 'readonly');
      const store = transaction.objectStore(IDENTITIES_STORE);
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const identities = getAllRequest.result.filter(
          (id: StoredIdentity) => id.origin === window.location.origin
        );
        resolve(identities);
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDENTITIES_STORE)) {
        const objectStore = db.createObjectStore(IDENTITIES_STORE, {
          keyPath: 'identity',
        });
        objectStore.createIndex('type', 'type', { unique: false });
        objectStore.createIndex('origin', 'origin', { unique: false });
      }
    };
  });
}

