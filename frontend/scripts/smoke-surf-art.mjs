import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';
import { MISSIONS } from '../src/training/content.js';

await mkdir('artifacts/surf-school', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 600 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Unlock boards in this isolated browser only; production saves are untouched.
    await page.addInitScript(({ version, best }) => {
      localStorage.setItem('surfare-welcome-seen', 'true');
      localStorage.setItem('surfare-language', 'en');
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
      localStorage.setItem('surfare-practice-v1', JSON.stringify({ version: 1, best }));
    }, { version: NOTICE_VERSION, best: Object.fromEntries(MISSIONS.map(mission => [mission.id, 50])) });
    await page.goto(process.env.SURFARE_BASE_URL || 'http://127.0.0.1:5173');
    await page.clock.install();
    const pictures = [], gallery = [];
    for (let board = 0; board < 4; board++) {
      await page.locator('.surf-board-choice').nth(board).click();
      const rack = await page.locator('.surf-board-choice').nth(board).locator('[data-board-design]').getAttribute('data-board-design');
      await page.locator('.practice-mission').first().click();
      assert.equal(await page.locator('.surf-launch [data-equipped-board]').getAttribute('data-equipped-board'), String(board));
      await page.locator('.surf-start').click();
      await page.clock.runFor(500);
      assert.equal(await page.locator('.surf-player [data-board-design]').getAttribute('data-board-design'), rack);
      assert.equal(await page.locator('.surf-hero-wave').getAttribute('src'), await page.locator('.hero .wave-stage img').getAttribute('src'));
      await page.locator('.surf-pause').click();
      // Remove the pause cover only for screenshots of the paused artwork.
      await page.locator('.surf-pause-overlay').evaluate(element => { element.style.display = 'none'; });
      pictures.push(createHash('sha256').update(await page.locator('.surf-player').screenshot()).digest('hex'));
      gallery.push(await page.locator('.surf-player > svg').evaluate(element => element.outerHTML));
      await page.locator('.surf-course').screenshot({ path: `artifacts/surf-school/board-${board}-${width}.png` });
      assert.equal(await page.locator('.practice-dialog').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
      await page.locator('.practice-close').click();
    }
    assert.equal(new Set(pictures).size, 4, 'The actual rider must visibly change boards.');
    await page.reload();
    assert.equal(await page.locator('.surf-board-choice').nth(3).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    if (width === 1440) {
      await page.evaluate(artwork => {
        const gallery = document.createElement('div');
        gallery.id = 'board-proof';
        Object.assign(gallery.style, { position: 'fixed', inset: '0', zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf3e8', gap: '20px' });
        gallery.innerHTML = artwork.map(svg => `<div style="width:300px">${svg}</div>`).join('');
        document.body.appendChild(gallery);
      }, gallery);
      await page.screenshot({ path: 'artifacts/surf-school/board-alignment.png' });
    }
    console.log(`PASS ${width}px: hero wave, four different live boards, matching rack, persisted selection, no overflow.`);
    await context.close();
  }
} finally { await browser.close(); }
