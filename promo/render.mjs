// Renders divi-garba.html to PNG frames with headless Chromium.
// Usage: node render.mjs <outDir> [fps] [times...]   (times = only those stills)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir = 'frames', fpsArg = '30', ...stills] = process.argv.slice(2);
const fps = Number(fpsArg);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(pathToFileURL(path.join(here, 'divi-garba.html')).href + '?render');
await page.evaluate(() => window.ready);
const canvas = page.locator('#c');

const times = stills.length ? stills.map(Number) : null;
const total = times ? times.length : Math.round(await page.evaluate(() => window.DURATION) * fps);
for (let i = 0; i < total; i++) {
  const t = times ? times[i] : i / fps;
  await page.evaluate(t => window.renderFrame(t), t);
  const name = times ? `still_${t}.png` : `f_${String(i).padStart(5, '0')}.png`;
  await canvas.screenshot({ path: path.join(outDir, name) });
  if (!times && i % 60 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();
