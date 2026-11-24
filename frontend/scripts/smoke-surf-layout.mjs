import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

await mkdir('artifacts/surf-school', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[320, 844], [390, 844], [928, 629], [844, 390], [1440, 1000]]) {
    for (const lang of ['en', 'tl', 'taglish']) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ version, lang }) => {
        localStorage.setItem('surfare-welcome-seen', 'true');
        localStorage.setItem('surfare-language', lang);
        localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
      }, { version: NOTICE_VERSION, lang });
      await page.goto(process.env.SURFARE_BASE_URL || 'http://127.0.0.1:5173');
      await page.clock.install();
      await page.locator('.practice-mission').first().click();
      await page.locator('.surf-start').click();
      await page.clock.runFor(8100);
      await page.locator('.surf-course.at-gates').waitFor();
      const course = await page.locator('.surf-course').boundingBox();
      const player = await page.locator('.surf-player').boundingBox();
      assert.ok(player.y + player.height <= course.y + course.height, 'The board must remain inside the course.');
      for (let index = 0; index < 3; index++) {
        const gate = page.locator('.surf-gates > span').nth(index);
        const box = await gate.boundingBox();
        assert.ok(box.y >= course.y && box.y + box.height < player.y, 'Gates must fit above Surfy.');
        // Inspect actual painted pixels: the opaque badge bottom must not be wave blue.
        const pixels = await page.evaluate(async bytes => {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
          return [.25, .5, .75].map(fraction => [...context.getImageData(Math.floor(canvas.width * fraction), canvas.height - 10, 1, 1).data].slice(0, 3));
        }, [...await gate.screenshot()]);
        const expected = index === 1 ? [183, 55, 57] : [23, 59, 104];
        for (const pixel of pixels) assert.ok(pixel.every((value, channel) => Math.abs(value - expected[channel]) < 4), `Gate ${index} is visually obscured: ${pixel}`);
      }
      await page.locator('.surf-run-heading').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/surf-school/layout-${width}-${height}-${lang}.png` });
      assert.equal(await page.locator('.practice-dialog').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
      await page.locator('.surf-steer-left').click();
      assert.match(await page.locator('.surf-gate-legend li').first().getAttribute('class'), /is-target/);
      await page.locator('.surf-steer-right').click();
      await page.locator('.surf-catch').click();
      await page.locator('.practice-feedback.is-right').waitFor();
      await page.locator('.practice-feedback .practice-primary').click();
      await page.locator('.surf-start').waitFor();
      await page.locator('.practice-close').click();
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}×${height} ${lang}: painted gate visibility, board bounds, layout, steering, submission and next question.`);
      await page.close();
    }
  }
} finally { await browser.close(); }
