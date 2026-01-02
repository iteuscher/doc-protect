import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  createCredential,
  listUserCredentials,
  getUserCredential,
  deleteCredential,
  selectExistingCredential,
  useExternalCredential
} from '@/lib/auth/webauthn';
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

  it('useExternalCredential returns undefined', () => {
    const result = useExternalCredential();
    expect(result).toBeUndefined();
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

  it('selects existing credential from browser passkey picker', async () => {
    // Mock navigator.credentials.get()
    const mockCredentialId = 'test-credential-id';
    const mockRawId = new Uint8Array([1, 2, 3, 4]);
    const mockCredential = {
      id: mockCredentialId,
      rawId: mockRawId.buffer,
      type: 'public-key'
    };

    global.navigator.credentials = {
      get: vi.fn().mockResolvedValue(mockCredential)
    } as any;

    // Mock stored credential that matches
    const storedCredential: WebAuthnCredential = {
      credentialId: btoa(String.fromCharCode(...mockRawId)),
      identity: 'AGE-PLUGIN-FIDO2PRF-1-test',
      type: 'passkey',
      keyName: 'Test Key',
      userId: 'user@example.com',
      userName: 'Test User',
      prfEnabled: true,
      createdAt: new Date().toISOString(),
      metadata: {
        userAgent: 'test',
        rpId: 'localhost'
      }
    };

    listCredentialsMock.mockResolvedValue([storedCredential]);

    const result = await selectExistingCredential();

    expect(navigator.credentials.get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        challenge: expect.any(Uint8Array),
        rpId: 'localhost',
        userVerification: 'required'
      })
    });
    expect(result).toEqual(storedCredential);
  });

  it('throws error when no credential selected', async () => {
    global.navigator.credentials = {
      get: vi.fn().mockResolvedValue(null)
    } as any;

    await expect(selectExistingCredential()).rejects.toThrow(
      'No credential selected'
    );
  });

  it('throws error when selected credential not found in storage', async () => {
    const mockRawId = new Uint8Array([5, 6, 7, 8]);
    const mockCredential = {
      id: 'unknown-credential',
      rawId: mockRawId.buffer,
      type: 'public-key'
    };

    global.navigator.credentials = {
      get: vi.fn().mockResolvedValue(mockCredential)
    } as any;

    listCredentialsMock.mockResolvedValue([]);

    await expect(selectExistingCredential()).rejects.toThrow(
      'This passkey has not been used with DocProtect before'
    );
  });

  it('matches credential by credential ID', async () => {
    const mockRawId = new Uint8Array([9, 10, 11, 12]);
    const credentialIdBase64 = btoa(String.fromCharCode(...mockRawId));

    const mockCredential = {
      id: credentialIdBase64,
      rawId: mockRawId.buffer,
      type: 'public-key'
    };

    global.navigator.credentials = {
      get: vi.fn().mockResolvedValue(mockCredential)
    } as any;

    const storedCredential: WebAuthnCredential = {
      credentialId: credentialIdBase64,
      identity: 'AGE-PLUGIN-FIDO2PRF-1-match',
      type: 'security-key',
      keyName: 'Security Key',
      userId: 'user@example.com',
      userName: 'Test User',
      prfEnabled: true,
      createdAt: new Date().toISOString(),
      metadata: {
        userAgent: 'test',
        rpId: 'localhost'
      }
    };

    listCredentialsMock.mockResolvedValue([storedCredential]);

    const result = await selectExistingCredential();
    expect(result).toEqual(storedCredential);
  });

  it('ignores fallback credentials when matching', async () => {
    const mockRawId = new Uint8Array([13, 14, 15, 16]);
    const mockCredential = {
      id: 'webauthn-cred',
      rawId: mockRawId.buffer,
      type: 'public-key'
    };

    global.navigator.credentials = {
      get: vi.fn().mockResolvedValue(mockCredential)
    } as any;

    const fallbackCredential = {
      credentialId: 'fallback-1',
      identity: 'fallback-1',
      type: 'fallback-pbkdf2' as const,
      keyName: 'Fallback',
      userId: 'user@example.com',
      userName: 'User',
      prfEnabled: false,
      createdAt: new Date().toISOString()
    };

    listCredentialsMock.mockResolvedValue([fallbackCredential]);

    await expect(selectExistingCredential()).rejects.toThrow(
      'This passkey has not been used with DocProtect before'
    );
  });
});

