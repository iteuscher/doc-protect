# WebAuthn PRF Fallback Strategy

## Problem Statement

As of January 2025, the WebAuthn PRF (hmac-secret) extension is **not supported on Windows 10 and Windows 11**. This means users on Windows cannot use typage's built-in PRF-based encryption, which requires the authenticator to generate deterministic HMAC outputs.

## Current Support Matrix

| Platform | PRF Support | Notes |
|----------|-------------|-------|
| macOS 13+ | ✅ Yes | Via platform authenticator (Touch ID) |
| iOS 16+ | ✅ Yes | Via Face ID / Touch ID |
| Android 14+ | ✅ Yes | Via platform authenticator |
| Chrome OS | ✅ Yes | Via platform authenticator |
| Windows 10 | ❌ No | Windows Hello does not support hmac-secret |
| Windows 11 | ❌ No | Windows Hello does not support hmac-secret |
| YubiKey 5+ | ✅ Yes | Hardware support (cross-platform) |

## Detection Strategy

### Step 1: Attempt PRF Credential Creation
```typescript
// lib/auth/prf-detection.ts

export interface PRFSupportResult {
  supported: boolean;
  fallbackRequired: boolean;
  fallbackMethod?: 'pbkdf2-webauthn' | 'passphrase';
  testCredential?: string; // Identity string if successful
}

export async function detectPRFSupport(): Promise<PRFSupportResult> {
  try {
    // Attempt to create a test credential with PRF
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
          name: 'prf-test',
          displayName: 'PRF Test User'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }  // RS256
        ],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'preferred'
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
    
    // Check if PRF extension was successfully enabled
    const extensions = credential.getClientExtensionResults();
    const prfEnabled = extensions.prf?.enabled === true;
    
    if (prfEnabled && extensions.prf?.results?.first) {
      // PRF is supported!
      // Clean up test credential (optional - it's a resident key)
      return {
        supported: true,
        fallbackRequired: false
      };
    } else {
      // Credential created but PRF not enabled
      return {
        supported: false,
        fallbackRequired: true,
        fallbackMethod: 'pbkdf2-webauthn'
      };
    }
    
  } catch (error) {
    console.error('PRF detection failed:', error);
    
    // Could be NotSupportedError, NotAllowedError, etc.
    return {
      supported: false,
      fallbackRequired: true,
      fallbackMethod: 'pbkdf2-webauthn'
    };
  }
}
```

### Step 2: Cache Detection Result
```typescript
// Store in localStorage to avoid repeated prompts
const PRF_SUPPORT_CACHE_KEY = 'docprotect:prf-support';

export async function getPRFSupport(): Promise<PRFSupportResult> {
  // Check cache first (valid for 7 days)
  const cached = localStorage.getItem(PRF_SUPPORT_CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
      return parsed.result;
    }
  }
  
  // Run detection
  const result = await detectPRFSupport();
  
  // Cache result
  localStorage.setItem(PRF_SUPPORT_CACHE_KEY, JSON.stringify({
    result,
    timestamp: Date.now()
  }));
  
  return result;
}
```

## Fallback Implementation

### Option 1: PBKDF2 + WebAuthn Assertion (Recommended)

**Approach:** Use standard WebAuthn to generate an assertion signature, then derive encryption key from that signature using PBKDF2.

**Advantages:**
- Still passwordless
- Deterministic (same authenticator = same key)
- No PRF required

