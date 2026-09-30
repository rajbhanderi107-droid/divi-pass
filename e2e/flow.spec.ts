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
  await expect(page.getByRole('button', { name: 'Copy Manual amount' })).toBeVisible();
  await expect(page.getByText('3250', { exact: true })).toBeVisible();
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

  // unreadable digit in the phone → nothing saved as a sale; it waits in the Inbox instead of being lost
  await page.goto('/#/add');
  await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/1 in Inbox/).first()).toBeVisible();
  await page.goto('/#/sales');
  await expect(page.getByText('Ravi')).toHaveCount(0);
  await page.goto('/#/inbox');
  await expect(page.getByText('No valid phone number in the message')).toBeVisible();
});

test('merge, screenshot, gate, expenses, reports/CSV, night price, customers, audit', async ({ page }) => {
  const add = async (pass: string, paid: boolean) => {
    await page.goto('/#/add');
    await page.getByPlaceholder(/Name :/).fill(`Name : Ravi\nPass : ${pass}\nNo : 9000000002\nDate : 16 oct`);
    if (paid) await page.getByRole('button', { name: 'Paid full · UPI' }).click();
    await page.getByRole('button', { name: 'Save sale' }).click();
    await expect(page.getByText(/Saved DV-/)).toBeVisible();
  };
  await add('2 solo', false); await add('1 solo', true);

  // merge DV-0002 (keeper) with DV-0001
  await page.goto('/#/sales');
  await page.getByRole('link', { name: /DV-0002/ }).click();
  await page.getByRole('button', { name: 'Merge with…' }).click();
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again to merge' }).click();
  await expect(page.getByText('3 × Solo')).toBeVisible();
  await expect(page.getByText('₹1,950').first()).toBeVisible();

  // attach a screenshot to the payment
  await page.locator('input[type=file]').first().setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText('Payment screenshot')).toBeVisible();

  // gate: partial then all in
  await page.goto('/#/more/gate');
  await page.getByRole('button', { name: '16 Oct, Fri' }).click();
  await page.getByRole('button', { name: 'One more' }).click();
  await expect(page.getByLabel('Entered count')).toContainText('1');
  await page.getByRole('button', { name: 'All in' }).click();
  await expect(page.getByLabel('Entered count')).toContainText('3 / 3');

  // expenses
  await page.goto('/#/money');
  await page.getByRole('button', { name: '16 Oct, Fri' }).click();
  await page.getByPlaceholder('Sound, decoration…').fill('Sound');
  await page.getByLabel('₹', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Expenses · ₹500')).toBeVisible();

  // reports + CSV + summary
  await page.goto('/#/more/reports');
  await page.getByRole('button', { name: '16 Oct, Fri' }).click();
  await expect(page.getByText('₹650', { exact: true }).first()).toBeVisible();      // collected
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sales CSV' }).click()]);
  const csv = (await (await import('node:fs')).promises.readFile(await dl.path()!, 'utf8'));
  expect(csv).toContain('Ref,Sold at,Night,Name,Phone,Passes'); expect(csv).toContain('DV-0002'); expect(csv).toContain('Ravi'); expect(csv).toContain('3 Solo @650');

  // per-night price
  await page.goto('/#/more/nights');
  await page.getByRole('button', { name: 'Prices' }).nth(5).click();
  await page.getByLabel(/Solo \(normal/).fill('500');
  await page.getByLabel(/Solo \(normal/).blur();
  await page.goto('/#/add');
  await page.getByRole('button', { name: '16 Oct, Fri' }).click();
  await page.getByLabel('More Solo').click();
  await expect(page.getByText('₹500').first()).toBeVisible();
  await expect(page.getByText('this night’s price')).toBeVisible();

  // customers + audit
  await page.goto('/#/more/customers');
  await expect(page.getByText('Ravi')).toBeVisible();
  await page.goto('/#/more/audit');
  await expect(page.getByText('sale · merge')).toBeVisible();
  await page.goto('/#/more/health');
  await expect(page.getByText('All records consistent ✓')).toBeVisible();
});

test('punch queue: fields copy one by one, ticket label, done/next/undo; prices banner is dismissible', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const add = async (pass: string, phone: string) => {
    await page.goto('/#/add');
    await page.getByPlaceholder(/Name :/).fill(`Name : Punch ${phone.slice(-2)}\nPass : ${pass}\nNo : ${phone}\nDate : 16 oct`);
    await page.getByRole('button', { name: 'Save sale' }).click();
    await expect(page.getByText(/Saved DV-/)).toBeVisible();
  };
  await add('1 couple + 2 solo', '9000000011');
  await add('3 solo', '9000000012');

  await page.goto('/#/');
  await expect(page.getByText('Check your prices and nights.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Punch in Showmates · 3 to do/ })).toBeVisible();
  await page.getByRole('link', { name: /Punch in Showmates/ }).click();

  await page.getByRole('button', { name: '16 Oct, Fri' }).click();
  await expect(page.getByText('3 lines to punch')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Showmates Punch/ })).toHaveAttribute('href', 'https://seller.showmates.in/punch');
  // first line: the couple, in Punch-form order
  await expect(page.getByRole('heading', { name: 'Punch in Showmates' })).toBeVisible();
  await expect(page.locator('div.text-xl.font-bold', { hasText: 'Punch 11' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy Manual amount' }).click();
  await expect(page.getByText('Manual amount copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1300');
  await page.getByRole('button', { name: 'Copy Phone' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('9000000011');

  // ticket wording as in Showmates, for this sale
  await page.getByLabel('Ticket name in Showmates').fill('EARLY BIRD | COUPLE');
  await page.getByRole('button', { name: 'Use for this sale' }).click();
  await page.getByRole('button', { name: 'Copy Ticket' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('EARLY BIRD | COUPLE');

  await page.getByRole('button', { name: 'Done — punched' }).click();
  await expect(page.getByText('2 lines to punch')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();           // skipped goes to the back
  await expect(page.locator('div.text-xl.font-bold', { hasText: 'Punch 12' })).toBeVisible();
  await page.getByRole('button', { name: /Undo last/ }).click();
  await expect(page.getByText('3 lines to punch')).toBeVisible();

  // prices banner: dismiss
  await page.goto('/#/');
  await page.getByRole('button', { name: 'They’re right' }).click();
  await expect(page.getByText('Check your prices and nights.')).toHaveCount(0);
});


const paste = (page: import('@playwright/test').Page, text: string) =>
  page.locator('#root textarea').first().evaluate((el, t) => {
    const dt = new DataTransfer(); dt.setData('text', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);

test('fully automatic: paste adds sales with payments, flags odd ones, parks unusable ones in the Inbox', async ({ page }) => {
  await page.goto('/#/add');
  // two real messages pasted at once (Niyati unpaid, Vanshika with split payments), one with no phone
  await paste(page, 'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday\n\nName : vanshika banodia\nPass : 5 solo\nNo : +919313585913\nDate : 16th october Friday\n2600 + 650\n\nName : No Phone\nPass : 1 couple\nDate : 16 oct');
  await expect(page.getByText(/Added 2 sales · 1 in Inbox/).first()).toBeVisible();
  await expect(page.getByText(/✓ Added DV-0001 · Niyati Patel · 2 Solo · 16 Oct, Fri · ₹1,300 · unpaid/)).toBeVisible();
  await expect(page.getByText(/✓ Added DV-0002 · Vanshika Banodia · 5 Solo · 16 Oct, Fri · ₹3,250 · paid/)).toBeVisible();

  // a payment card for Niyati's ₹1,300 attaches by itself
  await paste(page, '₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997');
  await expect(page.getByText(/payment ₹1300 recorded/).first()).toBeVisible();
  // the same card again is ignored
  await paste(page, '₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997');
  await expect(page.getByText(/Nothing to add|already added/).first()).toBeVisible();

  // a message with no date is added on the next night and marked Check
  await paste(page, 'Name : Ravi\nPass : 1 couple\nNo : 9000000001');
  await expect(page.getByText(/night was assumed/).first()).toBeVisible();

  await page.goto('/#/');
  await expect(page.getByText(/1 message the app could not add/)).toBeVisible();
  await expect(page.getByText(/1 sale added automatically with something to check/)).toBeVisible();
  await page.getByRole('link', { name: /review/ }).click();
  await page.getByText('Ravi').first().click();
  await expect(page.getByText('Added automatically — please check')).toBeVisible();
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByText('Added automatically — please check')).toHaveCount(0);

  // fix the parked message from the Inbox
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Fix and add' }).click();
  await page.locator('#phone, input[placeholder="10-digit mobile"]').first().fill('9000000077');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByText(/Saved DV-/)).toBeVisible();
  await page.goto('/#/inbox');
  await expect(page.getByText('Nothing waiting for you')).toBeVisible();
});

test('turning automatic adding off makes paste open the form again', async ({ page }) => {
  await page.goto('/#/more/auto');
  await page.getByRole('button', { name: /^○ Off/ }).click();
  await page.goto('/#/add');
  await paste(page, 'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday');   // the browser's own paste is left alone
  await expect(page.getByText(/✓ Added/)).toHaveCount(0);
  await page.getByPlaceholder(/Name :/).fill('Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday');
  await expect(page.locator('input[placeholder="10-digit mobile"]')).toHaveValue('9913803737');
  await expect(page.getByText(/✓ Added/)).toHaveCount(0);
  await page.goto('/#/sales');
  await expect(page.getByText('Niyati Patel')).toHaveCount(0);
});

test('long lists draw a page at a time and load more while scrolling', async ({ page }, info) => {
  const fs = await import('node:fs'); const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const t0 = 1_790_000_000_000; const N = 400;
  const tables = {
    events: [{ id: 'ev0', date: '2026-10-16', name: 'x', createdAt: t0, updatedAt: t0 }],
    customers: Array.from({ length: N }, (_, i) => ({ id: 'c' + i, phone: '+9190000' + String(10000 + i), name: 'Buyer ' + i, nameLower: 'buyer ' + i, createdAt: t0, updatedAt: t0 })),
    sales: Array.from({ length: N }, (_, i) => ({ id: 's' + i, refNo: 'DV-' + String(i + 1).padStart(4, '0'), eventId: 'ev0', customerId: 'c' + i, lines: [{ passTypeId: 'solo', nameSnap: 'Solo', seatsPerUnitSnap: 1, listPriceSnap: 800, unitPriceSnap: 650, qty: 1 }], discount: 0, total: 650, seats: 1, channel: 'whatsapp', punchState: 'none', createdAt: t0 + i, updatedAt: t0 + i })),
    payments: [], receivers: [], passTypes: [], expenses: [],
  };
  const file = info.outputPath('big-backup.json'); fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ app: 'divi-pass', schemaVersion: 2, exportedAt: 1, checksum: hash(JSON.stringify(tables)), tables }));
  await page.goto('/#/more/backup');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Merge into this phone' }).click();
  await page.getByText('Restored').waitFor();

  await page.goto('/#/sales');
  await expect(page.locator('ul > li').first()).toBeVisible();
  const first = await page.locator('ul > li').count();
  expect(first).toBeLessThanOrEqual(60);                                   // not all 400 at once
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => page.locator('ul > li').count()).toBeGreaterThan(first);   // more arrive on scroll
  // search still finds a row that was not on the first page
  await page.getByPlaceholder(/Search name/).fill('Buyer 399');
  await expect(page.getByText('DV-0400')).toBeVisible();
  // other long screens open without error
  for (const [hash2, heading] of [['#/more/customers', 'Customers'], ['#/money', 'Money'], ['#/more/gate', 'Gate list'], ['#/more/audit', 'Change history']] as const) {
    await page.goto('/' + hash2); await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('sync: a sale added by Claude in the cloud appears on the phone, and phone sales reach the cloud', async ({ page }) => {
  // stand-in for the cloud function: last writer wins, cursor of changes (same rules as the real one)
  const rows = new Map<string, { row: any; seq: number }>(); let seq = 0; const seen: string[] = [];
  await page.route('https://sync.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
    const b = req.postDataJSON() as { key: string; since: number; push: any[] };
    const h = { 'access-control-allow-origin': '*' };
    if (b.key !== 'right-key') return route.fulfill({ status: 401, headers: h, json: { error: 'Wrong sync key' } });
    for (const r of b.push) { const k = r.t + '|' + r.id; const c = rows.get(k); if (!c || c.row.updatedAt < r.updatedAt) { rows.set(k, { row: r, seq: ++seq }); seen.push(r.t); } }
    const list = [...rows.values()].filter((x) => x.seq > b.since).sort((a, c) => a.seq - c.seq);
    await route.fulfill({ status: 200, headers: h, json: { rows: list.map((x) => x.row), cursor: list.length ? list[list.length - 1].seq : b.since, more: false } });
  });

  await page.goto('/#/more/sync');
  await page.getByPlaceholder(/supabase\.co/).fill('https://sync.test/sync');
  await page.locator('input[type=password]').fill('wrong');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Wrong sync key').first()).toBeVisible();
  await page.locator('input[type=password]').fill('right-key');
  await page.getByRole('button', { name: /Connect|Reconnect/ }).first().click();
  await expect(page.getByText('Up to date')).toBeVisible();
  expect(seen).toContain('events');                                        // the phone's nights reached the cloud

  // Claude adds a sale straight into the cloud (what the chat does), using the shared night and pass ids
  const t = Date.now() + 1000;
  const cust = { id: 'cust-cloud', phone: '+919913803737', name: 'Niyati Patel', nameLower: 'niyati patel', createdAt: t, updatedAt: t };
  const sale = { id: 'sale-cloud', refNo: 'DV-CLOUD', eventId: 'ev-2026-10-16', customerId: 'cust-cloud', lines: [{ passTypeId: 'pt-solo', nameSnap: 'Solo', seatsPerUnitSnap: 1, listPriceSnap: 800, unitPriceSnap: 650, qty: 2 }], discount: 0, total: 1300, seats: 2, channel: 'whatsapp', punchState: 'none', createdAt: t, updatedAt: t };
  rows.set('customers|cust-cloud', { row: { t: 'customers', id: 'cust-cloud', data: cust, updatedAt: t }, seq: ++seq });
  rows.set('sales|sale-cloud', { row: { t: 'sales', id: 'sale-cloud', data: sale, updatedAt: t }, seq: ++seq });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.goto('/#/sales');
  await expect(page.getByText('Niyati Patel')).toBeVisible();
  await expect(page.getByText('DV-CLOUD')).toBeVisible();

  // a sale added on the phone reaches the cloud by itself
  await page.goto('/#/add');
  await page.getByPlaceholder(/Name :/).fill('Name : Local Buyer\nPass : 1 solo\nNo : 9000000055\nDate : 16 oct');
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect.poll(() => [...rows.keys()].some((k) => k.startsWith('sales|') && k !== 'sales|sale-cloud'), { timeout: 15000 }).toBe(true);
});

test("sellers: Divya sells for Raj — Raj's book shows her sale, Dev's does not; money can go to Raj or Divya", async ({ page }) => {
  await page.goto('/#/add');
  await page.getByPlaceholder(/Name :/).fill('Name : Divyabuyer Test\nPass : 1 solo\nNo : 9000000077\nDate : 16 oct');
  await page.getByRole('group', { name: 'Sold by' }).getByRole('button', { name: 'Divya Achariya' }).click();
  await page.getByRole('button', { name: 'Paid full · UPI' }).click();
  await page.getByRole('button', { name: 'Bhanderi Raj' }).last().click();   // money direct to Raj
  await page.getByRole('button', { name: 'Save sale' }).click();
  await expect(page.getByText(/Saved DV-0001/)).toBeVisible();

  await page.goto('/#/sales');
  await expect(page.getByText('Divyabuyer Test')).toBeVisible();
  await page.getByRole('group', { name: 'Whose sales' }).getByRole('button', { name: 'Bhanderi Raj' }).click();
  await expect(page.getByText('Divyabuyer Test')).toBeVisible();
  await page.getByRole('group', { name: 'Whose sales' }).getByRole('button', { name: 'Dev Kinner Trivedi' }).click();
  await expect(page.getByText('Divyabuyer Test')).toHaveCount(0);
  await page.getByRole('group', { name: 'Whose sales' }).getByRole('button', { name: 'Divya Achariya' }).click();
  await expect(page.getByText('Divyabuyer Test')).toBeVisible();
  await page.getByRole('group', { name: 'Whose sales' }).getByRole('button', { name: 'Everyone' }).click();
});
