import { expect, test } from '@playwright/test';

const M3 = 'Name : vanshika banodia\nPass : 5 solo\nNo : +919313585913\nDate : 16th october Friday\n2600 + 650';

test('paste → save, split payments, punch, backup round trip', async ({ page }) => {
  await page.goto('/#/add');
  await page.getByPlaceholder(/Name :/).fill(M3);
  await expect(page.getByText('₹3,250').first()).toBeVisible();
  await expect(page.locator('input[placeholder="10-digit mobile"]')).toHaveValue('9313585913');
  await page.getByLabel('UTR').first().fill('627223546951');
  await page.getByLabel('UTR').nth(1).fill('627326018483');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByText(/Saved DV-0001/)).toBeVisible();

  await page.goto('/#/sales');
  await page.getByText('Vanshika Banodia').click();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Manual amount: 3250')).toBeVisible();
  await page.getByRole('button', { name: 'Mark punched' }).click();
  await expect(page.getByText('Copy for Showmates')).toHaveCount(0);

  // duplicate UTR blocked
  await page.goto('/#/add');
  await page.getByPlaceholder(/Name :/).fill('Name : Test\nPass : 1 solo\nNo : 9426672046\nDate : 16 oct');
  await page.getByRole('button', { name: 'Paid full · UPI' }).click();
  await page.getByLabel('UTR').first().fill('627223546951');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByRole('alert')).toContainText('already recorded');

  // same paste again → already added
  await page.goto('/#/add');
  await page.getByPlaceholder(/Name :/).fill(M3);
  await page.getByLabel('UTR').first().fill('627111111111');
  await page.getByLabel('UTR').nth(1).fill('627222222222');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByText(/already added as DV-0001/)).toBeVisible();

  // backup download + health
  await page.goto('/#/more/backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Back up now/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^divi-pass-backup-\d{8}-\d{4}\.json$/);
  await page.goto('/#/more/health');
  await expect(page.getByText('All records consistent ✓')).toBeVisible();
});

test('custom price per sale and make default', async ({ page }) => {
  await page.goto('/#/add');
  await page.getByLabel('More Solo').click();
  await page.getByLabel('More Solo').click();
  await expect(page.getByText('₹1,300').first()).toBeVisible();
  await page.getByLabel('Solo price each').fill('500');
  await expect(page.getByText('₹1,000').first()).toBeVisible();
  await page.locator('input[placeholder="10-digit mobile"]').fill('9000000001');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByText(/Saved DV-\d+ · ₹1,000/)).toBeVisible();

  await page.getByLabel('More Solo').click();
  await page.getByLabel('Solo price each').fill('700');
  await page.getByRole('button', { name: 'Make default' }).click();
  await expect(page.getByText(/Solo default is now ₹700/)).toBeVisible();
  await expect(page.getByLabel('Solo price each')).toHaveAttribute('placeholder', '700');
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('add from photo: reader text fills sale + payment', async ({ page }) => {
  let sawToken = '';
  await page.route('https://reader.test/**', async (route) => {
    const req = route.request();
    sawToken = req.headers()['x-app-token'] ?? '';
    const body = req.postDataJSON() as { image: string; mediaType: string };
    if (body.mediaType === 'text/plain') return route.fulfill({ status: 400, json: { error: 'bad' }, headers: { 'access-control-allow-origin': '*' } });
    expect(body.mediaType).toBe('image/jpeg'); expect(body.image.length).toBeGreaterThan(10);
    await route.fulfill({
      status: 200, headers: { 'access-control-allow-origin': '*' },
      json: { text: 'Name : niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday\n\n₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997' },
    });
  });

  // not set up yet → helpful message
  await page.goto('/#/add');
  await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Photo reading is not set up yet')).toBeVisible();

  await page.goto('/#/more/photo');
  await page.getByPlaceholder(/workers\.dev/).fill('https://reader.test/read');
  await page.locator('input[type=password]').fill('secret-code');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Connected ✓/)).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.goto('/#/add');
  await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  // clear photo → saved directly, no review step
  await expect(page.getByText(/✓ Added DV-0001 · Niyati Patel · 2 Solo · 16 Oct, Fri · ₹1,300 · paid/)).toBeVisible();
  expect(sawToken).toBe('secret-code');
  await expect(page.locator('input[placeholder="10-digit mobile"]')).toHaveValue('');
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText('UTR 627325985997')).toBeVisible();
  await expect(page.getByText(/· to Bhanderi Raj/)).toBeVisible();
});

test('photo saves directly: the WhatsApp message with a payment thumbnail; unclear photos open the form instead', async ({ page }) => {
  const texts = [
    'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday\n₹1,300',
    'Name : Ravi\nPass : 2 solo\nNo : 99138?3737\nDate : 16th october Friday',
  ];
  let n = 0;
  await page.route('https://reader.test/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { text: texts[n++] } }));
  await page.goto('/#/more/photo');
  await page.getByPlaceholder(/workers\.dev/).fill('https://reader.test/read');
  await page.locator('input[type=password]').fill('c');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.goto('/#/add');
  await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/✓ Added DV-0001 · Niyati Patel · 2 Solo · 16 Oct, Fri · ₹1,300 · paid/)).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  // unreadable digit in the phone → nothing saved, form is filled for review
  await page.goto('/#/add');
  await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/Phone 99138\?3737|not a valid mobile/)).toBeVisible();
  await expect(page.getByText(/✓ Added/)).toHaveCount(0);
  await page.goto('/#/sales');
  await expect(page.getByText('Ravi')).toHaveCount(0);
});
