const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export function planTourLayout({ target, scrollY, viewportWidth, viewportHeight, headerBottom, cardWidth, cardHeight, maxScroll, sticky = false, obstacles = [] }) {
  const margin = 16;
  const top = headerBottom + margin;
  const compact = viewportWidth < 800;
  // Reserve a separate reading area on narrow screens, rather than covering the target.
  const bottom = Math.max(top + 64, viewportHeight - margin - (compact ? cardHeight + 24 : 0));
  const available = bottom - top;
  const desiredTop = target.height <= available ? top + (available - target.height) / 2 : bottom - target.height;
  const scroll = sticky ? 0 : clamp(scrollY + target.top - desiredTop, 0, maxScroll);
  const delta = sticky ? 0 : scroll - scrollY;
  const box = { left: target.left, right: target.right, top: target.top - delta, bottom: target.bottom - delta };
  const maxX = viewportWidth - cardWidth - margin;
  const maxY = viewportHeight - cardHeight - margin;
  const xs = compact ? [clamp((viewportWidth - cardWidth) / 2, margin, maxX)] : [
    box.right + 24, box.left - cardWidth - 24, maxX, margin,
  ].map((x) => clamp(x, margin, maxX));
  const ys = compact ? [clamp(maxY, top, maxY)] : [
    (box.top + box.bottom - cardHeight) / 2, box.bottom + 24, box.top - cardHeight - 24, maxY, top,
  ].map((y) => clamp(y, top, maxY));
  let best;
  for (const x of xs) for (const y of ys) {
    const card = { left: x, right: x + cardWidth, top: y, bottom: y + cardHeight };
    let score = overlap(card, box) * 100000;
    for (const obstacle of obstacles) {
      const shift = obstacle.sticky ? 0 : scroll - scrollY;
      const rect = { ...obstacle.rect, top: obstacle.rect.top - shift, bottom: obstacle.rect.bottom - shift };
      score += overlap(card, rect) * (obstacle.control ? 5 : 1);
    }
    // Prefer a nearby card when other costs are equal; don't change the target's centered scroll.
    score += Math.hypot(x - box.right, y - box.bottom) * .01;
    if (!best || score < best.score) best = { x, y, scroll, score };
  }
  return best;
}

export function tourPointerTip(rect, viewportWidth, viewportHeight) {
  return { x: clamp(rect.right - 4, 8, viewportWidth - 8), y: clamp(rect.bottom - 4, 8, viewportHeight - 8) };
}
