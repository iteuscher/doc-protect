/**
 * Encryption Settings Type Definitions
 *
 * Defines types for encryption algorithm preferences and
 * stored PQ/x25519 keypairs.
 */

/** Encryption algorithm choices */
export type EncryptionAlgorithm = 'age-pq' | 'age-x25519' | 'age-webauthn';

/** User-persisted encryption settings */
export interface EncryptionSettings {
  /** Selected encryption algorithm */
  algorithm: EncryptionAlgorithm;

  /** ID of the active keypair (for PQ or x25519 modes) */
  activeKeypairId?: string;

  /** Last modified timestamp */
  updatedAt: string;
}

/** Default settings - WebAuthn PRF is the default */
export const DEFAULT_SETTINGS: EncryptionSettings = {
  algorithm: 'age-webauthn',
  updatedAt: new Date().toISOString(),
};

/** Stored PQ or x25519 keypair */
export interface StoredKeypair {
  /** Unique ID */
  id: string;

  /** Algorithm type this keypair is for */
  algorithm: 'age-pq' | 'age-x25519';

  /** age identity string (AGE-SECRET-KEY-...) */
  identity: string;

  /** age recipient string (age1...) */
  recipient: string;

  /** User label */
  label: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last used timestamp */
  lastUsed?: string;
}
