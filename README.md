# Doc Protect   

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

## Architecture
Architecture diagrams are available in the folder: [Architecture Diagrams](Architecture%20Diagrams).

## Technical Details
- [*age*](https://c2sp.org/age) is the modern file encryption method used.
- [*typage*](https://github.com/FiloSottile/typage) (a TypeScript implementation of age) is used to encrypt the file in the browser.
- [*WebAuthn PRF*](https://w3c.github.io/webauthn/#prf-extension) is used to derive the key from the user's authenticator.
- The owner's key is then used to encrypt the file and the encrypted blob is stored in the browser.

## Setup and Development

### Prerequisites
- Node.js 18+ and npm
- A modern browser with WebAuthn PRF support (Chrome 108+, Edge 108+, Safari 16.4+)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Usage

1. **First Time Setup**: Go to Settings and create a passkey or security key
2. **Encrypt a File**: 
   - Go to the Encrypt tab
   - Select a file
   - Optionally add recipient public keys (age1... format)
   - Click "Encrypt File" and authenticate with your passkey
   - Download or copy the encrypted file
3. **Decrypt a File**:
   - Go to the Decrypt tab
   - Paste encrypted text or drop an encrypted file
   - Click "Decrypt File" and authenticate with your passkey
   - Download the decrypted file
4. **Share Files**:
   - Use the Share tab to generate share links with recipient keys
   - Or use URL parameters: `?r=age1...&r=age1...` for multiple recipients
   - Use `?receive_mode=1` to generate a receive mode link

### Features

- **Offline Mode**: All encryption/decryption happens locally in the browser
- **Multi-Recipient Encryption**: Encrypt files for multiple recipients
- **WebAuthn PRF**: Passwordless authentication using passkeys or security keys
- **Local Storage**: Files stored in browser IndexedDB
- **Share Links**: Generate share links with recipient keys
- **Receive Mode**: Auto-generate keypairs for easy sharing

### API

The system includes an API client (`src/api/client.ts`) for programmatic access to cloud/server features.

## Server Setup (Optional)

For cloud/server mode functionality, you can run the backend server:

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3001` by default.

### Server Configuration

- `PORT`: Server port (default: 3001)
- `DB_PATH`: SQLite database path (default: `./doc-protect.db`)
- `STORAGE_PATH`: Encrypted file storage path (default: `./storage`)

### Server API Endpoints

- `POST /api/files` - Upload encrypted file
- `GET /api/files/:fileId` - Download encrypted file
- `DELETE /api/files/:fileId` - Delete file
- `GET /api/files/:fileId/metadata` - Get file metadata
- `PUT /api/files/:fileId/metadata` - Update file metadata
- `POST /api/access/request` - Request access to file
- `GET /api/access/requests/:fileId` - Get pending access requests
- `POST /api/access/approve` - Approve access request
- `POST /api/access/deny` - Deny access request






