import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const bytes = [...await readFile(new URL('../../backend/tests/fixtures/qr/url.png', import.meta.url))];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ version, bytes }) => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    sessionStorage.setItem('surfare-ai-opt-in', 'false');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({version, acceptedAt:new Date().toISOString()}));
    // Use a real canvas video stream so capture and decoding exercise Chrome.
    window.testCameraMode = 'working';
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.testCameraMode !== 'working') throw new DOMException('Test camera failure', window.testCameraMode);
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type:'image/png'}));
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
      const ctx = canvas.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,640,640);
      ctx.drawImage(bitmap,100,100,440,440); bitmap.close();
      return canvas.captureStream(10);
    };
  }, { version: NOTICE_VERSION, bytes });
  await page.goto('http://localhost:5173');
  const variants = await page.evaluate(async bytes => {
    const {inspectImage} = await import('/src/engine/media.js');
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const results=[];
    for (const variant of ['original','small','tight','tiny','photo','blank','workerUnavailable','workerStalled']) {
      const canvas=document.createElement('canvas');
      const size=variant==='tiny'?29:variant==='small'?74:variant==='photo'?1800:bitmap.width;
      canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,size,size);
      ctx.imageSmoothingEnabled=false;
      if(variant==='tiny')ctx.drawImage(bitmap,40,40,290,290,0,0,size,size);
      else if(variant==='photo')ctx.drawImage(bitmap,650,650,220,220);
      else if(variant==='tight')ctx.drawImage(bitmap,32,32,bitmap.width-64,bitmap.height-64,0,0,size,size);
      else if(variant!=='blank')ctx.drawImage(bitmap,0,0,size,size);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve));
      const WorkerClass=window.Worker;
      if(variant==='workerUnavailable')window.Worker=class {constructor(){throw Error('Unavailable');}};
      if(variant==='workerStalled')window.Worker=class {postMessage(){} terminate(){}};
      try {
        const result=await inspectImage(new File([blob],'qr.png',{type:'image/png'}),{includeOcr:false});
        results.push({variant, values:result.qrValues});
      } finally {window.Worker=WorkerClass;}
    }
    bitmap.close();return results;
  }, bytes);
  for (const {variant,values} of variants) assert.deepEqual(values,variant==='blank'?[]:['https://is.gd/surfare-redirect-test'],variant);
  console.log('QR uploads:',variants);
  await page.getByRole('tab', {name:'QR code',exact:true}).click();
  await page.getByRole('tab', {name:'QR code',exact:true}).getAttribute('aria-selected').then(value=>assert.equal(value,'true'));
  await page.locator('.camera-button').click();
  await page.getByRole('button',{name:'Use this QR code',exact:true}).waitFor();
  await page.getByRole('button',{name:'Use this QR code',exact:true}).click();
  await page.locator('[data-camera-modal]').waitFor({state:'detached'});
  await page.locator('.selected-file-preview').waitFor();
  await page.locator('.check-button').click();
  await page.locator('.link-destination-report').waitFor();
  console.log('QR camera capture: passed');
  // A denied camera must offer retry, and retry must acquire a fresh stream.
  await page.reload();
  await page.getByRole('tab').nth(2).click();
  await page.evaluate(()=>{window.testCameraMode='NotAllowedError';});
  await page.locator('.camera-button').click();
  await page.getByText('Camera access is blocked.',{exact:false}).waitFor();
  await page.evaluate(()=>{window.testCameraMode='working';});
  await page.getByRole('button',{name:'Try camera again',exact:true}).click();
  const capture=page.getByRole('button',{name:'Take photo',exact:true});
  await capture.click();
  await page.locator('.camera-photo').waitFor();
  await page.locator('.camera-use').click();
  await page.locator('[data-camera-modal]').waitFor({state:'detached'});
  await page.locator('[data-image-mode-modal]').waitFor();
  console.log('Image camera capture and permission retry: passed');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
