# Rico Implementation Guide for AI Assistants

This document provides comprehensive context for implementing Rico, a browser-based document encryption system using age encryption with WebAuthn PRF for passwordless authentication.

## Overview

Rico enables users to encrypt files locally in the browser using modern encryption (age) and authenticate with WebAuthn (passkeys/security keys) instead of passwords. The system uses WebAuthn PRF extension to derive encryption keys directly from authenticators.

## Core Technologies

### 1. **age Encryption (via typage)**
- **Library**: `age-encryption` npm package
- **Purpose**: File encryption with multi-recipient support
- **Spec**: https://age-encryption.org/v1 (see docs/REFERENCES.md)
- **Implementation**: TypeScript library with WebAuthn PRF built-in

**Key API Methods:**
```typescript
import * as age from 'age-encryption';

// Create credential (returns identity string)
const identity = await age.webauthn.createCredential({ 
  keyName: "My Encryption Key",
  type: 'passkey' | 'security-key'  // Optional, defaults to passkey
});

// Encrypt
const encrypter = new age.Encrypter();
encrypter.addRecipient(new age.webauthn.WebAuthnRecipient({ identity }));
const encrypted = await encrypter.encrypt(fileData);

// Decrypt
const decrypter = new age.Decrypter();
decrypter.addIdentity(new age.webauthn.WebAuthnIdentity({ identity }));
const decrypted = await decrypter.decrypt(encrypted, 'bytes');
```

### 2. **WebAuthn PRF Extension**
- **Purpose**: Derive deterministic encryption keys from authenticators
- **Spec**: https://w3c.github.io/webauthn/#prf-extension
- **CRITICAL**: PRF is NOT supported on Windows 10/11 as of Jan 2025
- **Fallback**: Must implement non-PRF strategy (see PRF_FALLBACK_STRATEGY.md)

**PRF Support Detection:**
```typescript
// Check if PRF is available
const available = await PublicKeyCredential.isConditionalMediationAvailable();
// Note: This doesn't guarantee PRF, need to test credential creation

// Attempt PRF credential creation
try {
  const credential = await navigator.credentials.create({
    publicKey: {
      extensions: { prf: { eval: { first: salt } } }
    }
  });
  const prfEnabled = credential.getClientExtensionResults().prf?.enabled;
} catch (e) {
  // PRF not supported
}
```

### 3. **OpenTDF Manifest Structure**
- **Purpose**: Policy-embedded encryption (ABAC support)
- **Spec**: https://opentdf.io/spec/schema/opentdf/manifest
- **Implementation**: JSON manifest with policy object

**Manifest Structure:**
```json
{
  "version": "1.0.0",
  "fileInfo": { "name": "...", "type": "..." },
  "encryptionInfo": {
    "algorithm": "age",
    "recipients": [...]
  },
  "policy": {
    "uuid": "...",
    "body": {
      "dataAttributes": [],
      "dissem": ["identity1", "identity2"]
    }
  }
}
```

### 4. **Vercel Serverless Functions**
- **Purpose**: Backend API for bundle hosting
- **Framework**: Next.js App Router API routes
- **Database**: Supabase (PostgreSQL)
- **Storage**: AWS S3 or Vercel Blob

## Implementation Priority

### Phase 1: Core Encryption (Week 1-2)
1. ✅ PRF detection and fallback strategy
2. ✅ Credential creation UI
3. ✅ File encryption (single recipient)
4. ✅ File decryption
5. ✅ IndexedDB storage

### Phase 2: Multi-Recipient & Bundles (Week 3-4)
1. ✅ Multi-recipient encryption
2. ✅ Rico bundle format (.rico zip)
3. ✅ Manifest generation
4. ✅ Bundle unpacking

### Phase 3: Server Integration (Week 5-6)
1. ✅ Supabase database setup
2. ✅ Upload/download API routes
3. ✅ Share link generation
4. ✅ Recipient access control

## Critical Implementation Notes

### WebAuthn PRF Fallback

**Problem**: Windows 10/11 don't support PRF extension as of Jan 2025.

**Solution**: Detect PRF support and fall back to standard WebAuthn + PBKDF2.
```typescript
// lib/auth/prf-detection.ts
export async function detectPRFSupport(): Promise<PRFSupport> {
  try {
    // Attempt to create credential with PRF
    const credential = await age.webauthn.createCredential({
      keyName: "PRF Test Credential"
    });
    // Check if PRF was actually enabled
    const identity = credential; // AGE-PLUGIN-FIDO2PRF-1... format
    if (identity.startsWith('AGE-PLUGIN-FIDO2PRF')) {
      return { supported: true, fallbackRequired: false };
    }
  } catch (error) {
    // PRF not supported
  }
  
  return { 
    supported: false, 
    fallbackRequired: true,
    fallbackMethod: 'pbkdf2-webauthn'
  };
}
```

**Fallback Strategy:**
1. Use standard WebAuthn to get authenticator assertion
2. Derive key from assertion signature using PBKDF2
3. Store salt in manifest (different from PRF approach)
4. Mark files as "non-PRF encrypted" in manifest

