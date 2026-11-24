import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { MISSIONS } from '../src/training/content.js';
import { BOARD_KEY, PROGRESS_KEY } from '../src/training/engine.js';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const base = process.env.SURFARE_BASE_URL || 'http://127.0.0.1:5173';
const output = new URL('../../artifacts/surf-school/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const width of [320, 390, 768, 1440]) for (const lang of ['en', 'tl', 'taglish']) {
    console.log(`Checking surf course: ${width}px / ${lang}`);
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, hasTouch: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ lang, version }) => {
      localStorage.setItem('surfare-welcome-seen', 'true');
      localStorage.setItem('surfare-language', lang);
      localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    }, { lang, version: NOTICE_VERSION });
    await page.goto(base);
    await page.locator('#practice').scrollIntoViewIfNeeded();
    await page.clock.install();
    const activate = async locator => width < 600 ? locator.tap() : locator.click();
    const noOverflow = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}/${lang}: page overflow`);
      assert.equal(await page.locator('dialog[open]').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth + 1), false, `${width}/${lang}: dialog overflow`);
    };
    const steerTo = async choice => {
      const current = await page.locator('.surf-gate-legend li').evaluateAll(items => items.findIndex(item => item.classList.contains('is-target')));
      for (let lane = current; lane !== choice; lane += choice > lane ? 1 : -1) await activate(page.locator(choice > lane ? '.surf-steer-right' : '.surf-steer-left'));
    };
    const finishRoute = async (mission, mistake = false) => {
      for (const [index, step] of mission.steps.entries()) {
        await activate(page.locator('.surf-start'));
        if (index === 0) {
          await page.clock.runFor(1000);
          await activate(page.locator('.surf-pause'));
          const before = await page.locator('.surf-distance').getAttribute('value');
          await page.clock.runFor(2000);
          assert.equal(await page.locator('.surf-distance').getAttribute('value'), before);
          await activate(page.locator('.surf-pause-overlay button'));
        }
        if (width === 390 && lang === 'en' && index === 0 && mission.id === 'wallet') {
          await page.clock.runFor(1200);
          assert.match(await page.locator('.surf-run-heading').innerText(), /1 shells/);
          await page.locator('.surf-course').scrollIntoViewIfNeeded();
          const bounds = await page.locator('.surf-course').boundingBox();
          const client = await context.newCDPSession(page);
          const y = Math.min(bounds.y + 100, 700);
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert.equal(await page.locator('.surf-gate-legend li').first().getAttribute('class'), 'is-target ');
          await page.clock.runFor(1500);
          assert.match(await page.locator('.surf-run-heading').innerText(), /2 shells/);
          await page.screenshot({ path: fileURLToPath(new URL('mobile-course.png', output)) });
          await client.detach();
        }
        await page.clock.runFor(8000);
        await page.locator('.surf-course.at-gates').waitFor();
        if (mistake && index === 0) {
          await steerTo((step.correct + 1) % 3);
          await activate(page.locator('.surf-catch'));
          await page.locator('.practice-feedback:not(.is-right)').waitFor();
          await activate(page.locator('.practice-feedback .practice-primary'));
          assert.equal(await page.locator('.surf-catch').isDisabled(), true);
        }
        await steerTo(step.correct);
        await activate(page.locator('.surf-catch'));
        await page.locator('.practice-feedback.is-right').waitFor();
        assert.equal(await page.locator('.surf-catch').count(), 0);
        await noOverflow();
        if (width === 390 && lang === 'en' && index === 0) {
          await page.locator('.surf-course').scrollIntoViewIfNeeded();
          await page.screenshot({ path: fileURLToPath(new URL('mobile-answer.png', output)) });
        }
        await activate(page.locator('.practice-feedback .practice-primary'));
      }
      await page.locator('.practice-result').waitFor();
      assert.equal(await page.locator('.practice-result-score').innerText().then(text => text.startsWith(mistake ? '47' : '50')), true);
    };
    await activate(page.locator('.practice-mission').first());
    await noOverflow();
    const targets = await page.locator('.surf-start').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    assert.ok(targets.every(height => height >= 48));
    await activate(page.locator('.practice-inspect-sender'));
    assert.equal(await page.locator('.practice-inspection').isVisible(), true);
    await finishRoute(MISSIONS[0], lang === 'tl');
    await noOverflow();
    if (width === 390 && lang === 'en') {
      await page.locator('.practice-dialog').evaluate(dialog => dialog.scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL('mobile-result.png', output)) });
      // Complete all routes by moving directly between them.
      for (const mission of MISSIONS.slice(1)) {
        await activate(page.locator('.practice-result .practice-primary'));
        await finishRoute(mission);
      }
      await activate(page.locator('.practice-close'));
      assert.equal(await page.locator('.surf-board-choice:enabled').count(), 4);
      await activate(page.locator('.surf-board-choice').nth(3));
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), BOARD_KEY), 3);
      await page.reload();
      assert.equal(await page.locator('.surf-board-choice').nth(3).getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('.surf-profile').innerText(), /360 XP/);
      await activate(page.locator('.practice-mission').first());
      assert.equal(await page.locator('.surf-run.surf-board-3').count(), 1);
      await finishRoute(MISSIONS[0]);
      assert.match(await page.locator('.surf-reward').innerText(), /\+0 XP/);
      await activate(page.locator('.practice-close'));
      await page.locator('.surf-boards').scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL('mobile-rewards.png', output)) });
      await activate(page.locator('.practice-footer button'));
      assert.equal(await page.locator('.surf-board-choice:enabled').count(), 1);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).best, PROGRESS_KEY), {});
    } else {
      await activate(page.locator('.practice-close'));
    }
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(errors, []);
    // Keyboard exit and focus return remain available on desktop.
    if (width === 1440) {
      await page.locator('.practice-mission').first().focus();
      await page.keyboard.press('Enter');
      await page.locator('dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('dialog[open]').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.practice-mission').first().evaluate(button => document.activeElement === button), true);
    }
    reports.push({ width, lang, touch: width < 600, result: 'passed' });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
