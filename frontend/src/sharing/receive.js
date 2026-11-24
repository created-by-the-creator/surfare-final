const ID = /^[a-f0-9-]{36}$/;
const ERRORS = new Set(['tooLarge', 'longText', 'manyImages', 'unsupported', 'empty', 'unavailable']);
const requests = new Map();

// URLs contain only a random receipt ID, never the shared message or image.
export function readShareLaunch(location = window.location, history = window.history) {
  const url = new URL(location.href);
  const id = url.searchParams.get('shared');
  const error = url.searchParams.get('shareError');
  if (id === null && error === null) return null;
  url.searchParams.delete('shared');
  url.searchParams.delete('shareError');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return ID.test(id || '') ? { id } : { error: ERRORS.has(error) ? error : 'unavailable' };
}

function standaloneLink(value) {
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try { const url = new URL(value); return Boolean(url.hostname); } catch { return false; }
}

export function prepareSharedInput(record) {
  const text = typeof record?.text === 'string' ? record.text.trim() : '';
  const url = typeof record?.url === 'string' ? record.url.trim() : '';
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  const content = text ? [text, url && !text.includes(url) && url].filter(Boolean).join('\n') : url || title;
  if (content.length > 12000) throw Error('longText');
  if (record?.file) {
    if (!(record.file instanceof File) || record.file.size === 0) throw Error('unsupported');
    if (record.file.size > 8 * 1024 * 1024) throw Error('tooLarge');
    return { tab: 'image', inputs: { image: record.file, message: content }, notice: 'share.imageReady' };
  }
  if (!content) throw Error('empty');
  return standaloneLink(content)
    ? { tab: 'links', inputs: { url: content }, notice: 'share.linkReady' }
    : { tab: 'text', inputs: { message: content }, notice: 'share.textReady' };
}

function takeFromWorker(id) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let settled = false;
    const timer = setTimeout(() => { settled = true; channel.port1.close(); reject(Error('unavailable')); }, 8000);
    channel.port1.onmessage = event => {
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.status === 'ready') resolve(event.data.record);
      else reject(Error('expired'));
    };
    if (!navigator.serviceWorker) { clearTimeout(timer); channel.port1.close(); reject(Error('unavailable')); return; }
    navigator.serviceWorker.ready.then(registration => {
      if (settled) return;
      registration.active.postMessage({ type: 'SURFARE_TAKE_SHARE', id }, [channel.port2]);
    }).catch(() => { clearTimeout(timer); channel.port1.close(); reject(Error('unavailable')); });
  });
}

// React's development remount must not consume the same receipt twice.
export function receiveShare(launch) {
  if (launch.error) return Promise.reject(Error(launch.error));
  if (!requests.has(launch.id)) {
    requests.set(launch.id, takeFromWorker(launch.id).then(prepareSharedInput).finally(() => requests.delete(launch.id)));
  }
  return requests.get(launch.id);
}
