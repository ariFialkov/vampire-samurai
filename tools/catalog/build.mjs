// Regenerates the asset catalog (catalog/data.json + catalog/img/*.webp) from the game code.
//   node tools/catalog/build.mjs
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'catalog');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/catalog/render.html`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const { assets, files } = await page.evaluate(() => window.__renderCatalog());
  fs.rmSync(path.join(out, 'img'), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'img'), { recursive: true });
  for (const [name, dataUrl] of Object.entries(files)) fs.writeFileSync(path.join(out, 'img', name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  const data = {
    game: 'Vampire Samurai', version: pkg.version, generated: new Date().toISOString().slice(0, 10),
    conventions: [
      'Units are metres; 1 unit = 1 m. +Y is up, characters face +Z, origin at the feet on the ground.',
      'Humanoids share one rig: keep the bone names and pivot positions listed for each asset so the procedural animation (walk, attacks, deaths) keeps working.',
      'Weapons: +Y runs from the grip toward the tip; the hand sits at the listed mount offset.',
      'Colours are currently vertex colours on merged primitives; a reskin can use textures (PBR metal/rough).',
      'Preferred delivery: glTF 2.0 (.glb), one file per asset, nodes named after the rig bones.',
      'Keep triangle budgets mobile-friendly: up to roughly 3x the current counts shown here.',
    ],
    assets,
  };
  fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data, null, 1));
  console.log(`catalog: ${assets.length} assets, ${Object.keys(files).length} images`);
} finally {
  await browser.close();
  await server.close();
}
