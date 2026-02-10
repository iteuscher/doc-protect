/**
 * Key Generation Module
 *
 * Wraps age-encryption v0.3.0 APIs for generating
 * post-quantum hybrid and classic x25519 keypairs.
 */

import * as age from 'age-encryption';
import type { StoredKeypair } from '@/lib/types/settings';
import { storeKeypair } from '@/lib/storage/indexeddb';

/**
 * Generate a post-quantum hybrid keypair.
 * Uses ML-KEM-768 + X25519 hybrid encryption.
 *
 * @param label - Human-readable label for this keypair
 * @returns Stored keypair with identity and recipient strings
 */
export async function generatePQKeypair(label: string): Promise<StoredKeypair> {
  const identity = await age.generateHybridIdentity();
  const recipient = await age.identityToRecipient(identity);

  const keypair: StoredKeypair = {
    id: crypto.randomUUID(),
    algorithm: 'age-pq',
    identity,
    recipient,
    label,
    createdAt: new Date().toISOString(),
  };

  await storeKeypair(keypair);
  return keypair;
}

/**
 * Generate a classic x25519 keypair.
 *
 * @param label - Human-readable label for this keypair
 * @returns Stored keypair with identity and recipient strings
 */
export async function generateX25519Keypair(label: string): Promise<StoredKeypair> {
  const identity = await age.generateIdentity();
  const recipient = await age.identityToRecipient(identity);

  const keypair: StoredKeypair = {
    id: crypto.randomUUID(),
    algorithm: 'age-x25519',
    identity,
    recipient,
    label,
    createdAt: new Date().toISOString(),
  };

  await storeKeypair(keypair);
  return keypair;
}
