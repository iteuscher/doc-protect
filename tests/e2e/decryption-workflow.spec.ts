import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'fs/promises';

/**
 * E2E tests for the decryption workflow
 * Tests the complete flow from Rico file upload to decrypted file download
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
   * Returns the download promise for the Rico file
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

    // Create credential and encrypt in one step
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Goes directly to Recipients
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });

    // Skip recipients
    await page.locator('button:has-text("Skip Recipients")').click();
    await expect(page.getByRole('heading', { name: 'Share the Encrypted File' })).toBeVisible();

    // Download bundle
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Download Bundle")').click();
    const download = await downloadPromise;

    await expect(page.locator('text=Encryption Complete!')).toBeVisible();

    return download;
  }

  test('should detect Rico file on upload', async () => {
    // Create a mock Rico file (ZIP file)
    const ricoFileName = 'test-file.rico';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: ricoFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico content'),
    });

    // Should navigate to verify identity
    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Status should show Rico detection
    await expect(page.locator('text=Ready to decrypt')).toBeVisible();
  });

  test('should show credential selection options for decryption', async () => {
    // Upload a Rico file
    const ricoFileName = 'encrypted.rico';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: ricoFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should see password manager option
    await expect(page.locator('text=Use Password Manager')).toBeVisible();
    await expect(page.locator('button:has-text("Google, iCloud, Bitwarden")')).toBeVisible();
  });

  test('should allow external credential for decryption', async () => {
    const ricoFileName = 'encrypted.rico';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: ricoFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Select external credential
    await page.locator('button:has-text("Google, iCloud, Bitwarden")').click();

    // Should show decrypt button
    await expect(page.locator('text=Decrypt File →')).toBeVisible();

    // Should show helpful message
    await expect(page.locator('text=password manager').first()).toBeVisible();
  });

  test('should complete full encrypt-then-decrypt cycle', async () => {
    const originalFileName = 'cycle-test.txt';
    const originalContent = 'This content will be encrypted then decrypted';
    const credentialName = 'Cycle Test Credential';

    // === ENCRYPTION PHASE ===
    const download = await createEncryptedFile(originalFileName, originalContent, credentialName);

    // Save the Rico file
    const ricoPath = await download.path();
    expect(ricoPath).toBeTruthy();

    // Start over for decryption
    await page.locator('button:has-text("Encrypt / Decrypt a File")').click();
    await expect(page.locator('text=Upload a File').first()).toBeVisible();

    // === DECRYPTION PHASE ===
    // Upload the Rico file we just created (with correct .rico extension)
    const fileInput = page.locator('input[type="file"]');
    const ricoBuffer = await readFile(ricoPath!);
    await fileInput.setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: ricoBuffer,
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should see the credential we created
    await expect(page.locator('text=Stored Credentials').first()).toBeVisible();
    await expect(page.locator(`text=${credentialName}`)).toBeVisible();

    // Select the credential
    await page.getByText(credentialName).first().click();

    // Decrypt
    await page.locator('button:has-text("Decrypt File →")').click();

    // Should show decryption complete
    await expect(page.locator('text=Decryption Complete!')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=File decrypted successfully').first()).toBeVisible();

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
    await page.locator('button:has-text("Encrypt / Decrypt a File")').click();

    // Upload a Rico file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Should see stored credentials section
    await expect(page.locator('text=Stored Credentials').first()).toBeVisible();

    // Should see the credential we created
    await expect(page.locator(`text=${credentialName}`)).toBeVisible();

    // Credential should be clickable
    const credButton = page.getByText(credentialName).first();
    await expect(credButton).toBeVisible();
  });

  test('should allow starting over from decryption flow', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Click back
    await page.locator('text=← Back to File Upload').click();

    // Should be at upload screen
    await expect(page.locator('text=Upload a File').first()).toBeVisible();
  });

  test('should display decryption progress in status', async () => {
    const ricoFileName = 'status-test.rico';
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: ricoFileName,
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    // Check initial status
    await expect(page.locator('text=Ready to decrypt')).toBeVisible();

    // Select external credential
    await page.locator('button:has-text("Google, iCloud, Bitwarden")').click();

    // Status should update
    await expect(page.locator('text=password manager').first()).toBeVisible();
  });

  test('should show correct step indicator for decryption', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'indicator-test.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    // Should show Identity step as active
    await expect(page.locator('[class*="emerald"]', { hasText: 'Identity' })).toBeVisible();

    // Should NOT show Recipients or Share steps (those are encryption-only)
    // Just verify the page is showing the decryption path
    await expect(page.locator('text=Use Password Manager')).toBeVisible();
  });

  test('should handle "Decrypt Another File" action', async () => {
    // Create and decrypt a file
    const fileName = 'another-test.txt';
    const fileContent = 'Content for another test';
    const credentialName = 'Another Test Credential';

    const download = await createEncryptedFile(fileName, fileContent, credentialName);
    const ricoPath = await download.path();

    // Start over and decrypt
    await page.locator('button:has-text("Encrypt / Decrypt a File")').click();
    const fileInput = page.locator('input[type="file"]');
    const ricoBuffer = await readFile(ricoPath!);
    await fileInput.setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: ricoBuffer,
    });

    // Wait for identity screen
    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    await page.getByText(credentialName).first().click();
    await page.locator('button:has-text("Decrypt File →")').click();

    await expect(page.locator('text=Decryption Complete!')).toBeVisible({ timeout: 15000 });

    // Click "Decrypt Another File"
    await page.locator('button:has-text("Encrypt / Decrypt a File")').click();

    // Should be back at upload
    await expect(page.locator('text=Upload a File to Encrypt or Decrypt')).toBeVisible();
    await expect(page.locator('text=Ready to upload a file')).toBeVisible();
  });

  test('should display technical info with stored credentials during decryption', async () => {
    // Create a credential first
    const fileName = 'tech-info-test.txt';
    const fileContent = 'Technical info test';
    const credentialName = 'Tech Info Credential';

    await createEncryptedFile(fileName, fileContent, credentialName);

    // Start over and go to decryption
    await page.locator('button:has-text("Encrypt / Decrypt a File")').click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'tech.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    // Open technical info
    await page.locator('button:has-text("Technical Info")').click();

    // Should show stored credentials
    await expect(page.locator('text=Stored Credentials').first()).toBeVisible();
    await expect(page.locator(`text=${credentialName}`).first()).toBeVisible();
  });

  test('should validate credential selection before decryption', async () => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'validation.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Without selecting a credential, decrypt button should not be visible
    const decryptButton = page.locator('button:has-text("Decrypt File →")');
    await expect(decryptButton).not.toBeVisible();

    // After selecting external credential, button should appear
    await page.locator('button:has-text("Google, iCloud, Bitwarden")').click();
    await expect(decryptButton).toBeVisible();
  });
});
