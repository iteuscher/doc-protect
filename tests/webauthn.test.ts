import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { createCredential, listUserCredentials, getUserCredential, deleteCredential, selectExistingCredential } from '@/lib/auth/webauthn';
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
  detectPRFSupport: vi.fn(),
  detectPRFSupportLazy: vi.fn(),
  cachePRFSupport: vi.fn()
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
const detectSupportLazyMock = mockedDetection.detectPRFSupportLazy as Mock;
const cachePRFSupportMock = mockedDetection.cachePRFSupport as Mock;
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

  it('creates PRF credential when lazy detection says supported', async () => {
    detectSupportLazyMock.mockReturnValue({
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
    // Should not have called detectPRFSupport (async) since lazy returned a result
    expect(detectSupportMock).not.toHaveBeenCalled();
  });

  it('uses prfSupportOverride when provided', async () => {
    ageCreateCredentialMock.mockResolvedValue('AGE-PLUGIN-FIDO2PRF-1-override');

    await createCredential({
      keyName: 'Override',
      prfSupportOverride: {
        supported: true,
        fallbackRequired: false
      }
    });

    expect(detectSupportLazyMock).not.toHaveBeenCalled();
    expect(detectSupportMock).not.toHaveBeenCalled();
    expect(ageCreateCredentialMock).toHaveBeenCalled();
  });

  it('falls back to detectPRFSupport when lazy returns null', async () => {
    detectSupportLazyMock.mockReturnValue(null);
    detectSupportMock.mockResolvedValue({
      supported: true,
      fallbackRequired: false
    });
    ageCreateCredentialMock.mockResolvedValue('AGE-PLUGIN-FIDO2PRF-1-async');

    await createCredential({ keyName: 'AsyncDetect' });

    expect(detectSupportLazyMock).toHaveBeenCalled();
    expect(detectSupportMock).toHaveBeenCalled();
    expect(ageCreateCredentialMock).toHaveBeenCalled();
  });

  it('falls back to PBKDF2 when PRF creation fails', async () => {
    detectSupportLazyMock.mockReturnValue({
      supported: true,
      fallbackRequired: false,
      platform: 'macOS'
    });
    ageCreateCredentialMock.mockRejectedValue(new Error('PRF not available'));
    createFallbackMock.mockResolvedValue({
      credentialId: 'fallback-1',
      type: 'fallback-pbkdf2',
      keyName: 'Fallback',
      userId: 'user@rico.local',
      userName: 'Rico User',
      prfEnabled: false,
      createdAt: new Date().toISOString()
    });

    const credential = await createCredential({ keyName: 'Fallback' });

    expect(ageCreateCredentialMock).toHaveBeenCalled();
    expect(createFallbackMock).toHaveBeenCalled();
    expect(credential.prfEnabled).toBe(false);
    // Should cache the PRF failure
    expect(cachePRFSupportMock).toHaveBeenCalledWith(
      expect.objectContaining({ supported: false, fallbackRequired: true })
    );
  });

  it('falls back when PRF unsupported or forced', async () => {
    detectSupportLazyMock.mockReturnValue({
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

describe('selectExistingCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true
    });
  });

  it('selects credential matching stored credential ID', async () => {
    const storedCred: WebAuthnCredential = {
      credentialId: 'dGVzdA',
      identity: 'AGE-PLUGIN-FIDO2PRF-1-stored',
      type: 'passkey',
      keyName: 'Test Key',
      userId: 'user@example.com',
      userName: 'User',
      prfEnabled: true,
      createdAt: new Date().toISOString()
    };

    listCredentialsMock.mockResolvedValue([storedCred]);

    // Mock navigator.credentials.get to return a credential with matching rawId
    const rawId = new Uint8Array([116, 101, 115, 116]).buffer; // "test" in bytes → btoa = "dGVzdA=="
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: vi.fn().mockResolvedValue({
          id: 'dGVzdA',
          rawId,
          type: 'public-key'
        })
      }
    });

    const result = await selectExistingCredential();
    expect(result.credentialId).toBe('dGVzdA');
    expect((result as WebAuthnCredential).identity).toBe('AGE-PLUGIN-FIDO2PRF-1-stored');
  });

  it('throws when user cancels passkey picker', async () => {
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: vi.fn().mockResolvedValue(null)
      }
    });

    await expect(selectExistingCredential()).rejects.toThrow('No credential selected');
  });

  it('throws when selected passkey is not in IndexedDB', async () => {
    listCredentialsMock.mockResolvedValue([]);

    const rawId = new Uint8Array([1, 2, 3]).buffer;
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: vi.fn().mockResolvedValue({
          id: 'AQID',
          rawId,
          type: 'public-key'
        })
      }
    });

    await expect(selectExistingCredential()).rejects.toThrow('not created by Rico');
  });
});

