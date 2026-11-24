export const menuItems = [
  { id: 'surfare-text', title: 'Check selected text with Surfare', contexts: ['selection'] },
  { id: 'surfare-link', title: 'Check this link with Surfare', contexts: ['link'] },
  { id: 'surfare-image', title: 'Check this image with Surfare', contexts: ['image'] },
  { id: 'surfare-page', title: 'Check this page link with Surfare', contexts: ['page'] },
];
export function contextPayload(info, windowId, now = Date.now()) {
  const base = { id: crypto.randomUUID(), windowId, expiresAt: now + 10 * 60 * 1000 };
  const fail = key => ({ ...base, kind: 'error', errorKey: key });
  if (info.menuItemId === 'surfare-text') {
    const text = String(info.selectionText || '').trim();
    return !text ? fail('extension.empty') : text.length > 12000 ? fail('result.tooLong') : { ...base, kind: 'text', text };
  }
  if (['surfare-link', 'surfare-page'].includes(info.menuItemId)) {
    const text = String(info.menuItemId === 'surfare-link' ? info.linkUrl || '' : info.pageUrl || '').trim();
    return !text ? fail('extension.empty') : text.length > 2048 ? fail('result.tooLong') : { ...base, kind: 'links', text };
  }
  if (info.menuItemId === 'surfare-image') {
    try {
      const url = new URL(info.srcUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 4096) throw Error();
      return { ...base, kind: 'image', srcUrl: url.href };
    } catch { return fail('extension.imageUnavailable'); }
  }
  return null;
}
