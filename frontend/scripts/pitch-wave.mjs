import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'pitch-deck-opening');
await mkdir(output, { recursive: true });
// This is the exact hero wave referenced by frontend/src/assets.js.
const asset = await readFile(path.join(root, 'frontend/public/assets/Headbanner.png'));
const height = 1920 * asset.readUInt32BE(20) / asset.readUInt32BE(16);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><image x="0" y="${1080 - height}" width="1920" height="${height}" href="data:image/png;base64,${asset.toString('base64')}"/></svg>`;
await writeFile(path.join(output, '05-wave-1920x1080.svg'), svg);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:transparent}svg{display:block}</style>${svg}`);
  await page.locator('svg image').evaluate(async element => {
    const image = new Image();
    image.src = element.getAttribute('href');
    await image.decode();
  });
  await page.screenshot({ path: path.join(output, '05-wave-1920x1080.png'), omitBackground: true });
  const png = await readFile(path.join(output, '05-wave-1920x1080.png'));
  if (png.readUInt32BE(16) !== 1920 || png.readUInt32BE(20) !== 1080) throw new Error('Incorrect output dimensions.');
  console.log('Exported actual UI wave: 1920 x 1080 transparent PNG and SVG wrapper.');
} finally {
  await browser.close();
}
