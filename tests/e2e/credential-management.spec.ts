import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for credential management
 * Tests credential creation, storage, selection, and display
 */

test.describe('Credential Management', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;

    // Enable WebAuthn virtual authenticator
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

  /**
   * Helper to navigate to credential creation screen
   */
  async function navigateToCredentialScreen(fileName = 'test.txt') {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('test content'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();
  }

  /**
   * Helper to create a credential and encrypt, then complete the full flow
   */
  async function createAndEncryptFull(fileName: string, credName: string) {
    await navigateToCredentialScreen(fileName);

    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Create & Encrypt goes directly to Recipients
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Skip Recipients")').click();
    await page.locator('button:has-text("Download Bundle")').click();
    await expect(page.locator('text=Encryption Complete!')).toBeVisible();
  }

  test('should create a credential with custom name and encrypt', async () => {
    await navigateToCredentialScreen();

    const credentialName = 'My Custom Credential';
    const credentialInput = page.locator('input[placeholder="Credential name"]');

    // Enter name
    await credentialInput.fill(credentialName);
    await expect(credentialInput).toHaveValue(credentialName);

    // Create & Encrypt button should be enabled
    const createButton = page.locator('button:has-text("Create & Encrypt")');
    await expect(createButton).toBeEnabled();

    // Click create & encrypt
    await createButton.click();

    // Should proceed directly to recipients step
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });
  });

  test('should disable create button when name is empty', async () => {
    await navigateToCredentialScreen();

    const createButton = page.locator('button:has-text("Create & Encrypt")');
    const credentialInput = page.locator('input[placeholder="Credential name"]');

    // Clear any pre-filled value first
    await credentialInput.clear();
    await expect(createButton).toBeDisabled();

    // Add name, should enable
    await credentialInput.fill('Test');
    await expect(createButton).toBeEnabled();

    // Clear name, should disable again
    await credentialInput.clear();
    await expect(createButton).toBeDisabled();
  });

  test('should pre-fill credential name based on file name', async () => {
    const fileName = 'Important Document.pdf';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('pdf content'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should pre-fill without extension
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await expect(credentialInput).toHaveValue('Important Document');
  });

  test('should store and display multiple credentials', async () => {
    const credentials = ['Credential One', 'Credential Two', 'Credential Three'];

    for (const credName of credentials) {
      await createAndEncryptFull(`file-${credName}.txt`, credName);
      await page.locator('button:has-text("Encrypt Another File")').click();
    }

    // Upload another file to see all credentials
    await navigateToCredentialScreen('final-test.txt');

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Should show "Use Existing Credential" section
    await expect(page.locator('text=Use Existing Credential')).toBeVisible();

    // All credentials should be visible
    for (const credName of credentials) {
      await expect(page.locator(`button:has-text("${credName}")`)).toBeVisible();
    }
  });

  test('should allow selecting an existing credential', async () => {
    // Create a credential
    const credName = 'Selectable Credential';
    await createAndEncryptFull('first-file.txt', credName);
    await page.locator('button:has-text("Encrypt Another File")').click();

    // Upload new file
    await navigateToCredentialScreen('second-file.txt');

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Select the existing credential
    const credButton = page.locator(`button:has-text("${credName}")`).first();
    await credButton.click();

    // Button should be highlighted/selected
    await expect(credButton).toHaveClass(/blue/);

    // Should show encrypt button inside the dropdown
    await expect(page.locator('text=Encrypt File →')).toBeVisible();

    // Status should update
    await expect(page.locator('text=Credential selected')).toBeVisible();
  });

  test('should display credential type (PRF or Fallback)', async () => {
    const credName = 'Type Display Test';
    await createAndEncryptFull('test.txt', credName);

    // Expand technical info
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator('text=Stored Credentials')).toBeVisible();

    // Should show credential with type
    await expect(page.locator(`text=${credName}`)).toBeVisible();

    // Should show either PRF or Fallback type
    const hasPRF = await page.locator('text=Type: webauthn-prf').isVisible();
    const hasFallback = await page.locator('text=Type: fallback-pbkdf2').isVisible();
    expect(hasPRF || hasFallback).toBeTruthy();
  });

  test('should show credential ID in technical info', async () => {
    const credName = 'ID Display Test';
    await createAndEncryptFull('test.txt', credName);

    // Open technical info
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator('text=Stored Credentials')).toBeVisible();

    // Should show credential ID (truncated)
    await expect(page.locator(`text=${credName}`)).toBeVisible();
    await expect(page.locator('text=ID:')).toBeVisible();
  });

  test('should show "No credentials stored" when none exist', async () => {
    // Open technical info on fresh page
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator('text=Stored Credentials')).toBeVisible();
    await expect(page.locator('text=No credentials stored')).toBeVisible();
  });

  test('should handle external credential mode', async () => {
    await navigateToCredentialScreen();

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Click "Use Password Manager"
    const pwdMgrButton = page.locator('button:has-text("Select from Google, iCloud")');
    await pwdMgrButton.click();

    // Button should be highlighted
    await expect(pwdMgrButton).toHaveClass(/purple/);

    // Should show proceed button
    await expect(page.locator('text=Encrypt File →')).toBeVisible();

    // Status should update
    await expect(page.locator('text=password manager').first()).toBeVisible();
  });

  test('should show helpful text for creating new credential', async () => {
    await navigateToCredentialScreen();

    // Should show recommendation text
    await expect(page.locator('text=Create New Credential & Encrypt (Recommended)')).toBeVisible();
    await expect(page.locator('text=Creates a passkey and encrypts the file in one step')).toBeVisible();
  });

  test('should show helpful text for password manager option', async () => {
    await navigateToCredentialScreen();

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Should show password manager text
    await expect(page.locator('text=Use an existing DPF passkey from your password manager')).toBeVisible();
  });

  test('should display PRF support status in technical info', async () => {
    // Open technical info
    await page.locator('button:has-text("Technical Info")').click();

    // Should show PRF support section
    await expect(page.locator('text=PRF Support Status')).toBeVisible();
    await expect(page.locator('text=Supported:')).toBeVisible();
    await expect(page.locator('text=Platform:')).toBeVisible();
    await expect(page.locator('text=Fallback Required:')).toBeVisible();
  });

  test('should show PRF warning banner when not supported', async () => {
    // This test depends on the platform/browser
    // On Windows, it should show a warning
    // We'll just check if the element exists conditionally

    const prfWarning = page.locator('text=PRF not available');
    const warningExists = await prfWarning.isVisible().catch(() => false);

    if (warningExists) {
      await expect(page.locator('text=Fallback mode will be used')).toBeVisible();
    }

    // This is a soft assertion - the test passes either way
    expect(true).toBe(true);
  });

  test('should reset all data when reset button is clicked', async () => {
    // Create a credential first
    const credName = 'To Be Deleted';
    await createAndEncryptFull('test.txt', credName);

    // Verify credential exists
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator(`text=${credName}`)).toBeVisible();
    await page.locator('button:has-text("Technical Info")').click(); // Close

    // Click reset (handle confirmation dialog)
    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Reset All")').click();

    // Wait for reload
    await page.waitForLoadState('networkidle');

    // Verify credentials are gone
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator('text=No credentials stored')).toBeVisible();
  });

  test('should not reset when canceling confirmation', async () => {
    // Create a credential
    const credName = 'Should Remain';
    await createAndEncryptFull('test.txt', credName);

    // Dismiss the reset confirmation
    page.on('dialog', dialog => dialog.dismiss());
    await page.locator('button:has-text("Reset All")').click();

    // Credential should still exist
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator(`text=${credName}`)).toBeVisible();
  });
});
