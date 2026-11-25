import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'pitch-deck-opening');
await mkdir(output, { recursive: true });
const source = await readFile(path.join(root, 'frontend/scripts/pitch-opening.mjs'), 'utf8');
const data = async (file, mime) => `data:${mime};base64,${(await readFile(path.join(root, file))).toString('base64')}`;
const [serif, sans, surfer] = await Promise.all([
  data('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-standard-normal.woff2', 'font/woff2'),
  data('node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', 'font/woff2'),
  data('frontend/public/assets/surfy-surfing-left.png', 'image/png'),
]);
const baseStyle = new Function('serif', 'sans', `return ${source.match(/const style = (`[\s\S]*?`);/)[1]}`)(serif, sans);
const opening = new Function('surfer', 'waves', `return ${source.match(/const opening = (`[\s\S]*?`);/)[1]}`)(surfer, '<svg class="waves"></svg>');
let html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>${baseStyle}</style>${opening}</html>`;
const wave = await readFile(path.join(root, 'frontend/public/assets/Headbanner.png'));
const hero = await readFile(path.join(root, 'frontend/src/components/Hero.jsx'), 'utf8');
let sun = hero.match(/<div className="hero-sun"[\s\S]*?<\/svg>\s*<\/div>/)[0];
sun = sun.replaceAll('className=', 'class=').replaceAll('stopColor=', 'stop-color=').replaceAll('strokeWidth=', 'stroke-width=').replaceAll('strokeLinecap=', 'stroke-linecap=');
sun = sun.replace(/\{Array\.from\([\s\S]*?\)\)\}/, Array.from({ length: 12 }, (_, index) => `<path d="M60 9V18" transform="rotate(${index * 30} 60 60)"/>`).join(''));
html = html.replace(/<svg class="waves"[\s\S]*?<\/svg>/, `<img class="ui-wave" src="data:image/png;base64,${wave.toString('base64')}" alt="">`);
html = html.replace('<main class="screen opening">', `<main class="screen opening">${sun}`);
const css = `
html,body{width:540px;height:960px;background:#07142f}
.screen.opening{height:764.444444px;transform:scale(1.255813953488372);transform-origin:top left}
.opening .copy{top:95px;z-index:3}.opening h1 em{color:#d23f3c}
.opening .surfer{top:267px}
.opening .ui-wave{position:absolute;top:400px;left:0;width:430px;height:auto;z-index:2;display:block}
.opening::after{top:481.961326px;background:linear-gradient(#009bff,#087acc)}
.opening .bottom{top:495px}
.hero-sun{position:absolute;z-index:1;left:-50px;top:-20px;width:100px;height:100px;pointer-events:none}
.hero-sun svg{position:relative;width:100%;height:100%;overflow:visible}
.sun-halo{position:absolute;inset:-55%;border-radius:50%;background:radial-gradient(circle,#ffd99166 0%,#ffc16a30 30%,#ffab6214 48%,transparent 70%)}
.sun-rays{opacity:.75}.sun-core{filter:drop-shadow(0 0 18px #ffcc7b99) drop-shadow(0 0 38px #ffb56b55)}
`;
html = html.replace('</style>', `${css}</style>`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 4 });
  await page.setContent(html);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const waveColor = await page.locator('.ui-wave').evaluate(image => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return [...context.getImageData(Math.floor(canvas.width / 2), canvas.height - 1, 1, 1).data].slice(0, 3);
  });
  const fill = `.opening::after{background:linear-gradient(rgb(${waveColor.join(',')}),#087acc)}`;
  await page.addStyleTag({ content: fill });
  html = html.replace('</style>', `${fill}</style>`);
  await writeFile(path.join(output, '01-opening-phone-4k.html'), html);
  await page.screenshot({ path: path.join(output, '01-opening-phone-4k.png') });
  const png = await readFile(path.join(output, '01-opening-phone-4k.png'));
  console.log(JSON.stringify({ width: png.readUInt32BE(16), height: png.readUInt32BE(20), wave: 'Original UI Headbanner.png', sunRays: await page.locator('.sun-rays path').count(), logos: await page.locator('.brand').count() }));
} finally { await browser.close(); }
