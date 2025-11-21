import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectPRFSupport,
  getCachedPRFSupport,
  clearPRFCache,
  testPRFWithAuthenticatorType
} from '@/lib/auth/prf-detection';

const mockNavigatorCredentials = () => {
  const create = vi.fn();
  const get = vi.fn();

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create,
      get
    }
  });

  return { create, get };
};

const mockUserAgent = (ua: string) => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: { platform: ua.includes('Windows') ? 'Windows' : 'macOS' }
  });
};

describe('PRF detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearPRFCache();
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');
  });

  it('detects PRF support when extension succeeds', async () => {
    const { create } = mockNavigatorCredentials();
    create.mockResolvedValue({
      getClientExtensionResults: () => ({
        prf: { enabled: true, results: { first: new Uint8Array([1, 2, 3]) } }
      })
    });

    const result = await detectPRFSupport(true);

    expect(result.supported).toBe(true);
    expect(result.fallbackRequired).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('falls back when PRF creation fails', async () => {
    const { create } = mockNavigatorCredentials();
    create.mockRejectedValue(new Error('Not supported'));

    const result = await detectPRFSupport(true);

    expect(result.supported).toBe(false);
    expect(result.fallbackRequired).toBe(true);
  });

  it('returns cached result without new PRF attempt', async () => {
    const { create } = mockNavigatorCredentials();
    create.mockResolvedValue({
      getClientExtensionResults: () => ({
        prf: { enabled: true, results: { first: new Uint8Array([1]) } }
      })
    });

    const first = await detectPRFSupport(true);
    expect(first.supported).toBe(true);

    // Change mock to ensure subsequent call would fail if invoked
    create.mockRejectedValue(new Error('Should not be used'));
    const second = await detectPRFSupport();

    expect(second.supported).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCachedPRFSupport()).not.toBeNull();
  });

  it('tests authenticator type specific PRF capability', async () => {
    const { create } = mockNavigatorCredentials();
    create.mockResolvedValue({
      getClientExtensionResults: () => ({
        prf: { enabled: true, results: { first: new Uint8Array([1]) } }
      })
    });

    const result = await testPRFWithAuthenticatorType('security-key');
    expect(result).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);

    const selection = create.mock.calls[0][0].publicKey.authenticatorSelection;
    expect(selection.authenticatorAttachment).toBe('cross-platform');
  });
});

