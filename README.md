# Doc Protect   

[![CI](https://github.com/iteuscher/doc-protect/actions/workflows/ci.yml/badge.svg)](https://github.com/iteuscher/doc-protect/actions/workflows/ci.yml)
[![E2E Tests](https://github.com/iteuscher/doc-protect/actions/workflows/e2e.yml/badge.svg)](https://github.com/iteuscher/doc-protect/actions/workflows/e2e.yml)
[![CodeQL](https://github.com/iteuscher/doc-protect/actions/workflows/codeql.yml/badge.svg)](https://github.com/iteuscher/doc-protect/actions/workflows/codeql.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025e8c?logo=dependabot)](https://github.com/iteuscher/doc-protect/security/dependabot)


## Table of Contents
- [Overview](#overview)
- [Versioning](#versioning)
- [Architecture](#architecture)
- [Technical Details](#technical-details)

![Architecture Diagram](Architecture%20Diagrams/Cloud-Server-based%20v1.png)

## Overview
Doc Protect is a document encryption platform that lets you encrypt and securely share files using a modern, passwordless approach. Instead of relying on password protected PDFs, users can unlock and share documents using modern authentication methods—like passkeys, YubiKeys, biometrics, or identity providers—while keeping encryption and decryption local in the browser for maximum privacy and security.

Doc Protct runs locally on the browser to promote privacy and interfaces with identity providers such as hardware tokens, passkeys, and SSO in order to provide a passwordless approach to key generation and encryption. This enables individuals and enterprises to store and share documents securely without relying on shared passwords. It will mitigate issues that have been exploited in recent hacks of managed file transfer services.

Adobe PDF or Microsoft Word password protection are commonly used and easy to navigate. However they rely on a shared password that cannot be changed once the password is set. Additionally, there is no rate limiting on attempts to crack the password and sharing requries giving full control to the person who the document is shared with. Doc Protect is innovative as it ties together modern advances in encryption methods and passwordless authentication to create a stronger encryption model for documents. 

## Versioning
The current Doc Protect version is v0.1 as it is in active research and development. Until v1.0 is released, the system is considered to be in a pre-alpha state and is not ready for production use.

## Key Features 
- 🔐 **Passwordless Encryption**: Uses WebAuthn passkeys/security keys instead of passwords
- 🌐 **Browser-Based**: All encryption/decryption happens locally in your browser
- 🔄 **Unified Workflow**: Single interface for both encryption and decryption
- 🛡️ **PRF Support**: Automatic detection and fallback for systems without PRF support
- 📦 **Bundle Format**: Standard `.dpf` format with embedded manifest and policy
- 💾 **Local Storage**: Credentials stored securely in IndexedDB (never leaves your device)

## Architecture
Architecture diagrams are available in the folder: [Architecture Diagrams](Architecture%20Diagrams).

## Technical Details
- [*age*](https://c2sp.org/age) is the modern file encryption method used.
- [*typage*](https://github.com/FiloSottile/typage) (a TypeScript implementation of age) is used to encrypt the file in the browser.
- [*WebAuthn PRF*](https://w3c.github.io/webauthn/#prf-extension) is used to derive the key from the user's authenticator.
- The owner's key is then used to encrypt the file and the encrypted blob is stored in the browser.

## Setup and Development

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- Modern browser with WebAuthn support (Chrome 108+, Edge 108+, Safari 16.4+)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd doc-protect

2. Install dependencies:
```bash
npm install
```

### Running Locally

```bash
# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

```bash
npm test              # Run unit tests
npm run test:watch    # Watch mode
npm run type-check    # Type checking
npm run lint          # Linting
```

For detailed testing instructions, see [LOCAL_TESTING.md](./LOCAL_TESTING.md).

## How It Works

### Encryption Flow

1. Create a WebAuthn passkey/security key
2. System checks if PRF extension is supported
3. File is encrypted using age encryption with WebAuthn PRF
4. Encrypted file is packaged with manifest and policy into `.dpf` format
5. User downloads the encrypted bundle

### Decryption Flow

1. User uploads a `.dpf` file
2. User selects the credential used for encryption
3. User authenticates with their passkey/security key
4. File is decrypted using the WebAuthn identity
5. User downloads the decrypted file

### PRF Fallback

For systems without WebAuthn PRF support (e.g., Windows 10/11), DocProtect automatically falls back to:
- Standard WebAuthn credential creation
- PBKDF2 key derivation from WebAuthn assertions
- Compatible encryption (not compatible with age CLI)

## Architecture

### Core Components

- **`lib/auth/`**: WebAuthn credential management and PRF detection
- **`lib/crypto/`**: Encryption/decryption engine and bundle handling
- **`lib/storage/`**: IndexedDB storage for credentials and bundles
- **`lib/types/`**: TypeScript type definitions
- **`app/`**: Next.js application (UI and API routes)

### Bundle Format

DocProtect bundles (`.dpf` files) are ZIP archives containing:
- **`manifest.json`**: File metadata, encryption info, and access policy
- **`0.payload`**: age-encrypted file data

### Technology Stack

- **Framework**: Next.js 16 (React 19)
- **Encryption**: [age-encryption](https://github.com/FiloSottile/typage) (TypeScript implementation of age)
- **Storage**: IndexedDB via [localForage](https://github.com/localForage/localForage)
- **Bundling**: [JSZip](https://stuk.github.io/jszip/)
- **Testing**: Vitest, Playwright (E2E)
- **Backend**: Supabase (PostgreSQL + Storage) - optional

## Browser Compatibility

### PRF Support

| Platform | PRF Support | Notes |
|----------|-------------|-------|
| macOS 13+ | ✅ Yes | Via platform authenticator (Touch ID) |
| iOS 16+ | ✅ Yes | Via Face ID / Touch ID |
| Android 14+ | ✅ Yes | Via platform authenticator |
| Chrome OS | ✅ Yes | Via platform authenticator |
| Windows 10/11 | ❌ No | Uses fallback mode (PBKDF2) |
| YubiKey 5+ | ✅ Yes | Hardware support (cross-platform) |

### Browser Requirements

- Chrome 108+ (recommended)
- Edge 108+
- Safari 16.4+
- Firefox 102+ (limited PRF support)

## Project Status

**Current Version**: v0.1.0 (MVP)

See [FUTURE_PHASES.md](./FUTURE_PHASES.md) for planned improvements.

## Development

### Project Structure

```
doc-protect/
├── app/                    # Next.js application
│   ├── api/               # API routes
│   ├── page.tsx           # Main UI
│   └── layout.tsx        # App layout
├── lib/                   # Core libraries
│   ├── auth/             # WebAuthn & PRF
│   ├── crypto/           # Encryption & bundles
│   ├── storage/          # IndexedDB storage
│   └── types/            # TypeScript types
├── tests/                 # Test suites
├── supabase/             # Database migrations
└── Reference/            # Documentation
```


## Security Considerations

- **Local-First**: Encryption/decryption happens in the browser
- **No Server-Side Keys**: Server never sees encryption keys
- **IndexedDB Storage**: Credentials stored locally (never synced)
- **PRF Extension**: Uses hardware-backed key derivation when available
- **Fallback Security**: PBKDF2 with 100,000 iterations for non-PRF systems

## Contributing

Contributions are welcome! Please see [FUTURE_PHASES.md](./FUTURE_PHASES.md) for areas that need work.

## Acknowledgments

- [age](https://age-encryption.org/) - Modern file encryption
- [typage](https://github.com/FiloSottile/typage) - TypeScript age implementation
- [WebAuthn](https://www.w3.org/TR/webauthn-2/) - Passwordless authentication standard
