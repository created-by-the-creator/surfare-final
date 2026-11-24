import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { contextPayload, menuItems } from '../payload.js';
import { manifest } from '../manifest.js';
import { EXTENSION_ID } from '../identity.js';
import { imageOriginPattern, loadContextImage } from '../src/image.js';

test('Chrome context selection is complete, scoped to its window, and short-lived', () => {
  const item = contextPayload({ menuItemId: 'surfare-text', selectionText: 'Ipadala ang OTP\nngayon.' }, 7, 1000);
  assert.equal(item.text, 'Ipadala ang OTP\nngayon.');
  assert.equal(item.windowId, 7);
  assert.equal(item.expiresAt, 601000);
  assert.equal(contextPayload({ menuItemId: 'surfare-text', selectionText: 'x'.repeat(12001) }, 7).kind, 'error');
  assert.equal(contextPayload({ menuItemId: 'unknown' }, 7), null);
  assert.equal(menuItems.length, 4);
});
test('unsafe links remain inert input for detection; unsafe image sources are rejected', () => {
  assert.equal(contextPayload({ menuItemId: 'surfare-link', linkUrl: 'javascript:alert(1)' }, 1).text, 'javascript:alert(1)');
  for (const srcUrl of ['file:///private.png', 'data:image/svg+xml,<svg/>', 'https://user:password@site.test/photo.jpg']) {
    assert.equal(contextPayload({ menuItemId: 'surfare-image', srcUrl }, 1).kind, 'error');
  }
  assert.equal(imageOriginPattern('https://images.example.com/photo.png'), 'https://images.example.com/*');
});
test('image download is bounded and never carries cookies or follows a redirect', async () => {
  let options;
  await assert.rejects(loadContextImage('https://images.test/a.png', async (_url, settings) => {
    options = settings;
    return new Response('too large', { headers: { 'Content-Length': String(9 * 1024 * 1024) } });
  }));
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  await assert.rejects(loadContextImage('https://images.test/a.png', async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1))), /file_too_large/);
});
test('unpacked identity is stable and permissions do not inject scripts into websites', () => {
  const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)].map(char => String.fromCharCode(97 + parseInt(char, 16))).join('');
  assert.equal(id, EXTENSION_ID);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert(!manifest.host_permissions.includes('<all_urls>'));
  assert(manifest.permissions.includes('activeTab'));
});
test('side panel opens in the user gesture before the selected content is queued', async () => {
  const events = [];
  globalThis.chrome = {
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    contextMenus: { onClicked: { addListener() {} } },
    sidePanel: { open: () => { events.push('open'); return Promise.resolve(); } },
    storage: { session: { set: value => { events.push(Object.keys(value)[0]); return Promise.resolve(); } } },
    windows: { onRemoved: { addListener() {} } },
  };
  try {
    const { handleContextMenu } = await import('../background.js');
    handleContextMenu({ menuItemId: 'surfare-text', selectionText: 'Hello' }, { windowId: 9 });
    assert.deepEqual(events, ['open', 'pending-9']);
  } finally { delete globalThis.chrome; }
});