See `docs/PRF_FALLBACK_STRATEGY.md` for complete implementation.

## File-by-File Implementation Guide

### `lib/crypto/encryption.ts`

**Purpose**: Wrapper around typage for Rico-specific encryption

**Key Functions:**
- `encryptFile(file, credential, recipients, policy)` - Encrypt file with age
- `decryptFile(bundle, credential)` - Decrypt bundle
- `addRecipient(recipient)` - Add recipient to existing bundle (requires re-encryption)

**Implementation Notes:**
- Use `age.Encrypter` and `age.Decrypter` from typage
- Handle both PRF and non-PRF credentials
- Generate proper manifest with recipient list

**References:**
- typage README: See section "Encrypt and decrypt a file with a passkey"
- age spec: See "Native recipient types" section

### `lib/crypto/bundle.ts`

**Purpose**: Create/parse Rico bundle format (.rico)

**Bundle Structure:**
```
bundle.rico (zip)
├── manifest.json
└── 0.payload (age-encrypted binary)
```

**Key Functions:**
- `createBundle(manifest, encryptedPayload)` - Create zip bundle
- `parseBundle(bundleBlob)` - Extract manifest and payload
- `validateBundle(bundle)` - Verify integrity

**Implementation:**
- Use `jszip` library for zip handling
- Validate manifest against schema
- Check policy version compatibility

### `lib/auth/webauthn.ts`

**Purpose**: WebAuthn credential management

**Key Functions:**
- `createCredential(options)` - Create new credential
- `listCredentials()` - Get stored credentials from IndexedDB
- `storeCredential(credential)` - Save to IndexedDB
- `deleteCredential(id)` - Remove credential

**Implementation Notes:**
- Use typage's `age.webauthn.createCredential()`
- Store identity string in IndexedDB
- Handle both passkey and security-key types

### `components/encryption/FileEncryptor.tsx`

**Purpose**: Main encryption UI component

**Features:**
- Drag-and-drop file upload
- Credential selection
- Recipient management
- PRF support warning
- Encryption progress

**User Flow:**
1. User drops file
2. Selects their credential (or creates new)
3. Optionally adds recipients
4. System checks PRF support
5. Encrypts and downloads .rico bundle

### `app/api/bundles/route.ts`

**Purpose**: Serverless API for bundle upload/download

**Endpoints:**
- `POST /api/bundles` - Upload bundle to S3, store metadata in Supabase
- `GET /api/bundles` - List user's bundles

**Implementation:**
- Use Supabase client for database
- Use AWS SDK for S3 uploads (or Vercel Blob)
- Validate owner signature before allowing upload
- Rate limit uploads (e.g., 10 per hour per IP)

## Testing Strategy

### Unit Tests (Vitest)
```typescript
// tests/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { encryptFile, decryptFile } from '@/lib/crypto/encryption';

describe('Encryption', () => {
  it('should encrypt and decrypt with PRF credential', async () => {
    // Test encryption roundtrip
  });
  
  it('should handle non-PRF fallback', async () => {
    // Test fallback encryption
  });
});
```

### E2E Tests (Playwright)
```typescript
// tests/e2e/encrypt-decrypt.spec.ts
import { test, expect } from '@playwright/test';

test('encrypt and decrypt file', async ({ page }) => {
  await page.goto('/encrypt');
  // Simulate file upload
  // Click encrypt
  // Download bundle
  // Navigate to decrypt
  // Upload bundle
  // Verify decryption
});
```

## Common Pitfalls & Solutions

### 1. **WebAuthn Only Works Over HTTPS**
**Problem**: WebAuthn requires secure context
**Solution**: Use `localhost` for dev, Vercel provides automatic HTTPS for production

### 2. **PRF Extension Browser Support**
**Problem**: Not all browsers/authenticators support PRF
**Solution**: Implement detection and fallback (see PRF_FALLBACK_STRATEGY.md)

### 3. **CORS with Supabase**
**Problem**: Browser blocks requests to Supabase
**Solution**: Configure Supabase CORS settings to allow your domain

### 4. **Large File Handling**
**Problem**: Loading large files into memory crashes browser
**Solution**: Use streaming encryption with `ReadableStream` (typage supports this)

### 5. **Identity String Storage**
**Problem**: Losing identity string means can't decrypt
**Solution**: Store in IndexedDB + prompt user to backup

## Next Steps After Skeleton

1. Implement PRF detection first (critical for user experience)
2. Build credential creation flow
3. Implement encryption engine
4. Create basic UI components
5. Add server API routes
6. Integrate Supabase
7. Add comprehensive tests

## Questions to Ask During Implementation

1. Does this function handle the non-PRF fallback case?
2. Is the manifest schema compatible with OpenTDF?
3. Are we storing sensitive data properly (never plaintext keys)?
4. Is there proper error handling for WebAuthn rejections?
5. Are we rate limiting API endpoints?

## Resources

See `docs/REFERENCES.md` for complete list of documentation links.