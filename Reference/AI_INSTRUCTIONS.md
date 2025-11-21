# Instructions for AI Coding Assistant

You are helping implement DocProtect, a browser-based document encryption system.

## Context Documents

Before implementing ANY function, read these reference documents:

1. **Main Implementation Guide**: `docs/AI_IMPLEMENTATION_GUIDE.md`
2. **Technical References**: `docs/REFERENCES.md`
3. **PRF Fallback Strategy**: `docs/PRF_FALLBACK_STRATEGY.md`
4. **typage Documentation**: `docs/typage_README.md`
5. **age Specification**: `docs/age_specification.md`

## Implementation Approach

### Step 1: Understand the Function

When asked to implement a function:
1. Read the JSDoc comment for the function
2. Check the type definitions in `lib/types/`
3. Review relevant sections in the reference docs

### Step 2: Check for PRF Fallback

**CRITICAL**: Every function that uses WebAuthn must handle PRF fallback!

Ask yourself:
- Does this function create/use WebAuthn credentials?
- If yes: Does it check `detectPRFSupport()` first?
- If PRF not supported: Does it use fallback encryption?

### Step 3: Implement with Error Handling

All functions should:
- Handle WebAuthn errors (NotAllowedError, NotSupportedError, etc.)
- Validate inputs
- Log errors appropriately
- Throw descriptive errors

### Step 4: Add Tests

For each function, create:
- Unit test (in `tests/`)
- E2E test if user-facing (in `tests/e2e/`)

## Common Patterns

### Pattern 1: Encrypt File with typage
```typescript
import * as age from 'age-encryption';

const encrypter = new age.Encrypter();

// Add WebAuthn recipient
encrypter.addRecipient(
  new age.webauthn.WebAuthnRecipient({ identity })
);

// Or add X25519 recipient
encrypter.addRecipient(publicKey);

// Encrypt
const fileData = await file.arrayBuffer();
const encrypted = await encrypter.encrypt(fileData);
```

### Pattern 2: Decrypt File with typage
```typescript
const decrypter = new age.Decrypter();

// Add identity (will prompt user to select passkey)
decrypter.addIdentity(new age.webauthn.WebAuthnIdentity());

// Or specific identity
decrypter.addIdentity(
  new age.webauthn.WebAuthnIdentity({ identity })
);

// Decrypt
const decrypted = await decrypter.decrypt(encrypted, 'bytes');
```

### Pattern 3: Create Bundle
```typescript
import JSZip from 'jszip';

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
zip.file('0.payload', encryptedData);

const blob = await zip.generateAsync({ 
  type: 'blob',
  compression: 'DEFLATE'
});
```

### Pattern 4: Parse Bundle
```typescript
import JSZip from 'jszip';

const zip = await JSZip.loadAsync(bundleBlob);
const manifestFile = await zip.file('manifest.json')?.async('text');
const manifest = JSON.parse(manifestFile!);
const payload = await zip.file('0.payload')?.async('uint8array');
```

## Questions to Ask Before Implementing

1. **Does this function handle PRF fallback?**
2. **Are all TypeScript types properly defined?**
3. **Is error handling comprehensive?**
4. **Are there edge cases I'm missing?**
5. **Should this be async?**
6. **Do I need to store anything in IndexedDB?**
7. **Is this compatible with the age spec?**

## Testing Guidelines

### Unit Test Template
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('FunctionName', () => {
  it('should handle normal case', async () => {
    // Arrange
    const input = {...};
    
    // Act
    const result = await functionName(input);
    
    // Assert
    expect(result).toBeDefined();
  });
  
  it('should handle PRF fallback', async () => {
    // Mock PRF not supported
    vi.mock('@/lib/auth/prf-detection', () => ({
      detectPRFSupport: vi.fn().mockResolvedValue({
        supported: false,
        fallbackRequired: true
      })
    }));
    
    // Test fallback path
  });
  
  it('should throw on invalid input', async () => {
    await expect(functionName(null)).rejects.toThrow();
  });
});
```

## DO NOT

- ❌ Use localStorage for sensitive data (use IndexedDB)
- ❌ Store private keys in any form (only identity strings)
- ❌ Implement your own crypto primitives (use age/Web Crypto)
- ❌ Skip PRF detection
- ❌ Assume WebAuthn always works
- ❌ Hardcode URLs or configuration

## DO

- ✅ Check PRF support before every credential operation
- ✅ Validate all inputs
- ✅ Handle WebAuthn cancellation gracefully
- ✅ Add comprehensive JSDoc comments
- ✅ Follow TypeScript best practices
- ✅ Write tests for new functions
- ✅ Use proper error messages

## Current Implementation Status

Track what's implemented in `STATUS.md`:

- [ ] PRF detection
- [ ] Credential creation
- [ ] File encryption
- [ ] File decryption
- [ ] Bundle creation
- [ ] Bundle parsing
- [ ] Manifest generation
- [ ] IndexedDB storage
- [ ] API routes
- [ ] UI components

## Getting Help

If stuck:
1. Re-read the relevant reference doc
2. Check the typage README for examples
3. Look at the type definitions
4. Search the age specification
5. Ask for clarification with specific context

## Example Implementation Request

Good:
> "Implement the `encryptFile` function in `lib/crypto/encryption.ts`. It should:
> 1. Check PRF support
> 2. Create age.Encrypter
> 3. Add owner as recipient
> 4. Handle multiple recipients
> 5. Encrypt file data
> 6. Return DocProtectBundle"

Bad:
> "Write the encryption code"