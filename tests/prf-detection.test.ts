import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectPRFSupport,
  detectPRFSupportLazy,
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

  it('uses heuristic on known macOS platform without creating test credential', async () => {
    const { create } = mockNavigatorCredentials();

    const result = await detectPRFSupport(true);

    expect(result.supported).toBe(true);
    expect(result.fallbackRequired).toBe(false);
    // Should NOT create a test credential on known platforms
    expect(create).not.toHaveBeenCalled();
  });

  it('uses heuristic on Windows and detects no PRF support', async () => {
    mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const { create } = mockNavigatorCredentials();

    const result = await detectPRFSupport(true);

    expect(result.supported).toBe(false);
    expect(result.fallbackRequired).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('falls back to test credential on unknown platform', async () => {
    mockUserAgent('Mozilla/5.0 (Unknown Platform)');
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'Unknown' }
    });
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

  it('falls back when PRF creation fails on unknown platform', async () => {
    mockUserAgent('Mozilla/5.0 (Unknown Platform)');
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'Unknown' }
    });
    const { create } = mockNavigatorCredentials();
    create.mockRejectedValue(new Error('Not supported'));

    const result = await detectPRFSupport(true);

    expect(result.supported).toBe(false);
    expect(result.fallbackRequired).toBe(true);
  });

  it('returns cached result without new PRF attempt', async () => {
    mockNavigatorCredentials();

    const first = await detectPRFSupport(true);
    expect(first.supported).toBe(true);

    const second = await detectPRFSupport();

    expect(second.supported).toBe(true);
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

describe('detectPRFSupportLazy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearPRFCache();
  });

  it('returns cached result if available', async () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');
    // Prime the cache
    await detectPRFSupport(true);

    const result = detectPRFSupportLazy();
    expect(result).not.toBeNull();
    expect(result!.supported).toBe(true);
  });

  it('returns heuristic result on known platform without cache', () => {
    mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');

    const result = detectPRFSupportLazy();
    expect(result).not.toBeNull();
    expect(result!.supported).toBe(true);
  });

  it('returns null on unknown platform without cache', () => {
    mockUserAgent('Mozilla/5.0 (Unknown Platform)');
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'Unknown' }
    });

    const result = detectPRFSupportLazy();
    expect(result).toBeNull();
  });

  it('returns fallback result on Windows', () => {
    mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

    const result = detectPRFSupportLazy();
    expect(result).not.toBeNull();
    expect(result!.supported).toBe(false);
    expect(result!.fallbackRequired).toBe(true);
  });
});

