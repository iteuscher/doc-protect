# DocProtect Technical References

## Core Specifications

### age Encryption
- **Official Spec**: https://age-encryption.org/v1
- **Full Spec Document**: https://c2sp.org/age
- **Go Implementation**: https://github.com/FiloSottile/age
- **Key Concepts**: Multi-recipient encryption, X25519 key exchange, ChaCha20-Poly1305 AEAD

### typage (age-encryption npm)
- **npm Package**: https://www.npmjs.com/package/age-encryption
- **GitHub**: https://github.com/FiloSottile/typage
- **README**: [Included in project at docs/typage_README.md]
- **Key Features**: WebAuthn PRF support, streaming encryption, browser-compatible

### WebAuthn PRF Extension
- **W3C Spec**: https://w3c.github.io/webauthn/#prf-extension
- **Explainer**: https://github.com/w3c/webauthn/wiki/Explainer:-PRF-extension
- **Browser Support**: https://caniuse.com/webauthn (PRF subset varies)
- **FIDO2 PRF**: https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html#prf-extension

### OpenTDF
- **Main Site**: https://opentdf.io/
- **Manifest Spec**: https://opentdf.io/spec/schema/opentdf/manifest
- **ABAC Concepts**: https://opentdf.io/docs/concepts/access-control/
- **GitHub**: https://github.com/opentdf/platform

## Platform Documentation

### Next.js 14 (App Router)
- **Official Docs**: https://nextjs.org/docs
- **API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **Serverless Functions**: https://vercel.com/docs/functions/serverless-functions

### Supabase
- **Getting Started**: https://supabase.com/docs
- **JS Client**: https://supabase.com/docs/reference/javascript/introduction
- **Database**: https://supabase.com/docs/guides/database
- **Auth**: https://supabase.com/docs/guides/auth

### Vercel
- **Deployment**: https://vercel.com/docs/deployments/overview
- **Environment Variables**: https://vercel.com/docs/projects/environment-variables
- **Blob Storage**: https://vercel.com/docs/storage/vercel-blob

## Libraries

### JSZip
- **npm**: https://www.npmjs.com/package/jszip
- **API Docs**: https://stuk.github.io/jszip/
- **Purpose**: Create .dpf bundle (zip with manifest + payload)

### localForage
- **npm**: https://www.npmjs.com/package/localforage
- **GitHub**: https://github.com/localForage/localForage
- **Purpose**: IndexedDB wrapper for credential storage

### Vitest
- **Docs**: https://vitest.dev/
- **Purpose**: Unit testing

### Playwright
- **Docs**: https://playwright.dev/
- **Purpose**: E2E testing

## Cryptographic Primitives

### X25519 (ECDH)
- **RFC 7748**: https://datatracker.ietf.org/doc/html/rfc7748
- **Purpose**: Key exchange in age encryption

### ChaCha20-Poly1305 (AEAD)
- **RFC 8439**: https://datatracker.ietf.org/doc/html/rfc8439
- **Purpose**: Authenticated encryption in age

### HKDF (Key Derivation)
- **RFC 5869**: https://datatracker.ietf.org/doc/html/rfc5869
- **Purpose**: Derive encryption keys from shared secrets

### HMAC-SHA256
- **RFC 2104**: https://datatracker.ietf.org/doc/html/rfc2104
- **Purpose**: Manifest integrity in age header

### PBKDF2 (Fallback)
- **RFC 8018**: https://datatracker.ietf.org/doc/html/rfc8018
- **Purpose**: Key derivation for non-PRF fallback

## Browser APIs

### Web Crypto API
- **MDN**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **Spec**: https://w3c.github.io/webcrypto/

### File API
- **MDN**: https://developer.mozilla.org/en-US/docs/Web/API/File_API
- **Purpose**: Handle file uploads/downloads

### IndexedDB
- **MDN**: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Purpose**: Local credential storage

### Streams API
- **MDN**: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
- **Purpose**: Large file streaming encryption

## ABAC & Access Control

### NIST ABAC Model
- **Paper**: https://csrc.nist.gov/publications/detail/sp/800-162/final
- **Overview**: https://www.nist.gov/publications/guide-attribute-based-access-control-abac-definition-and-considerations

### TDF (Trusted Data Format)
- **Virtru Spec**: https://github.com/virtru/tdf-spec
- **Concept**: Policy travels with encrypted data

## Security Resources

### OWASP
- **WebAuthn Cheat Sheet**: https://cheatsheetseries.owasp.org/cheatsheets/WebAuthn_Cheat_Sheet.html
- **Cryptographic Storage**: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

### FIDO Alliance
- **Passkeys**: https://fidoalliance.org/passkeys/
- **Security Key**: https://fidoalliance.org/fido2/

## Troubleshooting Resources

### WebAuthn Debugging
- **webauthn.io**: https://webauthn.io/ (test site)
- **Chrome DevTools**: chrome://webauthn-internals/

### age Encryption Test Vectors
- **Testkit**: https://age-encryption.org/testkit

## Project-Specific Documents

Included in this repository:
- `docs/typage_README.md` - Full typage documentation
- `docs/age_specification.md` - Complete age spec
- `docs/PRF_FALLBACK_STRATEGY.md` - Windows PRF fallback
- `docs/ARCHITECTURE.md` - System architecture diagrams