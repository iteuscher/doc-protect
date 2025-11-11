import * as age from 'age-encryption';

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

const KEYPAIRS_STORE = 'x25519-keypairs';
const DB_NAME = 'doc-protect-db';
const DB_VERSION = 1;

/**
 * Generates a new X25519 identity/recipient key pair
 */
export async function generateX25519KeyPair(): Promise<KeyPair> {
  try {
    // Check if generateIdentity is available
    if (typeof age.generateIdentity !== 'function') {
      throw new Error('age.generateIdentity is not available. Make sure you are using a compatible version of age-encryption.');
    }
    
    const identity = await age.generateIdentity();
    
    // Check if identityToRecipient is available
    if (typeof age.identityToRecipient !== 'function') {
      throw new Error('age.identityToRecipient is not available. Make sure you are using a compatible version of age-encryption.');
    }
    
    const recipient = await age.identityToRecipient(identity);
    
    return {
      privateKey: identity,
      publicKey: recipient,
    };
  } catch (error) {
    console.error('Failed to generate X25519 key pair:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to generate key pair: ${String(error)}`);
  }
}

/**
 * Validates an age public key format
 */
export function validatePublicKey(key: string): boolean {
  // Age public keys start with 'age1' and use Bech32 encoding
  if (!key.startsWith('age1')) {
    return false;
  }
  
  // Basic format check - should be valid Bech32
  // More thorough validation would require a Bech32 library
  try {
    // Check if it's a reasonable length (age1 + base32 encoded 32 bytes)
    // Base32 encoding of 32 bytes is ~52 characters, plus 'age1' prefix
    if (key.length < 56 || key.length > 70) {
      return false;
    }
    
    // Check for valid characters (base32: a-z, 2-7)
    const base32Pattern = /^age1[a-z2-7]+$/;
    return base32Pattern.test(key.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Parses recipient keys from URL parameters
 * Supports multiple ?r= parameters
 */
export function parseRecipientsFromURL(): string[] {
  const params = new URLSearchParams(window.location.search);
  const recipients = params.getAll('r');
  
  // Filter out invalid keys
  return recipients.filter(key => validatePublicKey(key));
}

/**
 * Stores a keypair in IndexedDB (for receive mode)
 */
export async function storeKeyPairLocally(
  keyPair: KeyPair,
  label?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([KEYPAIRS_STORE], 'readwrite');
      const store = transaction.objectStore(KEYPAIRS_STORE);
      
      const stored = {
        ...keyPair,
        label: label || 'Generated Key',
        createdAt: Date.now(),
        origin: window.location.origin,
      };
      
      const addRequest = store.add(stored);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEYPAIRS_STORE)) {
        const objectStore = db.createObjectStore(KEYPAIRS_STORE, {
          keyPath: 'publicKey',
        });
        objectStore.createIndex('label', 'label', { unique: false });
        objectStore.createIndex('origin', 'origin', { unique: false });
      }
    };
  });
}

/**
 * Retrieves stored keypairs from IndexedDB
 */
export async function getStoredKeyPairs(): Promise<KeyPair[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction([KEYPAIRS_STORE], 'readonly');
      const store = transaction.objectStore(KEYPAIRS_STORE);
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const keypairs = getAllRequest.result.filter(
          (kp: KeyPair & { origin: string }) => kp.origin === window.location.origin
        );
        resolve(keypairs);
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEYPAIRS_STORE)) {
        const objectStore = db.createObjectStore(KEYPAIRS_STORE, {
          keyPath: 'publicKey',
        });
        objectStore.createIndex('label', 'label', { unique: false });
        objectStore.createIndex('origin', 'origin', { unique: false });
      }
    };
  });
}

