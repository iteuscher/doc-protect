/**
 * WebAuthn Credential Management
 * 
 * Handles creation and management of WebAuthn credentials for DocProtect.
 * Uses typage's built-in WebAuthn PRF support.
 * 
 * References:
 * - WebAuthn spec: https://w3c.github.io/webauthn/
 * - PRF extension: https://w3c.github.io/webauthn/#prf-extension
 * - typage WebAuthn: docs/typage_README.md (see "Encrypt and decrypt a file with a passkey")
 */

import * as age from 'age-encryption';
import type { WebAuthnCredential, CreateCredentialOptions, FallbackCredential } from '@/lib/types/credential';
import {
  storeCredential,
  getCredential,
  listCredentials,
  deleteCredential as removeCredential
} from '@/lib/storage/indexeddb';
import { detectPRFSupport } from './prf-detection';
import { createFallbackCredential } from './fallback';

/**
 * Get credential for decryption without requiring IndexedDB storage
 *
 * Returns undefined to trigger browser's passkey picker during decryption.
 * This allows users to use passkeys from their password manager without
 * storing them in IndexedDB.
 *
 * @returns undefined (triggers browser passkey picker)
 */
export function useExternalCredential(): undefined {
  return undefined;
}

/**
 * Select existing WebAuthn credential for encryption
 *
 * This function:
 * 1. Shows browser's passkey picker via navigator.credentials.get()
 * 2. Lets user select an existing DocProtect passkey
 * 3. Checks IndexedDB for the credential's identity string
 * 4. Returns credential if found, throws error if not
 *
 * This allows reusing existing passkeys without creating duplicates,
 * but requires the passkey to have been previously used with DocProtect.
 *
 * @returns Selected credential with identity string
 * @throws Error if user cancels, no passkeys available, or credential not found in storage
 *
 * @example
 * ```typescript
 * const credential = await selectExistingCredential();
 * console.log(credential.identity); // AGE-PLUGIN-FIDO2PRF-1...
 * ```
 */
export async function selectExistingCredential(): Promise<WebAuthnCredential | FallbackCredential> {
  ensureBrowserEnvironment();

  // Call navigator.credentials.get() to show passkey picker
  const credentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: new Uint8Array(32), // Random challenge
      rpId: window.location.hostname,
      userVerification: 'required',
      timeout: 60000,
    }
  };

  // Request the credential from the browser
  const credential = await navigator.credentials.get(credentialRequestOptions) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('No credential selected. Please try again or create a new credential.');
  }

  // Extract credential ID (convert from ArrayBuffer to base64)
  const credentialIdArray = new Uint8Array(credential.rawId);
  const credentialIdBase64 = btoa(String.fromCharCode(...credentialIdArray));

  // Try to find this credential in our IndexedDB storage
  const storedCredentials = await listCredentials();
  const matchingCredential = storedCredentials.find(cred => {
    // For WebAuthn credentials, the identity string contains the credential ID
    // We need to check if this credential ID matches
    if (cred.type === 'passkey' || cred.type === 'security-key') {
      // The credential.identity is the age identity string
      // We'll match based on it containing the credential ID or being the same
      return cred.credentialId === credentialIdBase64 ||
             cred.credentialId === credential.id ||
             cred.identity.includes(credentialIdBase64);
    }
    return false;
  });

  if (!matchingCredential) {
    throw new Error(
      'This passkey has not been used with DocProtect before. ' +
      'Please create a new credential or select a different passkey that was previously created in DocProtect.'
    );
  }

  return matchingCredential;
}

/**
 * Create new WebAuthn credential for encryption
 *
 * This function:
 * 1. Detects PRF support
 * 2. Creates appropriate credential type (PRF or fallback)
 * 3. Stores credential in IndexedDB
 * 4. Returns identity string for future use
 *
 * @param options - Credential creation options
 * @returns Created credential with identity string
 *
 * @throws Error if WebAuthn not supported or user cancels
 *
 * @example
 * ```typescript
 * const credential = await createCredential({
 *   userId: 'alice@company.com',
 *   userName: 'Alice',
 *   keyName: 'My DocProtect Key',
 *   type: 'passkey'  // or 'security-key'
 * });
 *
 * console.log(credential.identity); // AGE-PLUGIN-FIDO2PRF-1...
 * ```
 */
export async function createCredential(
  options: CreateCredentialOptions = {}
): Promise<WebAuthnCredential | FallbackCredential> {
  ensureBrowserEnvironment();

  const {
    userId = 'user@docprotect.local',
    userName = 'DocProtect User',
    keyName = `DocProtect Key ${new Date().toISOString()}`,
    type = 'passkey',
    forceFallback = false
  } = options;

  const prfSupport = await detectPRFSupport();
  const shouldUseFallback = forceFallback || !prfSupport.supported;

  const credential = shouldUseFallback
    ? await createFallbackCredential({ userId, userName, keyName })
    : await createPRFCredential({ keyName, type, userId, userName });

  await storeCredential(credential);
  return credential;
}

/**
 * List all stored credentials for current user
 * 
 * @returns Array of stored credentials
 * 
 * @example
 * ```typescript
 * const credentials = await listUserCredentials();
 * credentials.forEach(cred => {
 *   console.log(`${cred.keyName}: ${cred.identity.substring(0, 30)}...`);
 * });
 * ```
 */
export async function listUserCredentials(): Promise<Array<WebAuthnCredential | FallbackCredential>> {
  return listCredentials();
}

/**
 * Get specific credential by ID
 * 
 * @param credentialId - Credential identifier
 * @returns Credential object or null if not found
 */
export async function getUserCredential(
  credentialId: string
): Promise<WebAuthnCredential | FallbackCredential | null> {
  return getCredential(credentialId);
}

/**
 * Delete credential
 * 
 * WARNING: This only deletes from IndexedDB. The actual WebAuthn credential
 * remains on the authenticator. Users should also delete it from their
 * password manager / platform settings.
 * 
 * @param credentialId - Credential to delete
 */
export async function deleteCredential(credentialId: string): Promise<void> {
  await removeCredential(credentialId);
}

/**
 * Export credential identity string for backup
 * 
 * Users should save this string securely. If they lose access to their
 * authenticator, they cannot recover encrypted files.
 * 
 * @param credentialId - Credential to export
 * @returns Identity string (AGE-PLUGIN-FIDO2PRF-1...)
 */
export async function exportCredential(credentialId: string): Promise<string> {
  const credential = await getUserCredential(credentialId);
  if (!credential) {
    throw new Error('Credential not found');
  }
  if (credential.type === 'fallback-pbkdf2') {
    return credential.credentialId;
  }
  return credential.identity;
}

async function createPRFCredential(params: {
  keyName: string;
  type: 'passkey' | 'security-key';
  userId: string;
  userName: string;
}): Promise<WebAuthnCredential> {
  ensureBrowserEnvironment();

  const identity = await age.webauthn.createCredential({
    keyName: params.keyName,
    type: params.type,
    rpId: window.location.hostname
  });

  const now = new Date().toISOString();
  return {
    credentialId: identity,
    identity,
    type: params.type,
    keyName: params.keyName,
    userId: params.userId,
    userName: params.userName,
    prfEnabled: true,
    createdAt: now,
    metadata: {
      userAgent: navigator.userAgent,
      rpId: window.location.hostname
    }
  };
}

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new Error('WebAuthn credentials can only be managed in the browser');
  }
}