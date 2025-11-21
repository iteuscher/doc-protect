## File Structure
```
docprotect/
├── docs/
│   ├── AI_IMPLEMENTATION_GUIDE.md          # This file - guide for AI assistants
│   ├── REFERENCES.md                        # Links to all documentation
│   ├── PRF_FALLBACK_STRATEGY.md            # WebAuthn PRF fallback handling
│   └── ARCHITECTURE.md                      # System architecture
├── lib/
│   ├── crypto/
│   │   ├── encryption.ts                    # Main encryption engine (typage wrapper)
│   │   ├── bundle.ts                        # DocProtect bundle creation/parsing
│   │   └── manifest.ts                      # TDF manifest handling
│   ├── auth/
│   │   ├── webauthn.ts                      # WebAuthn credential management
│   │   ├── prf-detection.ts                # PRF support detection
│   │   └── fallback.ts                      # Non-PRF fallback strategy
│   ├── storage/
│   │   ├── indexeddb.ts                     # Local credential storage
│   │   └── supabase.ts                      # Server database client
│   ├── api/
│   │   └── client.ts                        # API client for frontend
│   └── types/
│       ├── bundle.ts                        # TypeScript types for bundles
│       ├── credential.ts                    # Credential types
│       └── policy.ts                        # ABAC policy types
├── components/
│   ├── encryption/
│   │   ├── FileEncryptor.tsx               # Drag-drop encryption UI
│   │   ├── FileDecryptor.tsx               # Decryption UI
│   │   └── RecipientManager.tsx            # Add/remove recipients
│   ├── auth/
│   │   ├── CredentialSetup.tsx             # First-time credential creation
│   │   ├── CredentialSelector.tsx          # Select credential for operation
│   │   └── PRFWarning.tsx                  # Warning when PRF not supported
│   └── dashboard/
│       ├── BundleList.tsx                  # User's encrypted files
│       └── CredentialList.tsx              # User's credentials
├── app/
│   ├── page.tsx                            # Home page
│   ├── encrypt/page.tsx                    # Encryption page
│   ├── decrypt/[id]/page.tsx              # Decryption page
│   ├── dashboard/page.tsx                  # User dashboard
│   └── api/
│       ├── bundles/
│       │   ├── route.ts                    # POST/GET bundles
│       │   └── [id]/route.ts              # GET/PATCH specific bundle
│       └── auth/
│           └── challenge/route.ts          # Owner authentication
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql          # Database schema
└── tests/
    ├── crypto.test.ts                      # Encryption tests
    ├── webauthn.test.ts                    # WebAuthn tests
    └── e2e/
        └── encrypt-decrypt.spec.ts         # E2E tests