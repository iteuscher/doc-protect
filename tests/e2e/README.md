# End-to-End Tests for DocProtect

This directory contains comprehensive end-to-end tests for the DocProtect application using Playwright.

## Test Structure

The E2E tests are organized into the following test suites:

### 1. **encryption-workflow.spec.ts**
Tests the complete encryption workflow:
- File upload and detection
- Credential creation for encryption
- Full encryption flow from upload to bundle download
- Credential selection and reuse
- External credential handling
- Progress indicator validation
- PRF support information display

### 2. **decryption-workflow.spec.ts**
Tests the complete decryption workflow:
- DPF file detection and upload
- Credential selection for decryption
- Full encrypt-then-decrypt cycle
- Stored credential usage
- External credential for decryption
- Decryption status and progress

### 3. **credential-management.spec.ts**
Tests credential creation, storage, and management:
- Creating credentials with custom names
- Pre-filling credential names from file names
- Storing and displaying multiple credentials
- Selecting existing credentials
- Displaying credential types (PRF vs Fallback)
- Resetting all data
- Technical info panel

### 4. **recipients-management.spec.ts**
Tests recipient management during encryption:
- Adding recipients with email validation
- Adding multiple recipients
- Removing recipients
- Duplicate detection
- Email format validation
- Recipients persistence across workflow steps

### 5. **ui-and-ux.spec.ts**
Tests user interface and user experience features:
- Header and branding
- Status messages and error display
- File upload interface
- Progress indicators
- Technical info panel
- Button states and styling
- Sharing options UI
- Responsive design elements
- Color scheme and theming
- Accessibility features

## Running Tests

### Prerequisites

**IMPORTANT:** You must install Playwright browsers before running E2E tests!

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (REQUIRED - tests will fail without this!)
npx playwright install

# 3. For CI environments, install browser dependencies
npx playwright install --with-deps
```

> **Note:** If you see errors like `Executable doesn't exist at /root/.cache/ms-playwright/...`, you forgot to run `npx playwright install`. Run it now and try again.

### Run All Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in UI mode (interactive)
npx playwright test --ui
```

### Run Specific Test Suites

```bash
# Run only encryption workflow tests
npx playwright test encryption-workflow

# Run only decryption workflow tests
npx playwright test decryption-workflow

# Run only credential management tests
npx playwright test credential-management

# Run only recipients tests
npx playwright test recipients-management

# Run only UI/UX tests
npx playwright test ui-and-ux
```

### Run Tests in Specific Browsers

```bash
# Run in Chromium only
npx playwright test --project=chromium

# Run in Firefox only
npx playwright test --project=firefox

# Run in WebKit (Safari) only
npx playwright test --project=webkit
```

### Debug Tests

```bash
# Run in debug mode
npx playwright test --debug

# Run specific test in debug mode
npx playwright test encryption-workflow --debug

# Generate test report
npx playwright show-report
```

## Test Configuration

The tests use a Playwright configuration file (`playwright.config.ts`) with the following features:

- **Multiple browsers**: Tests run on Chromium, Firefox, and WebKit
- **Automatic server start**: The Next.js dev server starts automatically
- **WebAuthn virtual authenticator**: Enabled for testing passwordless authentication
- **Screenshots on failure**: Automatically captured for debugging
- **Videos on retry**: Recorded for failed tests
- **Trace on retry**: Detailed trace files for debugging

## WebAuthn Testing

All tests use Playwright's WebAuthn virtual authenticator to simulate passkey/security key interactions:

```typescript
const client = await context.newCDPSession(page);
await client.send('WebAuthn.enable');
await client.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
  },
});
```

This allows tests to run without requiring actual hardware authenticators.

## CI/CD Integration

Tests run automatically in GitHub Actions on:
- Pull requests to `main` and `stage` branches
- Pushes to `main` and `stage` branches
- Nightly schedule (2 AM UTC)
- Manual workflow dispatch

The CI runs tests across all three browsers and uploads:
- Test reports
- Screenshots (on failure)
- Videos (on failure)
- Test artifacts

## Writing New Tests

When adding new E2E tests:

1. **Follow the existing structure**: Use `test.describe` blocks to group related tests
2. **Set up WebAuthn**: Include the virtual authenticator setup in `beforeEach`
3. **Use helper functions**: Extract common workflows into reusable helpers
4. **Add meaningful assertions**: Use clear, descriptive expect statements
5. **Handle async operations**: Always await page interactions and use proper timeouts
6. **Clean up**: Reset state between tests when needed

### Example Test Structure

```typescript
import { test, expect, type Page } from '@playwright/test';

test.describe('Feature Name', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;

    // Enable WebAuthn
    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });

    await page.goto('/');
  });

  test('should do something', async () => {
    // Test implementation
    await expect(page.locator('text=Something')).toBeVisible();
  });
});
```

## Common Patterns

### Uploading a File

```typescript
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles({
  name: 'test.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('content'),
});
```

### Waiting for Navigation

```typescript
await expect(page.locator('text=Next Step')).toBeVisible();
```

### Handling Downloads

```typescript
const downloadPromise = page.waitForEvent('download');
await page.locator('button:has-text("Download")').click();
const download = await downloadPromise;
```

### Handling Dialogs (Confirm/Alert)

```typescript
page.on('dialog', dialog => dialog.accept());
await page.locator('button:has-text("Delete")').click();
```

## Troubleshooting

### Tests Failing Locally

1. **Browser not installed error**: If you see `Executable doesn't exist at /root/.cache/ms-playwright/...`
   ```bash
   # Run this command to install browsers
   npx playwright install
   ```

2. **Ensure dev server is running**: The tests will start it automatically, but verify port 3000 is available
   ```bash
   # Check if something is using port 3000
   lsof -i :3000
   # Kill the process if needed
   kill -9 <PID>
   ```

3. **Clear browser cache**:
   ```bash
   npx playwright clean
   ```

4. **Update browsers**:
   ```bash
   npx playwright install
   ```

5. **Check WebAuthn support**: Some tests require virtual authenticator support (should work in all modern browsers)

### Timeout Errors

- Increase timeout in specific tests: `await expect(element).toBeVisible({ timeout: 10000 })`
- Check if the dev server started properly
- Verify network conditions aren't slow

### Flaky Tests

- Add explicit waits for dynamic content
- Use `toBeVisible()` instead of checking for element existence
- Ensure proper cleanup between tests

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [Playwright WebAuthn Testing](https://playwright.dev/docs/mock-browser-apis#webauthn)
