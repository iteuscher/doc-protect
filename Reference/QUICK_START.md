# Quick Start for AI Implementation

## Initial Setup
```bash
# Clone/create project
npx create-next-app@latest rico --typescript --tailwind --app
cd rico

# Install dependencies
npm install age-encryption jszip localforage @supabase/supabase-js
npm install -D vitest @playwright/test

# Create directory structure
mkdir -p lib/{crypto,auth,storage,api,types}
mkdir -p components/{encryption,auth,dashboard}
mkdir -p docs app/api/{bundles,auth}
mkdir -p tests/e2e
```

## Implementation Order

### Week 1: Core Crypto

**Day 1-2: PRF Detection**
```bash
# Implement these files:
lib/auth/prf-detection.ts
lib/auth/fallback.ts
tests/prf-detection.test.ts
```

**Day 3-4: Credential Management**
```bash
lib/auth/webauthn.ts
lib/storage/indexeddb.ts
tests/webauthn.test.ts
```

**Day 5-7: Encryption Engine**
```bash
lib/crypto/encryption.ts
lib/crypto/bundle.ts
lib/crypto/manifest.ts
tests/crypto.test.ts
```

### Week 2: UI Components
```bash
components/auth/CredentialSetup.tsx
components/auth/PRFWarning.tsx
components/encryption/FileEncryptor.tsx
components/encryption/FileDecryptor.tsx
app/encrypt/page.tsx
app/decrypt/[id]/page.tsx
```

### Week 3: Backend
```bash
# Set up Supabase
supabase/migrations/001_initial_schema.sql

# API routes
app/api/bundles/route.ts
app/api/bundles/[id]/route.ts
app/api/auth/challenge/route.ts

lib/api/client.ts
```

## Testing Commands
```bash
# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Type check
npm run type-check

# Lint
npm run lint
```

## Deployment
```bash
# Deploy to Vercel
vercel deploy

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add AWS_ACCESS_KEY_ID
vercel env add AWS_SECRET_ACCESS_KEY
```
```

---

### **How to Give This to Cursor/Claude Code**

1. **Initial Context Load:**
```
I'm building Rico, a browser-based document encryption system. 
I've created a detailed implementation guide and skeleton code.

Please read these files first to understand the project:
1. docs/AI_IMPLEMENTATION_GUIDE.md
2. docs/REFERENCES.md
3. docs/PRF_FALLBACK_STRATEGY.md
4. AI_INSTRUCTIONS.md

The skeleton code is in:
- lib/types/ (TypeScript definitions)
- lib/crypto/ (encryption stubs)
- lib/auth/ (WebAuthn stubs)

After reading, confirm you understand:
1. The purpose of WebAuthn PRF
2. Why fallback is needed for Windows
3. How typage wraps age encryption
4. The Rico bundle format
```

2. **Specific Implementation Request:**
```
Now implement the `encryptFile` function in lib/crypto/encryption.ts.

Requirements:
1. Use typage's age.Encrypter class
2. Add owner as WebAuthn recipient
3. Support multiple recipients (X25519 and WebAuthn)
4. Handle PRF fallback case
5. Create Rico bundle with manifest
6. Add comprehensive error handling
7. Write unit tests

Reference:
- typage README section: "Encrypt and decrypt a file with a passkey"
- Type definitions: lib/types/bundle.ts
- PRF fallback: docs/PRF_FALLBACK_STRATEGY.md
```

3. **Iterative Refinement:**
```
The implementation looks good, but I need you to:
1. Add JSDoc comments explaining the PRF fallback path
2. Extract the recipient handling into a helper function
3. Add validation for empty file
4. Add a test case for mixed recipient types (X25519 + WebAuthn)
```

---

### **Summary: Files to Create**

Save all these files to your project:
```
rico/
├── docs/
│   ├── AI_IMPLEMENTATION_GUIDE.md       # ✅ Created above
│   ├── REFERENCES.md                     # ✅ Created above
│   ├── PRF_FALLBACK_STRATEGY.md         # ✅ Created above
│   ├── typage_README.md                  # ✅ You uploaded this
│   └── age_specification.md              # ✅ You uploaded this
├── AI_INSTRUCTIONS.md                    # ✅ Created above
├── QUICK_START.md                        # ✅ Created above
├── lib/types/
│   ├── bundle.ts                         # ✅ Created above
│   └── credential.ts                     # Create next
├── lib/crypto/
│   ├── encryption.ts                     # ✅ Stub created above
│   ├── bundle.ts                         # Create stub
│   └── manifest.ts                       # Create stub
└── lib/auth/
    ├── webauthn.ts                       # ✅ Stub created above
    ├── prf-detection.ts                  # Create stub
    └── fallback.ts                       # Create stub