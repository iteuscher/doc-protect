# Local Testing Guide

This guide walks you through setting up and testing Rico locally.

## Prerequisites

- **Node.js** v18 or higher
- **npm** or **yarn**
- **Modern browser** with WebAuthn support:
  - Chrome 108+ (recommended)
  - Edge 108+
  - Safari 16.4+
  - Firefox 102+ (limited PRF support)

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Verify Installation

Check that all dependencies installed correctly:

```bash
npm run type-check
npm run lint
```

Both commands should complete without errors.

## Running the Application

### Development Server

Start the Next.js development server:

```bash
npm run dev
```

The application will be available at:
- **http://localhost:3000**

> **Note**: WebAuthn requires HTTPS or `localhost`. The dev server automatically uses `localhost`, which is secure for WebAuthn.

### Production Build

To test the production build:

```bash
npm run build
npm start
```

## Testing Workflows

### 1. Unit Tests

Run all unit tests:

```bash
npm test
```

Run tests in watch mode (for development):

```bash
npm run test:watch
```

**Expected Output**: All 8 test suites should pass (30 tests total)

### 2. Manual Testing - Encryption Flow

1. **Open the app**: Navigate to `http://localhost:3000`

2. **Create a credential**:
   - Click "Create Credential"
   - Follow browser prompt to create a passkey (Touch ID, Face ID, or security key)
   - Credential will be stored locally in IndexedDB

3. **Encrypt a file**:
   - Drag and drop a file onto the upload area, OR
   - Click to select a file
   - The app will automatically detect it's not encrypted and start encryption
   - Authenticate with your passkey when prompted
   - Download the `.rico` bundle file

4. **Verify encryption**:
   - Check that the downloaded file has `.rico` extension
   - File should be larger than original (contains manifest + encrypted payload)

### 3. Manual Testing - Decryption Flow

1. **Decrypt a bundle**:
   - Drag and drop a `.rico` file onto the upload area
   - The app will detect it's encrypted
   - Select the credential used for encryption
   - Authenticate with your passkey
   - Download the decrypted file

2. **Verify decryption**:
   - Compare decrypted file with original
   - File should match byte-for-byte

### 4. Testing PRF Fallback (Windows Users)

If you're on Windows 10/11:

1. The app will automatically detect PRF is not supported
2. You'll see a warning message about fallback mode
3. Create a credential - it will use PBKDF2 fallback
4. Encrypt/decrypt will work, but files won't be compatible with age CLI

### 5. Testing Multiple Credentials

1. Create multiple credentials with different names
2. Verify you can switch between them
3. Encrypt files with different credentials
4. Verify each credential can only decrypt its own files

## Browser Console

Open browser DevTools (F12) to see:

- **Console logs**: Status messages, errors, warnings
- **Application tab**: IndexedDB storage (Rico database)
- **Network tab**: API calls (if backend is configured)

## Common Issues

### WebAuthn Not Working

**Problem**: Browser doesn't prompt for authentication

**Solutions**:
- Ensure you're using `localhost` or HTTPS
- Check browser supports WebAuthn (Chrome/Edge recommended)
- Verify authenticator is set up (Touch ID, Windows Hello, etc.)

### PRF Detection Fails

**Problem**: PRF detection hangs or errors

**Solutions**:
- Check browser console for errors
- Try clearing PRF cache: Open console, run `localStorage.removeItem('rico:prf-support')`
- Refresh page and try again

### Files Not Encrypting

**Problem**: Encryption workflow doesn't start

**Solutions**:
- Check browser console for errors
- Verify a credential is created and selected
- Ensure file is not too large (browser memory limits)

### Type Errors

**Problem**: TypeScript compilation fails

**Solutions**:
```bash
# Clean build cache
rm -rf .next tsconfig.tsbuildinfo

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Re-run type check
npm run type-check
```

## Testing Backend Integration (Optional)

To test with Supabase backend:

1. **Set up Supabase**:
   - Create a Supabase project
   - Run migration: `supabase/migrations/001_initial_schema.sql`
   - Create a storage bucket for bundles

2. **Configure environment variables**:
   Create `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_BUNDLE_BUCKET=your_bucket_name
   ```

3. **Restart dev server**:
   ```bash
   npm run dev
   ```

4. **Test bundle upload**:
   - Encrypt a file
   - Upload to server (if implemented)
   - Verify in Supabase dashboard

## Performance Testing

### Large Files

Test with various file sizes:

- **Small** (< 1MB): Should work instantly
- **Medium** (1-10MB): May take a few seconds
- **Large** (10-100MB): May take 10-30 seconds
- **Very Large** (> 100MB): May hit browser memory limits

### Multiple Files

Test encrypting/decrypting multiple files in sequence to verify:
- Memory cleanup
- No credential conflicts
- Proper error handling

## Security Testing

### Verify Local Storage

1. Open DevTools → Application → IndexedDB
2. Check `Rico` database
3. Verify:
   - Credentials are stored (but not sensitive keys)
   - No plaintext file data
   - Bundle metadata only (if stored)

### Verify Encryption

1. Encrypt a file
2. Open the `.rico` bundle with a ZIP tool
3. Verify:
   - `manifest.json` contains metadata (not sensitive)
   - `0.payload` is encrypted (random bytes, not readable)

## Next Steps

After local testing:

1. Review test coverage: `npm test`
2. Check for lint errors: `npm run lint`
3. Verify types: `npm run type-check`
4. Review browser console for warnings
5. Test on different browsers/devices

## Troubleshooting

If you encounter issues:

1. **Clear browser data**: IndexedDB, localStorage, cookies
2. **Restart dev server**: `Ctrl+C` then `npm run dev`
3. **Check logs**: Browser console + terminal output
4. **Verify dependencies**: `npm list` for version conflicts
5. **Update packages**: `npm update` (be cautious with major versions)

For more help, see the main [README.md](./README.md) or check the [Reference](./Reference/) documentation.

