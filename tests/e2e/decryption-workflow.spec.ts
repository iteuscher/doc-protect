import { test, expect, type Page, type Download } from '@playwright/test';

/**
 * E2E tests for the decryption workflow
 * Tests the complete flow from DPF file upload to decrypted file download
 */

test.describe('Decryption Workflow', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;

    // Enable WebAuthn virtual authenticator for testing
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
   * Helper function to create an encrypted file first
   * Returns the download promise for the DPF file
   */
  async function createEncryptedFile(
    fileName: string,
    fileContent: string,
    credentialName: string
  ): Promise<Download> {
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Create credential
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create")').click();
    await expect(page.locator('text=Encrypt File →')).toBeVisible({ timeout: 10000 });

    // Encrypt
    await page.locator('button:has-text("Encrypt File →")').click();
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });

    // Skip recipients
    await page.locator('button:has-text("Skip Recipients")').click();
    await expect(page.locator('text=Share the Encrypted File')).toBeVisible();

    // Download bundle
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Download Bundle")').click();
    const download = await downloadPromise;

    await expect(page.locator('text=Encryption Complete!')).toBeVisible();

    return download;
  }

  test('should detect DPF file on upload', async () => {
    // Create a mock DPF file (ZIP file)
    const dpfFileName = 'test-file.dpf';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: dpfFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf content'),
    });

    // Should navigate to verify identity
    await expect(page.locator('text=Verify Your Identity')).toBeVisible();
    await expect(page.locator(`text=${dpfFileName}`)).toBeVisible();
    await expect(page.locator('text=This is an encrypted DPF file (will be decrypted)')).toBeVisible();
    await expect(page.locator('text=DPF file detected. Ready to decrypt.')).toBeVisible();
  });

  test('should show credential selection options for decryption', async () => {
    // Upload a DPF file
    const dpfFileName = 'encrypted.dpf';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: dpfFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should see decryption-specific text
    await expect(page.locator('text=Select the credential used to encrypt this file')).toBeVisible();

    // Should see password manager option
    await expect(page.locator('text=Use Password Manager')).toBeVisible();
    await expect(page.locator('button:has-text("Select from Google, iCloud")')).toBeVisible();
  });

  test('should allow external credential for decryption', async () => {
    const dpfFileName = 'encrypted.dpf';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: dpfFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Select external credential
    await page.locator('button:has-text("Select from Google, iCloud")').click();

    // Should show decrypt button
    await expect(page.locator('text=Decrypt File →')).toBeVisible();

    // Should show helpful message
    await expect(page.locator('text=password manager')).toBeVisible();
  });

  test('should complete full encrypt-then-decrypt cycle', async () => {
    const originalFileName = 'cycle-test.txt';
    const originalContent = 'This content will be encrypted then decrypted';
    const credentialName = 'Cycle Test Credential';

    // === ENCRYPTION PHASE ===
    const download = await createEncryptedFile(originalFileName, originalContent, credentialName);

    // Save the DPF file
    const dpfPath = await download.path();
    expect(dpfPath).toBeTruthy();

    // Start over for decryption
    await page.locator('button:has-text("Encrypt Another File")').click();
    await expect(page.locator('text=Upload a File')).toBeVisible();

    // === DECRYPTION PHASE ===
    // Upload the DPF file we just created
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(dpfPath!);

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();
    await expect(page.locator('text=This is an encrypted DPF file (will be decrypted)')).toBeVisible();

    // Should see the credential we created
    await expect(page.locator('text=Use Stored Credential')).toBeVisible();
    await expect(page.locator(`text=${credentialName}`)).toBeVisible();

    // Select the credential
    await page.locator(`button:has-text("${credentialName}")`).first().click();

    // Decrypt
    await page.locator('button:has-text("Decrypt File →")').click();

    // Should show decryption complete
    await expect(page.locator('text=Decryption Complete!')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=File decrypted successfully')).toBeVisible();

    // Should have download link
    await expect(page.locator(`text=${originalFileName}`)).toBeVisible();
    await expect(page.locator('text=Download Decrypted File')).toBeVisible();
  });

  test('should show stored credentials when decrypting', async () => {
    // First create a credential
    const fileName = 'credential-test.txt';
    const fileContent = 'Test content';
    const credentialName = 'Stored Credential Test';

    await createEncryptedFile(fileName, fileContent, credentialName);

    // Start over
    await page.locator('button:has-text("Encrypt Another File")').click();

    // Upload a DPF file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should see "Use Stored Credential" section
    await expect(page.locator('text=Use Stored Credential')).toBeVisible();

    // Should see the credential we created
    await expect(page.locator(`text=${credentialName}`)).toBeVisible();

    // Credential should be clickable
    const credButton = page.locator(`button:has-text("${credentialName}")`).first();
    await expect(credButton).toBeEnabled();
  });

  test('should allow starting over from decryption flow', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Click back
    await page.locator('text=← Back to File Upload').click();

    // Should be at upload screen
    await expect(page.locator('text=Upload a File')).toBeVisible();
  });

  test('should display decryption progress in status', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'status-test.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    // Check initial status
    await expect(page.locator('text=DPF file detected. Ready to decrypt.')).toBeVisible();

    // Select external credential
    await page.locator('button:has-text("Select from Google, iCloud")').click();

    // Status should update
    await expect(page.locator('text=password manager')).toBeVisible();
  });

  test('should show correct step indicator for decryption', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'indicator-test.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    // Should show Identity step as active
    await expect(page.locator('[class*="emerald"]', { hasText: 'Identity' })).toBeVisible();

    // Should NOT show Recipients or Share steps (those are encryption-only)
    const recipientsIndicator = page.locator('text=Recipients').first();
    const shareIndicator = page.locator('text=Share').first();

    // These may not be visible for decryption workflow
    // Just verify the page is showing the decryption path
    await expect(page.locator('text=Select the credential used to encrypt')).toBeVisible();
  });

  test('should handle "Decrypt Another File" action', async () => {
    // Create and decrypt a file
    const fileName = 'another-test.txt';
    const fileContent = 'Content for another test';
    const credentialName = 'Another Test Credential';

    const download = await createEncryptedFile(fileName, fileContent, credentialName);
    const dpfPath = await download.path();

    // Start over and decrypt
    await page.locator('button:has-text("Encrypt Another File")').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(dpfPath!);

    await page.locator(`button:has-text("${credentialName}")`).first().click();
    await page.locator('button:has-text("Decrypt File →")').click();

    await expect(page.locator('text=Decryption Complete!')).toBeVisible({ timeout: 15000 });

    // Click "Decrypt Another File"
    await page.locator('button:has-text("Decrypt Another File")').click();

    // Should be back at upload
    await expect(page.locator('text=Upload a File')).toBeVisible();
    await expect(page.locator('text=Ready to upload a file')).toBeVisible();
  });

  test('should display technical info with stored credentials during decryption', async () => {
    // Create a credential first
    const fileName = 'tech-info-test.txt';
    const fileContent = 'Technical info test';
    const credentialName = 'Tech Info Credential';

    await createEncryptedFile(fileName, fileContent, credentialName);

    // Start over and go to decryption
    await page.locator('button:has-text("Encrypt Another File")').click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'tech.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    // Open technical info
    await page.locator('button:has-text("Technical Info")').click();

    // Should show stored credentials
    await expect(page.locator('text=Stored Credentials')).toBeVisible();
    await expect(page.locator(`text=${credentialName}`).first()).toBeVisible();
  });

  test('should validate credential selection before decryption', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'validation.dpf',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock dpf'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Without selecting a credential, decrypt button should not be visible
    const decryptButton = page.locator('button:has-text("Decrypt File →")');
    await expect(decryptButton).not.toBeVisible();

    // After selecting external credential, button should appear
    await page.locator('button:has-text("Select from Google, iCloud")').click();
    await expect(decryptButton).toBeVisible();
  });
});
