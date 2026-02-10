import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePQKeypair, generateX25519Keypair } from '@/lib/crypto/keygen';

const storeKeypairMock = vi.hoisted(() => vi.fn(async (kp: unknown) => kp));

vi.mock('@/lib/storage/indexeddb', () => ({
  storeKeypair: storeKeypairMock
}));

vi.mock('age-encryption', () => ({
  generateHybridIdentity: vi.fn(async () => 'AGE-SECRET-KEY-PQ-1FAKEPQIDENTITY'),
  generateIdentity: vi.fn(async () => 'AGE-SECRET-KEY-1FAKEX25519IDENTITY'),
  identityToRecipient: vi.fn(async (identity: string) => {
    if (identity.includes('PQ')) return 'age1pq1fakerecipient';
    return 'age1fakex25519recipient';
  })
}));

describe('Key generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a post-quantum keypair', async () => {
    const keypair = await generatePQKeypair('My PQ Key');

    expect(keypair.algorithm).toBe('age-pq');
    expect(keypair.label).toBe('My PQ Key');
    expect(keypair.identity).toBe('AGE-SECRET-KEY-PQ-1FAKEPQIDENTITY');
    expect(keypair.recipient).toBe('age1pq1fakerecipient');
    expect(keypair.id).toBeTruthy();
    expect(keypair.createdAt).toBeTruthy();
    expect(storeKeypairMock).toHaveBeenCalledWith(keypair);
  });

  it('generates an x25519 keypair', async () => {
    const keypair = await generateX25519Keypair('My x25519 Key');

    expect(keypair.algorithm).toBe('age-x25519');
    expect(keypair.label).toBe('My x25519 Key');
    expect(keypair.identity).toBe('AGE-SECRET-KEY-1FAKEX25519IDENTITY');
    expect(keypair.recipient).toBe('age1fakex25519recipient');
    expect(keypair.id).toBeTruthy();
    expect(keypair.createdAt).toBeTruthy();
    expect(storeKeypairMock).toHaveBeenCalledWith(keypair);
  });

  it('generates unique IDs for each keypair', async () => {
    const kp1 = await generatePQKeypair('Key 1');
    const kp2 = await generatePQKeypair('Key 2');

    expect(kp1.id).not.toBe(kp2.id);
  });
});
