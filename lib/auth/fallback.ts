/**
 * Fallback Encryption for Non-PRF Systems
 * 
 * Provides PBKDF2-based encryption for systems that don't support
 * WebAuthn PRF extension (e.g., Windows 10/11).
 * 
 * References:
 * - Fallback strategy: docs/PRF_FALLBACK_STRATEGY.md
 * - PBKDF2: https://datatracker.ietf.org/doc/html/rfc8018
 */

import type { FallbackCredential } from '@/lib/types/credential';

const AES_IV_LENGTH = 12;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;

/**
 * Create fallback credential (no PRF)
 * 
 * Creates a standard WebAuthn credential without PRF extension
 * 
 * @param options - Credential creation options
 * @returns Fallback credential
 * 
 * @example
 * ```typescript
 * const credential = await createFallbackCredential({
 *   userId: 'alice@company.com',
 *   userName: 'Alice',
 *   keyName: 'DocProtect Fallback Key'
 * });
 * 
 * console.log('⚠️ Using fallback mode');
 * ```
 */
export async function createFallbackCredential(options: {
  userId: string;
  userName: string;
  keyName: string;
}): Promise<FallbackCredential> {
  ensureBrowserSupport('create credential');

  const { userId, userName, keyName } = options;

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        id: window.location.hostname,
        name: 'DocProtect Fallback'
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: userId,
        displayName: userName
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required'
      },
      timeout: 60000
    }
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Failed to create fallback credential');
  }

  const rawId = credential.rawId ?? new ArrayBuffer(0);

  return {
    credentialId: arrayBufferToBase64Url(rawId),
    keyName,
    userId,
    userName,
    type: 'fallback-pbkdf2',
    prfEnabled: false,
    createdAt: new Date().toISOString(),
    metadata: {
      userAgent: navigator.userAgent,
      rpId: window.location.hostname
    }
  };
}

/**
 * Derive encryption key from WebAuthn assertion
 * 
 * Uses PBKDF2 to derive a deterministic key. The key is derived from:
 * - Credential ID (deterministic, unique per credential)
 * - Salt (file-specific)
 * - User ID (from the credential, deterministic)
 * 
 * NOTE: We cannot use the signature directly because WebAuthn signatures are
 * non-deterministic (they include a counter). Instead, we use the credential
 * ID which is deterministic and unique.
 * 
 * @param credentialId - Credential to use (base64url encoded)
 * @param salt - File-specific salt
 * @returns Derived encryption key (32 bytes)
 */
export async function deriveKeyFromAssertion(
  credentialId: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  ensureBrowserSupport('derive key from assertion');

  if (!salt || salt.length === 0) {
    throw new Error('Salt is required for key derivation');
  }

  // Get WebAuthn assertion to verify the credential is valid
  // We need user verification to ensure the user is present
  const credential = (await getAssertion(credentialId, salt)) as PublicKeyCredential;
  const response = credential.response as AuthenticatorAssertionResponse;
  
  // Verify we got a valid assertion
  if (!response.authenticatorData || !response.signature) {
    throw new Error('Invalid WebAuthn assertion response');
  }

  // Use deterministic values for key derivation:
  // - Credential ID (unique, deterministic per credential)
  // - Salt (file-specific, stored in manifest)
  // 
  // The credential ID is used as the key material, and the salt is used
  // for PBKDF2. This ensures the same credential + salt always produces
  // the same key.
  
  // Decode credential ID to get raw bytes
  const credentialIdBytes = base64UrlToArrayBuffer(credentialId);

  // Use credential ID as the key material (deterministic)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    credentialIdBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2 with the salt
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Encrypt file with fallback method
 * 
 * @param file - File to encrypt
 * @param credential - Fallback credential
 * @returns Encrypted data with embedded salt
 */
export async function encryptWithFallback(
  file: File,
  credential: FallbackCredential
): Promise<{
  encryptedData: Uint8Array;
  salt: Uint8Array;
}> {
  if (!file) {
    throw new Error('File is required for encryption');
  }

  if (!credential) {
    throw new Error('Fallback credential is required');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));

  const keyMaterial = await deriveKeyFromAssertion(credential.credentialId, salt);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const fileBuffer = await file.arrayBuffer();
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    cryptoKey,
    fileBuffer
  );

  const encryptedData = new Uint8Array(AES_IV_LENGTH + encryptedBuffer.byteLength);
  encryptedData.set(iv, 0);
  encryptedData.set(new Uint8Array(encryptedBuffer), AES_IV_LENGTH);

  return {
    encryptedData,
    salt
  };
}

/**
 * Decrypt file with fallback method
 * 
 * @param encryptedData - Encrypted data
 * @param salt - Salt used during encryption
 * @param credential - Fallback credential
 * @returns Decrypted file data
 */
export async function decryptWithFallback(
  encryptedData: Uint8Array,
  salt: Uint8Array,
  credential: FallbackCredential
): Promise<Uint8Array> {
  if (!encryptedData || encryptedData.length <= AES_IV_LENGTH) {
    throw new Error('Invalid encrypted data');
  }

  if (!salt || salt.length === 0) {
    throw new Error('Salt is required for decryption');
  }

  const iv = encryptedData.slice(0, AES_IV_LENGTH);
  const ciphertext = encryptedData.slice(AES_IV_LENGTH);

  const keyMaterial = await deriveKeyFromAssertion(credential.credentialId, salt);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      cryptoKey,
      ciphertext
    );

    return new Uint8Array(decryptedBuffer);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new Error(
        'Decryption failed. This usually means:\n' +
        '1. The wrong credential is being used (not the one that encrypted this file)\n' +
        '2. The file was corrupted or modified\n' +
        '3. The file was encrypted with a different method (PRF vs fallback)\n\n' +
        'Please verify you are using the correct credential that was used to encrypt this file.'
      );
    }
    throw error;
  }
}

/**
 * Check if credential is fallback type
 * 
 * @param credential - Credential to check
 * @returns True if fallback
 */
export function isFallbackCredential(
  credential: unknown
): credential is FallbackCredential {
  if (!credential || typeof credential !== 'object') {
    return false;
  }

  const candidate = credential as Partial<FallbackCredential>;
  return candidate.type === 'fallback-pbkdf2' && candidate.prfEnabled === false;
}

// ====================
// INTERNAL HELPERS
// ====================

/**
 * Get WebAuthn assertion
 * @internal
 */
async function getAssertion(
  credentialId: string,
  challenge: Uint8Array
): Promise<PublicKeyCredential> {
  ensureBrowserSupport('get assertion');

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: window.location.hostname,
      userVerification: 'required',
      allowCredentials: [{
        type: 'public-key',
        id: base64UrlToArrayBuffer(credentialId)
      }]
    }
  });
  
  if (!credential) {
    throw new Error('Failed to get assertion');
  }
  
  return credential as PublicKeyCredential;
}

/**
 * Helper: base64 to ArrayBuffer
 * @internal
 */
function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  
  // Decode base64 to bytes
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    // Node.js environment - use Buffer for base64 decoding
    const buffer = Buffer.from(padded, 'base64');
    bytes = new Uint8Array(buffer);
  } else {
    // Browser environment - use atob
    const binary = atob(padded);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }
  
  // Always create a new, detached ArrayBuffer to ensure Web Crypto API compatibility
  // This ensures the ArrayBuffer is not a view of another buffer
  const arrayBuffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(bytes);
  return arrayBuffer;
}

/**
 * Helper: ArrayBuffer to base64
 * @internal
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ensureBrowserSupport(action: string): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new Error(`Cannot ${action} outside browser environment`);
  }
}