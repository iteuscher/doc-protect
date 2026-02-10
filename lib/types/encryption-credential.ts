/**
 * Unified Encryption Credential Type
 *
 * Allows the encryption engine to work with any credential source:
 * WebAuthn PRF, fallback PBKDF2, PQ keypair, or x25519 keypair.
 */

import type { StoredKeypair } from './settings';

/** Credential backed by a stored PQ or x25519 keypair */
export interface KeypairCredential {
  type: 'pq-keypair' | 'x25519-keypair';
  keypairId: string;
  identity: string;
  recipient: string;
  label: string;
}

/** Convert a StoredKeypair to a KeypairCredential for use in encryption */
export function keypairToCredential(keypair: StoredKeypair): KeypairCredential {
  return {
    type: keypair.algorithm === 'age-pq' ? 'pq-keypair' : 'x25519-keypair',
    keypairId: keypair.id,
    identity: keypair.identity,
    recipient: keypair.recipient,
    label: keypair.label,
  };
}