**Disadvantages:**
- Not compatible with age CLI (typage PRF identities won't work)
- Requires custom age recipient type
- Slightly less secure than PRF (assertion signatures may leak some info)
```typescript
// lib/crypto/fallback-encryption.ts

import * as age from 'age-encryption';

export async function createFallbackCredential(options: {
  userId: string;
  userName: string;
  keyName: string;
}): Promise<FallbackCredential> {
  // Create standard WebAuthn credential (no PRF)
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        id: window.location.hostname,
        name: 'DocProtect'
      },
      user: {
        id: new TextEncoder().encode(options.userId),
        name: options.userName,
        displayName: options.userName
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required'
      },
      timeout: 60000
    }
  }) as PublicKeyCredential;
  
  return {
    credentialId: base64encode(credential.rawId),
    type: 'fallback-pbkdf2',
    userId: options.userId,
    userName: options.userName,
    keyName: options.keyName,
    createdAt: new Date().toISOString()
  };
}

export async function deriveKeyFromAssertion(
  credentialId: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  // Get WebAuthn assertion
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: salt, // Use salt as challenge
      rpId: window.location.hostname,
      userVerification: 'required',
      allowCredentials: [{
        type: 'public-key',
        id: base64decode(credentialId)
      }]
    }
  }) as PublicKeyCredential;
  
  const response = assertion.response as AuthenticatorAssertionResponse;
  
  // Derive key from signature using PBKDF2
  const signatureKey = await crypto.subtle.importKey(
    'raw',
    response.signature,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    signatureKey,
    256 // 32 bytes
  );
  
  return new Uint8Array(derivedBits);
}

export async function encryptWithFallback(
  file: File,
  credential: FallbackCredential
): Promise<Uint8Array> {
  // 1. Generate file-specific salt
  const salt = crypto.getRandomValues(new Uint8Array(32));
  
  // 2. Derive key from WebAuthn assertion
  const fileKey = await deriveKeyFromAssertion(credential.credentialId, salt);
  
  // 3. Encrypt file with derived key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    fileKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const fileData = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    fileData
  );
  
  // 4. Package: salt || iv || encrypted_data
  const output = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  output.set(salt, 0);
  output.set(iv, salt.length);
  output.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return output;
}
```

### Option 2: Passphrase Fallback (Simpler, Less Secure)

**Approach:** Fall back to password-based encryption using age's scrypt recipient.

**Advantages:**
- Compatible with age CLI
- Simple implementation (typage already supports it)

**Disadvantages:**
- Requires user to remember passphrase
- Not truly passwordless
```typescript
// If PRF not supported, offer passphrase option
if (!prfSupport.supported) {
  // Use age's built-in passphrase encryption
  const encrypter = new age.Encrypter();
  encrypter.setPassphrase(userProvidedPassphrase);
  const encrypted = await encrypter.encrypt(fileData);
}
```

## Manifest Modifications

Fallback-encrypted files must be marked in the manifest:
```json
{
  "version": "1.0.0",
  "encryptionInfo": {
    "algorithm": "age-fallback",  // Not standard age
    "method": "pbkdf2-webauthn",
    "prfAvailable": false,
    "recipients": [
      {
        "type": "fallback-pbkdf2",
        "credentialId": "base64...",
        "salt": "base64..."  // File-specific salt
      }
    ]
  },
  "warnings": [
    "This file was encrypted without WebAuthn PRF support. It may not be compatible with the age CLI."
  ]
}
```

## User Experience

### Initial Setup
```typescript
// components/auth/CredentialSetup.tsx

export function CredentialSetup() {
  const [prfSupport, setPRFSupport] = useState<PRFSupportResult | null>(null);
  
  useEffect(() => {
    getPRFSupport().then(setPRFSupport);
  }, []);
  
  if (prfSupport === null) {
    return <div>Checking browser compatibility...</div>;
  }
  
  if (!prfSupport.supported) {
    return (
      <div className="warning">
        <h3>⚠️ Limited WebAuthn Support Detected</h3>
        <p>
          Your browser or operating system does not support the WebAuthn PRF extension,
          which is required for optimal security and compatibility.
        </p>
        <p>
          <strong>This typically affects Windows 10 and Windows 11 users.</strong>
        </p>
        <p>Options:</p>
        <ul>
          <li>
            <strong>Use a hardware security key</strong> (YubiKey 5+) which supports PRF
          </li>
          <li>
            <strong>Use fallback mode</strong> - Files will be encrypted but may not be
            compatible with the age command-line tool
          </li>
          <li>
            <strong>Use a different device</strong> (macOS, iOS, Android, Chrome OS)
          </li>
        </ul>
        <button onClick={setupFallbackCredential}>
          Continue with Fallback Mode
        </button>
      </div>
    );
  }
  
  return (
    <div>
      <h3>✅ Full WebAuthn PRF Support Detected</h3>
      <p>Your browser supports passwordless encryption!</p>
      <button onClick={setupPRFCredential}>
        Create Encryption Key
      </button>
    </div>
  );
}
```

## Testing PRF Fallback
```typescript
// tests/prf-fallback.test.ts

import { describe, it, expect } from 'vitest';
import { encryptWithFallback, decryptWithFallback } from '@/lib/crypto/fallback-encryption';

describe('PRF Fallback', () => {
  it('should encrypt and decrypt without PRF', async () => {
    // Mock WebAuthn credential without PRF
    const credential = await createFallbackCredential({
      userId: 'test@example.com',
      userName: 'Test User',
      keyName: 'Test Key'
    });
    
    const file = new File(['Hello, DocProtect!'], 'test.txt');
    const encrypted = await encryptWithFallback(file, credential);
    const decrypted = await decryptWithFallback(encrypted, credential);
    
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, DocProtect!');
  });
});
```

## Recommendation

**For MVP**: Implement Option 1 (PBKDF2 + WebAuthn Assertion) as it maintains passwordless UX while supporting Windows users. Display a clear warning that files encrypted in fallback mode may not be compatible with age CLI.

**Post-MVP**: Add Option 2 (Passphrase) as an additional choice for users who want age CLI compatibility and are willing to use passwords.