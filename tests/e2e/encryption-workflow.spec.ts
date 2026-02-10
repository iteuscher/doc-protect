import { test, expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * E2E tests for the encryption workflow
 * Tests the complete flow from file upload to encrypted bundle download
 */

test.describe('Encryption Workflow', () => {
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

    // Navigate to the app
    await page.goto('/');
  });

  test('should display the file upload section on initial load', async () => {
    await expect(page.locator('text=Upload a File').first()).toBeVisible();
    await expect(page.locator('text=Drag & drop or click anywhere to select')).toBeVisible();
    await expect(page.locator('text=Ready to upload a file')).toBeVisible();
  });

  test('should upload a standard file and navigate to verify identity', async () => {
    // Create a test file
    const fileContent = 'This is a test document for encryption';
    const fileName = 'test-document.txt';

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    // Should navigate to verify identity step
    await expect(page.locator('text=Verify Your Identity')).toBeVisible();
    await expect(page.locator(`text=Ready to encrypt: ${fileName}`)).toBeVisible();
  });

  test('should create credential and encrypt in one step', async () => {
    // Upload a test file
    const fileContent = 'Test content for credential creation';
    const fileName = 'credential-test.txt';
    const credentialName = 'Test Credential';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    // Wait for verify identity step
    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Enter credential name
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);

    // Click Create & Encrypt button — should create credential AND encrypt
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Should navigate directly to recipients step
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });
  });

  test('should complete full encryption workflow and download bundle', async () => {
    const fileContent = 'Complete encryption test content';
    const fileName = 'full-test.txt';
    const credentialName = 'Full Test Credential';

    // Step 1: Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Step 2: Create credential and encrypt in one step
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Should navigate to recipients step
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });

    // Step 3: Skip recipients and go to sharing
    await page.locator('button:has-text("Skip Recipients")').click();

    // Should show sharing options
    await expect(page.locator('text=Share the Encrypted File')).toBeVisible();

    // Step 4: Download bundle
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Download Bundle")').click();
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/\.dpf$/);
    await expect(page.locator('text=DPF file Created Successfully!')).toBeVisible();
    await expect(page.locator('text=Encryption Complete!')).toBeVisible();
  });

  test('should allow selecting an existing credential via dropdown', async () => {
    // First, create a credential by going through the flow once
    const fileContent1 = 'First file';
    const fileName1 = 'first-file.txt';
    const credentialName = 'Reusable Credential';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName1,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent1),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Skip Recipients")').click();
    await page.locator('button:has-text("Download Bundle")').click();

    // Wait for completion
    await expect(page.locator('text=Encryption Complete!')).toBeVisible();

    // Start over
    await page.locator('button:has-text("Encrypt Another File")').click();

    // Upload another file
    const fileContent2 = 'Second file';
    const fileName2 = 'second-file.txt';

    await fileInput.setInputFiles({
      name: fileName2,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent2),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Should see existing credential
    await expect(page.locator('text=Use Existing Credential')).toBeVisible();
    await expect(page.locator(`text=${credentialName}`)).toBeVisible();

    // Select the existing credential
    await page.locator(`button:has-text("${credentialName}")`).first().click();

    // Should be able to proceed with Encrypt File button
    await expect(page.locator('text=Encrypt File →')).toBeVisible();
  });

  test('should handle external credential selection via dropdown', async () => {
    const fileContent = 'External credential test';
    const fileName = 'external-test.txt';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Expand the existing credentials dropdown
    await page.locator('text=Or use an existing credential / password manager').click();

    // Click "Use Password Manager" button
    await page.locator('button:has-text("Select from Google, iCloud")').click();

    // Should show proceed button
    await expect(page.locator('text=Encrypt File →')).toBeVisible();

    // Verify status message
    await expect(page.locator('text=password manager').first()).toBeVisible();
  });

  test('should show progress indicator throughout workflow', async () => {
    const fileContent = 'Progress test';
    const fileName = 'progress.txt';
    const credentialName = 'Progress Credential';

    // Initial state - Upload step should be active
    const progressBar = page.locator('[class*="sticky"]').first();
    await expect(progressBar.locator('[class*="emerald"]', { hasText: 'Upload' })).toBeVisible();

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    // Identity step should be active
    await expect(page.locator('[class*="emerald"]', { hasText: 'Identity' })).toBeVisible();

    // Create credential and encrypt in one step
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Recipients step should be active
    await expect(page.locator('[class*="emerald"]', { hasText: 'Recipients' })).toBeVisible({ timeout: 15000 });

    // Go to sharing
    await page.locator('button:has-text("Skip Recipients")').click();

    // Share step should be active
    await expect(progressBar.locator('[class*="emerald"]', { hasText: 'Share' })).toBeVisible();
  });

  test('should display PRF support information', async () => {
    // Technical info section should exist
    const technicalInfoButton = page.locator('button:has-text("Technical Info")');
    await expect(technicalInfoButton).toBeVisible();

    // Expand technical info
    await technicalInfoButton.click();

    // Should show PRF support status
    await expect(page.locator('text=PRF Support Status')).toBeVisible();
    await expect(page.locator('text=Platform:')).toBeVisible();
  });

  test('should validate credential name is required', async () => {
    const fileContent = 'Validation test';
    const fileName = 'validation.txt';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Clear any pre-filled value first
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.clear();

    // Try to create without entering name (button should be disabled)
    const createButton = page.locator('button:has-text("Create & Encrypt")');
    await expect(createButton).toBeDisabled();

    // Enter name, button should be enabled
    await credentialInput.fill('Valid Name');
    await expect(createButton).toBeEnabled();
  });

  test('should allow starting over from any step', async () => {
    const fileContent = 'Start over test';
    const fileName = 'startover.txt';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Click back to file upload
    await page.locator('text=← Back to File Upload').click();

    // Should be back at file upload
    await expect(page.locator('text=Upload a File').first()).toBeVisible();
    await expect(page.locator('text=Ready to upload a file')).toBeVisible();
  });
});
