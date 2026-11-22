import { describe, expect, it } from 'vitest';
import { planTourLayout, tourPointerTip } from './tour-layout.js';

const rectangle = (top, height = 100) => ({ top, bottom: top + height, left: 100, right: 400, width: 300, height });
const settings = { scrollY: 600, viewportWidth: 1440, viewportHeight: 900, headerBottom: 80, cardWidth: 320, cardHeight: 240, maxScroll: 5000 };

describe('tour positioning', () => {
  it('centers the actual target instead of its surrounding section', () => {
    const target = rectangle(700);
    const plan = planTourLayout({ ...settings, target });
    const center = target.top + target.height / 2 - (plan.scroll - settings.scrollY);
    expect(center).toBe((96 + 884) / 2);
    expect(plan.x >= 16 && plan.x + settings.cardWidth <= settings.viewportWidth - 16).toBe(true);
  });
  it('reserves the mobile reading card below the target', () => {
    const target = rectangle(700);
    const plan = planTourLayout({ ...settings, target, viewportWidth: 390 });
    const bottom = target.bottom - (plan.scroll - settings.scrollY);
    expect(bottom + 24).toBeLessThanOrEqual(plan.y);
    expect(plan.y + settings.cardHeight).toBeLessThanOrEqual(settings.viewportHeight - 16);
  });
  it('clamps at page boundaries and leaves fixed header targets fixed', () => {
    expect(planTourLayout({ ...settings, target: rectangle(20), scrollY: 0 }).scroll).toBe(0);
    expect(planTourLayout({ ...settings, target: rectangle(5000), maxScroll: 1200 }).scroll).toBe(1200);
    expect(planTourLayout({ ...settings, target: rectangle(20, 44), sticky: true }).scroll).toBe(0);
  });
  it('keeps the bottom corner of oversized targets in the available area', () => {
    const target = rectangle(700, 600);
    const plan = planTourLayout({ ...settings, target, viewportWidth: 390 });
    expect(target.bottom - (plan.scroll - settings.scrollY)).toBeLessThan(plan.y);
  });
  it('points at the bottom-right corner and bounds the tip to the viewport', () => {
    expect(tourPointerTip(rectangle(100), 1440, 900)).toEqual({ x: 396, y: 196 });
    expect(tourPointerTip({ right: 2000, bottom: 1000 }, 390, 844)).toEqual({ x: 382, y: 836 });
  });
});
