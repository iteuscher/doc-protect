/**
 * WebAuthn PRF Support Detection
 *
 * Detects whether the current browser/authenticator supports the
 * WebAuthn PRF (hmac-secret) extension.
 *
 * NOTE: Windows 10/11 do NOT support PRF as of Nov 2025!
 *
 * References:
 * - PRF spec: https://w3c.github.io/webauthn/#prf-extension
 * - Browser support: docs/PRF_FALLBACK_STRATEGY.md
 */

import type { PRFSupport } from '@/lib/types/credential';

const PRF_SUPPORT_CACHE_KEY = 'docprotect:prf-support';
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedSupport {
  result: PRFSupport;
  timestamp: number;
}

const FALLBACK_RESULT: PRFSupport = {
  supported: false,
  fallbackRequired: true,
  fallbackMethod: 'pbkdf2-webauthn'
};

/**
 * Detect PRF support with caching
 */
export async function detectPRFSupport(forceRetest = false): Promise<PRFSupport> {
  if (!isBrowserEnvironment()) {
    return {
      ...FALLBACK_RESULT,
      platform: 'server',
      detectedAt: new Date().toISOString()
    };
  }

  if (!forceRetest) {
    const cached = readCachedSupport();
    if (cached) {
      return cached.result;
    }
  }

  const platformInfo = getPlatformPRFInfo();

  try {
    const testResult = await createTestPRFCredential();
    const result: PRFSupport = testResult.success && testResult.prfEnabled
      ? {
          supported: true,
          fallbackRequired: false,
          platform: platformInfo.platform,
          detectedAt: new Date().toISOString()
        }
      : {
          ...FALLBACK_RESULT,
          platform: platformInfo.platform,
          detectedAt: new Date().toISOString(),
          fallbackMethod: 'pbkdf2-webauthn'
        };

    cachePRFSupport(result);
    return result;
  } catch (error) {
    console.error('PRF detection failed:', error);
    const result: PRFSupport = {
      ...FALLBACK_RESULT,
      platform: platformInfo.platform,
      detectedAt: new Date().toISOString()
    };
    cachePRFSupport(result);
    return result;
  }
}

/**
 * Get cached PRF support (no user prompt)
 */
export function getCachedPRFSupport(): PRFSupport | null {
  if (!isBrowserEnvironment()) {
    return null;
  }

  const cached = readCachedSupport();
  return cached?.result ?? null;
}

/**
 * Clear PRF support cache
 */
export function clearPRFCache(): void {
  if (!isBrowserEnvironment() || typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(PRF_SUPPORT_CACHE_KEY);
}

/**
 * Get platform-specific PRF support info
 */
export function getPlatformPRFInfo(): {
  platform: string;
  os: string;
  likelySupported: boolean;
  recommendation: string;
} {
  if (!isBrowserEnvironment()) {
    return {
      platform: 'server',
      os: 'unknown',
      likelySupported: false,
      recommendation: 'PRF detection unavailable outside browser'
    };
  }

  const ua = navigator.userAgent ?? '';
  type NavigatorWithUA = Navigator & { userAgentData?: { platform?: string } };
  const navigatorWithUA = navigator as NavigatorWithUA;
  const platform =
    navigatorWithUA.userAgentData?.platform ?? navigator.platform ?? 'unknown';
  const lowered = ua.toLowerCase();

  if (/windows nt (1[01]|10\.0)/i.test(ua)) {
    return {
      platform,
      os: 'Windows 10/11',
      likelySupported: false,
      recommendation: 'Use fallback mode or hardware security key with PRF support'
    };
  }

  if (/mac os x 1[3-9]/i.test(ua) || lowered.includes('macintosh')) {
    return {
      platform,
      os: 'macOS',
      likelySupported: true,
      recommendation: 'Platform authenticators support PRF (Touch ID)'
    };
  }

  if (/iphone os 1[6-9]/i.test(ua) || /ipad; cpu os 1[6-9]/i.test(ua)) {
    return {
      platform,
      os: 'iOS/iPadOS',
      likelySupported: true,
      recommendation: 'PRF supported on iOS 16+'
    };
  }

  if (/android 1[4-9]/i.test(ua)) {
    return {
      platform,
      os: 'Android',
      likelySupported: true,
      recommendation: 'Most Android 14+ devices support PRF'
    };
  }

  if (/cros/i.test(ua)) {
    return {
      platform,
      os: 'Chrome OS',
      likelySupported: true,
      recommendation: 'Chrome OS authenticators support PRF'
    };
  }

  return {
    platform,
    os: 'unknown',
    likelySupported: false,
    recommendation: 'PRF support unknown; attempt detection at runtime'
  };
}

/**
 * Test PRF with specific authenticator
 */
export async function testPRFWithAuthenticatorType(
  type: 'passkey' | 'security-key'
): Promise<boolean> {
  if (!isBrowserEnvironment()) {
    return false;
  }

  const authenticatorAttachment: AuthenticatorAttachment =
    type === 'passkey' ? 'platform' : 'cross-platform';

  const result = await createTestPRFCredential(authenticatorAttachment);
  return result.success && result.prfEnabled;
}

// ====================
// INTERNAL HELPERS
// ====================

/**
 * Create test PRF credential
 */
async function createTestPRFCredential(
  authenticatorAttachment?: AuthenticatorAttachment
): Promise<{
  success: boolean;
  prfEnabled: boolean;
  error?: string;
}> {
  try {
    if (!navigator.credentials?.create) {
      throw new Error('WebAuthn credential creation not available');
    }

    const testSalt = crypto.getRandomValues(new Uint8Array(32));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          id: window.location.hostname,
          name: 'DocProtect PRF Test'
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'prf-test-' + Date.now(),
          displayName: 'PRF Test'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'preferred',
          authenticatorAttachment
        },
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: testSalt
            }
          }
        }
      }
    }) as PublicKeyCredential;

    const extensions = credential.getClientExtensionResults();
    const prfEnabled =
      extensions.prf?.enabled === true && !!extensions.prf?.results?.first;

    return {
      success: true,
      prfEnabled
    };
  } catch (error: unknown) {
    return {
      success: false,
      prfEnabled: false,
      error: error instanceof Error ? error.message : 'PRF detection failed'
    };
  }
}

function cachePRFSupport(result: PRFSupport): void {
  if (!isBrowserEnvironment() || typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    PRF_SUPPORT_CACHE_KEY,
    JSON.stringify({
      result,
      timestamp: Date.now()
    })
  );
}

function readCachedSupport(): CachedSupport | null {
  if (!isBrowserEnvironment() || typeof localStorage === 'undefined') {
    return null;
  }

  const cachedRaw = localStorage.getItem(PRF_SUPPORT_CACHE_KEY);
  if (!cachedRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(cachedRaw) as CachedSupport;
    if (!parsed.timestamp || !parsed.result) {
      return null;
    }

    const isFresh = Date.now() - parsed.timestamp < CACHE_DURATION_MS;
    if (!isFresh) {
      localStorage.removeItem(PRF_SUPPORT_CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to parse PRF cache:', error);
    localStorage.removeItem(PRF_SUPPORT_CACHE_KEY);
    return null;
  }
}

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}