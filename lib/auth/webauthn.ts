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
  options: CreateCredentialOptions
): Promise<WebAuthnCredential | FallbackCredential> {
  ensureBrowserEnvironment();

  const { userId, userName, keyName, type = 'passkey', forceFallback = false } = options;
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