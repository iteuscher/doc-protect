import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { createCredential, listUserCredentials, getUserCredential, deleteCredential } from '@/lib/auth/webauthn';
import type { WebAuthnCredential } from '@/lib/types/credential';

vi.mock('@/lib/storage/indexeddb', () => {
  return {
    storeCredential: vi.fn(),
    listCredentials: vi.fn().mockResolvedValue([]),
    getCredential: vi.fn().mockResolvedValue(null),
    deleteCredential: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('@/lib/auth/prf-detection', () => ({
  detectPRFSupport: vi.fn()
}));

vi.mock('@/lib/auth/fallback', () => ({
  createFallbackCredential: vi.fn()
}));

vi.mock('age-encryption', () => ({
  webauthn: {
    createCredential: vi.fn()
  }
}));

const mockedStorage = await import('@/lib/storage/indexeddb');
const mockedDetection = await import('@/lib/auth/prf-detection');
const mockedFallback = await import('@/lib/auth/fallback');
const ageModule = await import('age-encryption');

const storeCredentialMock = mockedStorage.storeCredential as Mock;
const listCredentialsMock = mockedStorage.listCredentials as Mock;
const getCredentialMock = mockedStorage.getCredential as Mock;
const deleteCredentialMock = mockedStorage.deleteCredential as Mock;
const detectSupportMock = mockedDetection.detectPRFSupport as Mock;
const createFallbackMock = mockedFallback.createFallbackCredential as Mock;
const ageCreateCredentialMock = ageModule.webauthn.createCredential as Mock;

describe('WebAuthn credential management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true
    });
  });

  it('creates PRF credential when supported', async () => {
    detectSupportMock.mockResolvedValue({
      supported: true,
      fallbackRequired: false
    });
    ageCreateCredentialMock.mockResolvedValue('AGE-PLUGIN-FIDO2PRF-1-test');

    await createCredential({
      userId: 'user@example.com',
      userName: 'User',
      keyName: 'Primary',
      type: 'passkey'
    });

    expect(ageCreateCredentialMock).toHaveBeenCalledWith({
      keyName: 'Primary',
      type: 'passkey',
      rpId: 'localhost'
    });
    expect(storeCredentialMock).toHaveBeenCalled();
    const storedArg = storeCredentialMock.mock.calls[0][0] as WebAuthnCredential;
    expect(storedArg.prfEnabled).toBe(true);
    expect(storedArg.identity).toBe('AGE-PLUGIN-FIDO2PRF-1-test');
  });

  it('falls back when PRF unsupported or forced', async () => {
    detectSupportMock.mockResolvedValue({
      supported: false,
      fallbackRequired: true
    });
    createFallbackMock.mockResolvedValue({
      credentialId: 'fallback-1',
      identity: 'fallback-1',
      type: 'fallback-pbkdf2',
      keyName: 'Fallback',
      userId: 'user@example.com',
      userName: 'User',
      prfEnabled: false,
      createdAt: new Date().toISOString()
    });

    const credential = await createCredential({
      userId: 'user@example.com',
      userName: 'User',
      keyName: 'Fallback',
      forceFallback: true
    });

    expect(createFallbackMock).toHaveBeenCalled();
    expect(credential.prfEnabled).toBe(false);
  });

  it('lists stored credentials', async () => {
    listCredentialsMock.mockResolvedValue([
      { credentialId: 'cred-1' }
    ]);

    const list = await listUserCredentials();
    expect(listCredentialsMock).toHaveBeenCalled();
    expect(list).toHaveLength(1);
  });

  it('gets and deletes credential by id', async () => {
    getCredentialMock.mockResolvedValue({
      credentialId: 'cred-1'
    });

    const credential = await getUserCredential('cred-1');
    expect(getCredentialMock).toHaveBeenCalledWith('cred-1');
    expect(credential?.credentialId).toBe('cred-1');

    await deleteCredential('cred-1');
    expect(deleteCredentialMock).toHaveBeenCalledWith('cred-1');
  });
});

