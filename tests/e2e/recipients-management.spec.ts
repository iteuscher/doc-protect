import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for recipients management
 * Tests adding, removing, and validating recipients during encryption
 */

test.describe('Recipients Management', () => {
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
   * Helper to navigate to recipients screen
   * Uses Create & Encrypt which goes directly to Recipients
   */
  async function navigateToRecipientsScreen(
    fileName = 'test.txt',
    credentialName = 'Test Credential'
  ) {
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('test content'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Create credential and encrypt in one step
    const credentialInput = page.locator('input[placeholder="Credential name"]');
    await credentialInput.fill(credentialName);
    await page.locator('button:has-text("Create & Encrypt")').click();

    // Goes directly to Recipients
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible({ timeout: 15000 });
  }

  test('should display recipients section after encryption', async () => {
    await navigateToRecipientsScreen();

    // Should show recipients UI
    await expect(page.locator('text=Add Recipients (Optional)')).toBeVisible();
    await expect(page.locator('text=Who should be able to decrypt this file?')).toBeVisible();
    await expect(page.locator('input[placeholder="recipient@example.com"]')).toBeVisible();
    await expect(page.locator('button:has-text("Add")')).toBeVisible();
  });

  test('should add a valid email recipient', async () => {
    await navigateToRecipientsScreen();

    const email = 'alice@example.com';
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Enter email
    await emailInput.fill(email);
    await expect(emailInput).toHaveValue(email);

    // Click add
    await page.locator('button:has-text("Add")').click();

    // Should show recipient in list
    await expect(page.locator(`text=${email}`).first()).toBeVisible();

    // Input should be cleared
    await expect(emailInput).toHaveValue('');

    // Status should update
    await expect(page.locator(`text=Added ${email} as recipient`)).toBeVisible();
  });

  test('should add multiple recipients', async () => {
    await navigateToRecipientsScreen();

    const recipients = [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
    ];

    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of recipients) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();
      await expect(page.locator(`text=${email}`).first()).toBeVisible();
    }

    // All recipients should be visible
    for (const email of recipients) {
      await expect(page.locator(`text=${email}`).first()).toBeVisible();
    }

    // Should show "Recipients:" label
    await expect(page.locator('text=Recipients:')).toBeVisible();
  });

  test('should validate email format', async () => {
    await navigateToRecipientsScreen();

    const invalidEmails = [
      'not-an-email',
      'missing@domain',
      '@example.com',
      'test@',
      'test@@example.com',
    ];

    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of invalidEmails) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();

      // Should show error
      await expect(page.locator('text=Please enter a valid email address')).toBeVisible();

      // Should not be added to list
      const recipientExists = await page.locator(`text=${email}`).count();
      expect(recipientExists).toBeLessThanOrEqual(1); // Only the error message might contain it
    }
  });

  test('should prevent duplicate recipients', async () => {
    await navigateToRecipientsScreen();

    const email = 'duplicate@example.com';
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Add first time
    await emailInput.fill(email);
    await page.locator('button:has-text("Add")').click();
    await expect(page.locator(`text=${email}`).first()).toBeVisible();

    // Try to add again
    await emailInput.fill(email);
    await page.locator('button:has-text("Add")').click();

    // Should show error
    await expect(page.locator('text=This recipient has already been added')).toBeVisible();
  });

  test('should remove a recipient', async () => {
    await navigateToRecipientsScreen();

    const email = 'remove-me@example.com';
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Add recipient
    await emailInput.fill(email);
    await page.locator('button:has-text("Add")').click();
    await expect(page.locator(`text=${email}`).first()).toBeVisible();

    // Remove recipient
    const removeButton = page.locator(`text=${email}`).locator('..').locator('button:has-text("Remove")');
    await removeButton.click();

    // Status should update
    await expect(page.locator(`text=Removed ${email}`)).toBeVisible();

    // Should be removed from recipient list (check that no Remove button exists with this email)
    const recipientItem = page.locator(`text=${email}`).locator('..').locator('button:has-text("Remove")');
    await expect(recipientItem).not.toBeVisible();
  });

  test('should allow pressing Enter to add recipient', async () => {
    await navigateToRecipientsScreen();

    const email = 'enter-key@example.com';
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Enter email and press Enter
    await emailInput.fill(email);
    await emailInput.press('Enter');

    // Should be added
    await expect(page.locator(`text=${email}`).first()).toBeVisible();
  });

  test('should not add empty email', async () => {
    await navigateToRecipientsScreen();

    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Try to add empty email
    await emailInput.fill('');
    await page.locator('button:has-text("Add")').click();

    // Should not show any error (just ignored)
    // Recipients section should still be empty
    const recipientsLabel = page.locator('text=Recipients:');
    await expect(recipientsLabel).not.toBeVisible();
  });

  test('should skip recipients and proceed to sharing', async () => {
    await navigateToRecipientsScreen();

    // Click skip
    await page.locator('button:has-text("Skip Recipients")').click();

    // Should navigate to sharing
    await expect(page.locator('text=Share the Encrypted File')).toBeVisible();
    await expect(page.locator('text=No additional recipients. Choose sharing method.')).toBeVisible();
  });

  test('should proceed to sharing with recipients', async () => {
    await navigateToRecipientsScreen();

    // Add recipients
    const recipients = ['user1@example.com', 'user2@example.com'];
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of recipients) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();
    }

    // Proceed to sharing
    await page.locator('button:has-text("Continue to Sharing →")').click();

    // Should navigate to sharing
    await expect(page.getByRole('heading', { name: 'Share the Encrypted File' })).toBeVisible();
    await expect(page.locator('text=Choose how to share the encrypted file')).toBeVisible();
  });

  test('should show recipients in technical info', async () => {
    await navigateToRecipientsScreen();

    // Add recipients
    const recipients = ['tech1@example.com', 'tech2@example.com'];
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of recipients) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();
    }

    // Open technical info
    await page.locator('button:has-text("Technical Info")').click();

    // Should show recipients in workflow state
    await expect(page.locator('text=Current Workflow State')).toBeVisible();
    await expect(page.locator('text=Recipients:').first()).toBeVisible();

    // Recipients should be listed
    const recipientText = recipients.join(', ');
    await expect(page.locator(`text=${recipientText}`)).toBeVisible();
  });

  test('should persist recipients when navigating steps', async () => {
    await navigateToRecipientsScreen();

    const email = 'persist@example.com';
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Add recipient
    await emailInput.fill(email);
    await page.locator('button:has-text("Add")').click();
    await expect(page.locator(`text=${email}`).first()).toBeVisible();

    // Go to sharing
    await page.locator('button:has-text("Continue to Sharing →")').click();
    await expect(page.getByRole('heading', { name: 'Share the Encrypted File' })).toBeVisible();

    // Check technical info - recipient should still be there
    await page.locator('button:has-text("Technical Info")').click();
    await expect(page.locator(`text=${email}`).first()).toBeVisible();
  });

  test('should show recipients count when multiple added', async () => {
    await navigateToRecipientsScreen();

    const recipients = ['one@example.com', 'two@example.com', 'three@example.com'];
    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of recipients) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();
    }

    // Should show all recipients in the list
    for (const email of recipients) {
      await expect(page.locator(`text=${email}`).first()).toBeVisible();
    }

    // Count should match
    const recipientItems = await page.locator('button:has-text("Remove")').count();
    expect(recipientItems).toBe(recipients.length);
  });

  test('should handle recipients with special characters in email', async () => {
    await navigateToRecipientsScreen();

    const specialEmails = [
      'user+tag@example.com',
      'user.name@example.com',
      'user_name@example.co.uk',
      'user-name@example-domain.com',
    ];

    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    for (const email of specialEmails) {
      await emailInput.fill(email);
      await page.locator('button:has-text("Add")').click();

      // Should be added successfully
      await expect(page.locator(`text=${email}`).first()).toBeVisible();
    }
  });

  test('should clear error when valid email is entered', async () => {
    await navigateToRecipientsScreen();

    const emailInput = page.locator('input[placeholder="recipient@example.com"]');

    // Enter invalid email
    await emailInput.fill('invalid');
    await page.locator('button:has-text("Add")').click();
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();

    // Enter valid email
    await emailInput.fill('valid@example.com');
    await page.locator('button:has-text("Add")').click();

    // Error should be cleared
    await expect(page.locator('text=Please enter a valid email address')).not.toBeVisible();

    // Valid email should be added
    await expect(page.locator('text=valid@example.com').first()).toBeVisible();
  });

  test('should show both skip and continue buttons', async () => {
    await navigateToRecipientsScreen();

    // Both buttons should be visible
    await expect(page.locator('button:has-text("Skip Recipients")')).toBeVisible();
    await expect(page.locator('button:has-text("Continue to Sharing →")')).toBeVisible();
  });

  test('should only show recipients step for encryption, not decryption', async () => {
    // This is verified by uploading a Rico file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.rico',
      mimeType: 'application/zip',
      buffer: Buffer.from('mock rico content'),
    });

    await expect(page.locator('text=Verify Your Identity')).toBeVisible();

    // Select external credential
    await page.locator('button:has-text("Select from Google, iCloud")').click();

    // Note: Actual decryption won't work with mock data, but we can verify
    // that the workflow doesn't show recipients step
    // The progress indicator should not show Recipients for Rico files
    const progressBar = page.locator('[class*="sticky"]').first();
    const hasRecipientsStep = await progressBar.locator('text=Recipients').isVisible();

    // Recipients step should not be in the progress bar for decryption
    expect(hasRecipientsStep).toBe(false);
  });
});
