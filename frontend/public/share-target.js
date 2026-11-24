/* Runs inside the generated service worker. Shared content never goes to a server. */
(() => {
  const DATABASE = 'surfare-shares-v1';
  const STORE = 'incoming';
  const MAX_FILE = 8 * 1024 * 1024;
  const MAX_BODY = MAX_FILE + 64 * 1024;
  const EXPIRES_AFTER = 10 * 60 * 1000;
  const ID = /^[a-f0-9-]{36}$/;
  const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('unavailable'));
    });
  }

  async function withStore(action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      let result;
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = transaction.onerror = () => { database.close(); reject(Error('unavailable')); };
      action(transaction.objectStore(STORE), value => { result = value; });
    });
  }

  function saveShare(record) {
    return withStore(store => {
      const waiting = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (entry) {
          if (Date.now() - entry.value.createdAt >= EXPIRES_AFTER) entry.delete();
          else waiting.push({ id: entry.key, createdAt: entry.value.createdAt });
          entry.continue();
          return;
        }
        // Keep at most three pending shares, including this one.
        waiting.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, waiting.length - 2))
          .forEach(item => store.delete(item.id));
        store.put(record);
      };
    });
  }

  function takeShare(id) {
    return withStore((store, setResult) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const record = request.result;
        store.delete(id);
        setResult(record && Date.now() - record.createdAt < EXPIRES_AFTER ? record : null);
      };
    });
  }

  async function readForm(request) {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) throw Error('tooLarge');
    const reader = request.body?.getReader();
    if (!reader) throw Error('empty');
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY) throw Error('tooLarge');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    if (length === 0) throw Error('empty');
    const body = new Blob(chunks);
    const contentType = request.headers.get('content-type') || '';
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    // Some browser form parsers reject the closing-boundary-only empty form.
    if (length < 512 && boundary && (await body.text()).trim() === `--${boundary[1] || boundary[2]}--`) throw Error('empty');
    try {
      return await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
    } catch { throw Error('unsupported'); }
  }

  async function receive(request) {
    const form = await readForm(request);
    const fields = {};
    for (const key of ['title', 'text', 'url']) {
      const value = form.get(key);
      if (value !== null && typeof value !== 'string') throw Error('unsupported');
      fields[key] = (value || '').trim();
    }
    if (Object.values(fields).join('\n').length > 12000) throw Error('longText');
    const files = [...form.values()].filter(value => typeof value !== 'string' && value.size > 0);
    if (files.length > 1) throw Error('manyImages');
    let file = files[0] || null;
    if (file) {
      if (file.size > MAX_FILE) throw Error('tooLarge');
      const type = Object.values(TYPES).includes(file.type) ? file.type : TYPES[file.name.split('.').pop().toLowerCase()];
      if (!type) throw Error('unsupported');
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const isJpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
      const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
      const text = new TextDecoder().decode(header);
      const isWebp = text.startsWith('RIFF') && text.slice(8) === 'WEBP';
      if (!isJpeg && !isPng && !isWebp) throw Error('unsupported');
      // Preserve original bytes and metadata; some sharing apps omit the MIME type.
      file = new File([file], file.name, { type: isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp', lastModified: file.lastModified });
    }
    if (!file && !Object.values(fields).some(Boolean)) throw Error('empty');
    const id = crypto.randomUUID();
    await saveShare({ id, ...fields, file, createdAt: Date.now() });
    return Response.redirect(new URL(`/?shared=${id}`, self.location.origin).href, 303);
  }

  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname !== '/share-target/' || event.request.method !== 'POST') return;
    event.respondWith(receive(event.request).catch(error => {
      const reason = ['tooLarge', 'longText', 'manyImages', 'unsupported', 'empty'].includes(error.message) ? error.message : 'unavailable';
      return Response.redirect(new URL(`/?shareError=${reason}`, self.location.origin).href, 303);
    }));
  });

  self.addEventListener('message', event => {
    if (event.data?.type !== 'SURFARE_TAKE_SHARE' || !ID.test(event.data.id) || !event.ports?.[0]) return;
    try { if (new URL(event.source.url).origin !== self.location.origin) return; } catch { return; }
    const port = event.ports[0];
    event.waitUntil(takeShare(event.data.id)
      .then(record => port.postMessage(record ? { status: 'ready', record } : { status: 'unavailable' }))
      .catch(() => port.postMessage({ status: 'unavailable' }))
      .finally(() => port.close()));
  });
})();
