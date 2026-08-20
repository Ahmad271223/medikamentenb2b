import { expect, test, type Page } from '@playwright/test';

// Core journeys against seeded DEMO data (docs/architecture/N-testing-strategy.md).
const PASSWORD = 'PharmaBridge-Demo-2026';

async function login(page: Page, email: string) {
  await page.goto('/de/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL('**/de/app**');
}

test('seller: login → dashboard KPIs → inventory shows batches', async ({ page }) => {
  await login(page, 'seller@demo.pharmabridge.local');
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await expect(page.getByText('AKTIVE CHARGEN', { exact: false })).toBeVisible();

  await page.goto('/de/app/inventory');
  await expect(page.getByRole('heading', { name: 'Bestände' })).toBeVisible();
  await expect(page.getByText('DEMO-LOT-2506')).toBeVisible();
});

test('buyer: marketplace is eligibility-filtered → listing detail shows verdict and offer form', async ({ page }) => {
  await login(page, 'buyer@demo.pharmabridge.local');
  await page.goto('/de/app/marketplace');
  await expect(page.getByRole('heading', { name: 'Marktplatz' })).toBeVisible();

  const row = page.getByRole('row', { name: /Furosemide/ });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: /Details/ }).click();

  await expect(page.getByText('Bedingt zulässig').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Angebot abgeben' })).toBeVisible();
});

test('RBAC: seller is denied on compliance surfaces', async ({ page }) => {
  await login(page, 'seller@demo.pharmabridge.local');
  await page.goto('/de/app/compliance');
  await expect(page.getByText('403')).toBeVisible();
});
