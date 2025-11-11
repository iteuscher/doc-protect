# Doc Protect - Setup and Testing Guide

## Quick Start (Frontend Only - Offline Mode)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

This will start Vite dev server, typically at `http://localhost:3000`

### 3. Open in Browser

Open your browser to the URL shown in the terminal (usually `http://localhost:3000`)

**Important**: WebAuthn PRF requires HTTPS or localhost. Make sure you're using `localhost` or `127.0.0.1`, not an IP address.

## Testing the Application

### Test 1: Create a Passkey

1. Navigate to the **Settings** tab
2. Click **"Create Passkey"**
3. Enter a name (e.g., "My Encryption Key")
4. Follow your browser's prompt to create a passkey (biometric, PIN, etc.)
5. You should see a success message

### Test 2: Encrypt a File (Offline Mode)

1. Navigate to the **Encrypt** tab
2. Click the drop zone or select a file
3. Leave the recipient keys field empty (will use your passkey)
4. Click **"Encrypt File"**
5. Authenticate with your passkey when prompted
6. You should see the encrypted output
7. Click **"Download Encrypted File"** to save it

### Test 3: Decrypt a File

1. Navigate to the **Decrypt** tab
2. Either:
   - Paste the encrypted text from Test 2, OR
   - Drop the encrypted file you downloaded
3. Click **"Decrypt File"**
4. Authenticate with your passkey when prompted
5. The file should decrypt and you can download it

### Test 4: Multi-Recipient Encryption

1. Go to **Settings** tab
2. Click **"Generate New Key Pair"**
3. Copy the **Public Key** (starts with `age1...`)
4. Go to **Encrypt** tab
5. Select a file
6. Paste the public key in the recipient keys field
7. Click **"Encrypt File"** and authenticate
8. The file is now encrypted for both your passkey AND the X25519 key

### Test 5: Share Links

1. Go to **Share** tab
2. Enter one or more recipient public keys (one per line)
3. Click **"Generate Share Link"**
4. Copy the link
5. Open the link in a new tab
6. The recipient keys should be pre-filled in the Encrypt view

### Test 6: Receive Mode

1. Go to **Share** tab
2. Click **"Generate Receive Mode Link"**
3. Copy the link
4. Open the link in a new tab (or incognito window)
5. A keypair should be auto-generated and you'll be in Decrypt mode

### Test 7: Local File Storage

1. Encrypt a file (from Test 2)
2. Go to **My Files** tab
3. You should see your encrypted file listed
4. Click **"Decrypt"** to decrypt it directly
5. Click **"Delete"** to remove it from local storage

## Full Setup (With Backend Server)

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
cd ..
```

### 3. Start Backend Server

In one terminal:

```bash
cd server
npm start
```

The server will run on `http://localhost:3001`

### 4. Start Frontend

In another terminal:

```bash
npm run dev
```

### 5. Configure Frontend to Use Server

Update the API base URL in your code if needed (currently defaults to empty string for local development).

## Troubleshooting

### WebAuthn Not Working

- **Issue**: "WebAuthn not supported" or authentication fails
- **Solution**: 
  - Make sure you're using `localhost` or `127.0.0.1` (not an IP address)
  - Use a modern browser (Chrome 108+, Edge 108+, Safari 16.4+)
  - For security keys, ensure the key is connected and unlocked

### age-encryption Package Issues

- **Issue**: Import errors or "age-encryption not found"
- **Solution**:
  ```bash
  npm install age-encryption@latest
  ```
  Check the [age-encryption npm page](https://www.npmjs.com/package/age-encryption) for the latest version

### TypeScript Errors

- **Issue**: Type errors during build
- **Solution**:
  ```bash
  npm run type-check
  ```
  This will show any type errors that need to be fixed

### Server Not Starting

- **Issue**: Backend server fails to start
- **Solution**:
  - Make sure you're in the `server` directory
  - Check that `node_modules` is installed: `npm install`
  - Check the port isn't already in use (default: 3001)

## Browser Compatibility

WebAuthn PRF extension is supported in:
- Chrome 108+
- Edge 108+
- Safari 16.4+
- Firefox (limited support, may not work)

## Development Tips

1. **Check Browser Console**: Open DevTools (F12) to see any errors
2. **IndexedDB**: Use DevTools > Application > IndexedDB to inspect stored data
3. **Network Tab**: Check API calls if using the backend server
4. **WebAuthn Debugging**: Check the Console for WebAuthn-related errors

## Next Steps

Once basic functionality works:
1. Test with multiple files
2. Test with different file types
3. Test the share link workflow end-to-end
4. Test the request access workflow (requires backend)
5. Test with hardware security keys (YubiKey, etc.)


