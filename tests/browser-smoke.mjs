// Optional integration check: npm install --no-save --package-lock=false playwright@1.63.0
// npx playwright install chromium && npm run test:browser
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qa');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
// The deliverable must start with both network access and fetch unavailable.
await context.route(/^https?:\/\//, route => route.abort());
await context.addInitScript(() => { window.fetch = () => { throw new Error('Unexpected fetch in offline entry'); }; });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('koprulu-session-v2')));
const human = () => page.waitForFunction(() => document.querySelector('#match-status').textContent.includes('Ваш ход'));
try {
  await page.goto(pathToFileURL(path.join(root, 'Play.html')).href);
  await human();
  assert.equal((await saved()).mode, 'ai');
  assert.equal(await page.locator('#map .cell').count(), 9);
  assert.equal(await page.locator('#production [data-order]').count(), 16);
  assert.equal(await page.locator('#startup-error').isVisible(), false);
  await page.screenshot({ path: path.join(out, 'desktop-battle.png'), fullPage: true });

  await page.locator('.nav[data-view="arsenal"]').click();
  console.log('Catalog selector:', await page.locator('#type-filter').evaluate(el => ({ html: el.outerHTML, options: Array.from(el.options, o => ({ value: o.value, label: o.label })) })));
  await page.locator('#type-filter').selectOption('all');
  assert.equal(await page.locator('#catalog .game-card').count(), 48);
  await page.evaluate(() => document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await page.locator('#type-filter').selectOption('unit');
  await page.locator('#search').fill('Морпех');
  assert.equal(await page.locator('#catalog .game-card').count(), 1);
  await page.locator('#catalog [data-card="terran-marine"]').click();
  assert.equal(await page.locator('#card-dialog').isVisible(), true);
  await page.locator('.close-dialog').click();
  await page.locator('#search').fill('');
  await page.evaluate(() => document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: path.join(out, 'desktop-cards.png'), fullPage: false });

  await page.locator('.nav[data-view="battle"]').click();
  const locked = await page.evaluate(() => {
    document.querySelector('[data-order="terran-barracks"]').click();
    return [...document.querySelectorAll('[data-action],[data-order]')].every(b => b.disabled);
  });
  assert.equal(locked, true, 'Human controls must lock immediately during a computer order');
  // Human perspective and resources must remain visible throughout the bot turn.
  assert.ok((await page.locator('#battle-hud').textContent()).includes('Терраны'));
  await human();
  let snapshot = await saved();
  assert.equal(snapshot.state.active, 0);
  assert.ok(snapshot.state.entities.some(e => e.owner === 1 && e.cardId === 'zerg-pool'));
  assert.equal(snapshot.state.players[0].minerals, 2);
  assert.equal(await page.locator('[data-cell="8"] .entity').count(), 0, 'Bot turn must not expose its base through fog');

  await page.reload(); await human();
  assert.deepEqual(await saved(), snapshot, 'Reload should resume, not reset a match');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-game').click();
  const download = await downloadPromise, savePath = path.join(out, 'round-trip.json');
  await download.saveAs(savePath);
  assert.deepEqual(JSON.parse(await fs.readFile(savePath, 'utf8')), snapshot);

  await page.locator('#opponent').selectOption('hotseat');
  await page.locator('#new-match').click();
  await page.locator('[data-action="pass"]').click();
  assert.ok((await page.locator('#match-status').textContent()).includes('игрока 2'));
  assert.equal((await saved()).state.active, 1);
  await page.locator('#load-file').setInputFiles(savePath);
  await human();
  assert.deepEqual(await saved(), snapshot);
  await page.locator('#load-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('повреждён'));
  assert.deepEqual(await saved(), snapshot, 'Failed import must preserve the running match');

  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await human();
  assert.ok(page.url().endsWith('/Play.html'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  const blocked = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await blocked.route(/^https?:\/\//, route => route.abort());
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } }));
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error.message));
  await blockedPage.goto(pathToFileURL(path.join(root, 'Play.html')).href);
  await blockedPage.waitForFunction(() => document.querySelector('#economy').textContent.includes('Автосохранение недоступно'));
  assert.equal(await blockedPage.locator('#map .cell').count(), 9);
  assert.deepEqual(errors, []);
  console.log('PASS: offline file launch, 48 cards and artwork, bot handoff, fog, hotseat, reload, save import/export, invalid save recovery, index redirect, blocked storage.');
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
