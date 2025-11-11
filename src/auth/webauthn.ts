import { webauthn } from 'age-encryption';

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
    const identity = await webauthn.createCredential({
      keyName: options.keyName,
    });
    
    // Store identity for security keys (passkeys are discoverable, but we store for consistency)
    await storeIdentity(identity, 'passkey');
    
    return identity;
  } catch (error) {
    console.error('Failed to create passkey credential:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      // Check for PRF extension errors
      if (error.message.includes('PRF extension') || error.message.includes('prf') || error.message.includes('PRF')) {
        throw new Error(
          'PRF extension not available.\n\n' +
          'Windows Hello (platform authenticator) does not support the PRF extension required for encryption.\n\n' +
          'To use passkeys for encryption on Windows, you need:\n' +
          '• An external security key (e.g., YubiKey) that supports PRF/hmac-secret\n' +
          '• OR use a different platform (macOS 15+, or Linux with a security key)\n\n' +
          'Note: Regular passkeys (without PRF) can be used for authentication, but not for file encryption in this app.'
        );
      }
      
      // Check if user cancelled the operation
      if (error.name === 'NotAllowedError' || error.message.includes('cancel') || error.message.includes('NotAllowed')) {
        throw new Error('Passkey creation was cancelled by the user');
      }
      
      // Check if WebAuthn is not supported
      if (error.name === 'NotSupportedError' || error.message.includes('not supported')) {
        throw new Error('WebAuthn/Passkeys are not supported in this browser. Please use a modern browser that supports WebAuthn.');
      }
      
      // Check for security key errors
      if (error.name === 'SecurityError' || error.message.includes('SecurityError')) {
        throw new Error('Security error: Make sure you are using HTTPS or localhost, and that your browser supports WebAuthn.');
      }
      
      // Check for invalid state errors
      if (error.name === 'InvalidStateError' || error.message.includes('InvalidState')) {
        throw new Error('A passkey with this name may already exist. Please try a different name.');
      }
      
      // Preserve the original error message if it's informative
      if (error.message && error.message !== 'Passkey creation failed') {
        throw new Error(`Passkey creation failed: ${error.message}`);
      }
    }
    
    // Fallback for unknown errors
    throw new Error(`Passkey creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a non-discoverable security key credential
 */
export async function createSecurityKeyCredential(
  options: WebAuthnCredentialOptions
): Promise<string> {
  try {
    const identity = await webauthn.createCredential({
      type: 'security-key',
      keyName: options.keyName,
    });
    
    // Must store identity for security keys as they're non-discoverable
    await storeIdentity(identity, 'security-key');
    
    return identity;
  } catch (error) {
    console.error('Failed to create security key credential:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      // Check if user cancelled the operation
      if (error.name === 'NotAllowedError' || error.message.includes('cancel') || error.message.includes('NotAllowed')) {
        throw new Error('Security key creation was cancelled by the user');
      }
      
      // Check if WebAuthn is not supported
      if (error.name === 'NotSupportedError' || error.message.includes('not supported')) {
        throw new Error('WebAuthn/Security keys are not supported in this browser. Please use a modern browser that supports WebAuthn.');
      }
      
      // Check for security key errors
      if (error.name === 'SecurityError' || error.message.includes('SecurityError')) {
        throw new Error('Security error: Make sure you are using HTTPS or localhost, and that your browser supports WebAuthn.');
      }
      
      // Check for invalid state errors
      if (error.name === 'InvalidStateError' || error.message.includes('InvalidState')) {
        throw new Error('A security key with this name may already exist. Please try a different name.');
      }
      
      // Preserve the original error message if it's informative
      if (error.message && error.message !== 'Security key creation failed') {
        throw new Error(`Security key creation failed: ${error.message}`);
      }
    }
    
    // Fallback for unknown errors
    throw new Error(`Security key creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieves WebAuthn identity for encryption/decryption
 * For passkeys, this will prompt the user to select their passkey
 * For security keys, this retrieves the stored identity
 */
export async function getWebAuthnIdentity(
  identity?: string
): Promise<webauthn.WebAuthnIdentity> {
  if (identity) {
    return new webauthn.WebAuthnIdentity({ identity });
  }
  
  // For discoverable passkeys, no identity string needed
  return new webauthn.WebAuthnIdentity();
}

/**
 * Creates a WebAuthn recipient for encryption
 */
export function createWebAuthnRecipient(
  identity?: string
): webauthn.WebAuthnRecipient {
  if (identity) {
    return new webauthn.WebAuthnRecipient({ identity });
  }
  return new webauthn.WebAuthnRecipient();
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

