import { test, expect } from '@playwright/test';

/**
 * The one thing the unit and component suites cannot prove: that a secret
 * survives a real round trip through a real Postgres, and that the row the
 * server ends up holding is unreadable.
 *
 * Requires a live Supabase project with `Confirm email` off — see VERIFY.md
 * step 3. Each test signs up a fresh account through the real form, which is
 * both more honest than injecting a session cookie and necessary: these tests
 * create a family, so they need an account that has none.
 *
 * The account password and the vault passphrase are deliberately different
 * strings. The setup screen refuses them being the same, so a test that reused
 * one would fail for the right reason at the wrong moment.
 */

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const PASSWORD = 'e2e account password';

test.describe('the vault, end to end', () => {
  test.skip(!configured, 'Needs a live Supabase project. See docs/VERIFY.md.');

  test.beforeEach(async ({ page }) => {
    // Unique per test, so every run starts with an account that has no vault.
    const email = `e2e+${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;

    await page.goto('/signin');
    await page.getByRole('button', { name: /create an account instead/i }).click();
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /create my account/i }).click();

    // With confirmations off this is immediate and sends no mail. If a "check
    // your email" screen appears instead, the project still has them on.
    await expect(page).toHaveURL(/\/(vault|setup|unlock)/, { timeout: 15_000 });
  });

  test('sets up a vault, locks it, and unlocks it again', async ({ page }) => {
    const passphrase = `e2e passphrase ${Date.now()}`;

    await page.goto('/setup');

    await page.getByLabel(/what should we call your family/i).fill('E2E Family');
    await page.getByLabel('Choose a passphrase').fill(passphrase);
    await page.getByLabel('Type it once more').fill(passphrase);
    await page.getByRole('button', { name: /create my vault/i }).click();

    // The recovery kit. Read the code off the screen and answer the challenge.
    await expect(page.getByText(/only other way into your vault/i)).toBeVisible({
      timeout: 30_000,
    });

    const challengeLabel = await page.getByText(/Type the \w+ group/).textContent();
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const index = ordinals.findIndex((ordinal) => challengeLabel?.includes(ordinal));

    const codeText = (await page.locator('p.font-mono').first().textContent()) ?? '';
    const groups = codeText.replace('FGK1-', '').trim().split('-');

    await page.getByLabel(/saved this code somewhere safe/i).check();
    await page.getByRole('textbox').fill(groups[index]);
    await page.getByRole('button', { name: /open my vault/i }).click();

    await expect(page.getByText('Unlocked')).toBeVisible();

    // Store a secret and read it back through the database.
    await page.getByLabel(/a secret to store/i).fill('4417');
    await page.getByRole('button', { name: /store it, read it back/i }).click();

    await expect(page.getByText('Decrypted correctly')).toBeVisible({ timeout: 30_000 });

    // What the server actually holds must not contain the secret.
    const storedRow = (await page.locator('pre').first().textContent()) ?? '';
    expect(storedRow).not.toContain('4417');
    expect(storedRow).toContain('A256GCM');

    // Locking drops the key; a reload must not bring it back.
    await page.getByRole('button', { name: 'Lock' }).click();
    await expect(page).toHaveURL(/\/unlock/);

    await page.reload();
    await expect(page.getByLabel('Passphrase')).toBeVisible();

    await page.getByLabel('Passphrase').fill('the wrong one');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText(/does not open this vault/i);

    await page.getByLabel('Passphrase').fill(passphrase);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Unlocked')).toBeVisible({ timeout: 30_000 });
  });

  test('adds a contact and keeps its account number encrypted', async ({ page }) => {
    const passphrase = `e2e passphrase ${Date.now()}`;

    await page.goto('/setup');
    await page.getByLabel(/what should we call your family/i).fill('E2E Family');
    await page.getByLabel('Choose a passphrase').fill(passphrase);
    await page.getByLabel('Type it once more').fill(passphrase);
    await page.getByRole('button', { name: /create my vault/i }).click();

    await expect(page.getByText(/only other way into your vault/i)).toBeVisible({
      timeout: 30_000,
    });

    const challengeLabel = await page.getByText(/Type the \w+ group/).textContent();
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const index = ordinals.findIndex((ordinal) => challengeLabel?.includes(ordinal));
    const codeText = (await page.locator('p.font-mono').first().textContent()) ?? '';
    const groups = codeText.replace('FGK1-', '').trim().split('-');

    await page.getByLabel(/saved this code somewhere safe/i).check();
    await page.getByRole('textbox').fill(groups[index]);
    await page.getByRole('button', { name: /open my vault/i }).click();
    await expect(page.getByText('Unlocked')).toBeVisible();

    // Into Contacts, and add one.
    await page.getByRole('link', { name: /^Contacts/ }).click();
    await page.getByRole('button', { name: /add your first contact/i }).click();

    // Autosave: type, then move on. There is no save button to press.
    await page.getByLabel('Name').fill('Riverside Plumbing');
    await page.getByLabel(/what are they/i).fill('Plumber');
    await page.getByRole('button', { name: /add more details/i }).click();
    await page.getByLabel(/^Account number/).fill('000123456789');
    await page.getByLabel('Name').click();

    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15_000 });

    // The list shows the masked hint without decrypting anything.
    await page.getByRole('link', { name: /^Contacts/ }).click();
    await expect(page.getByText('Riverside Plumbing')).toBeVisible();
    await expect(page.getByText(/••••6789/)).toBeVisible();

    // Reopening decrypts it again.
    await page.getByText('Riverside Plumbing').click();
    await page.getByRole('button', { name: /add more details/i }).click();
    await expect(page.getByLabel(/^Account number/)).toHaveValue('000123456789');
  });
});
