import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/verify.js';
import worker from '../worker/index.js';
async function vercel(req) {
  let data = '',
    status = 0;
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(k, v) {
      headers[k] = v;
    },
    end(v) {
      data = v || '';
      status = this.statusCode;
    },
  };
  await handler({ headers: { host: 'surfare.example' }, url: '/api/verify', ...req }, res);
  return { status, headers, data: JSON.parse(data) };
}
test('Vercel URL lookup endpoint is retired for all request types', async () => {
  const fetcher = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('must not contact providers'); };
  try {
    for (const method of ['GET', 'POST']) {
      const r = await vercel({ method, body: method === 'POST' ? { urls: ['https://example.com/'] } : undefined });
      assert.equal(r.status, 410);
      assert.equal(r.data.configured, false);
      assert.equal(r.data.status, 'unavailable');
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = fetcher; }
});

test('Cloudflare retires verification while retaining asset routing', async () => {
  const api = await worker.fetch(new Request('https://surfare.example/api/verify'), {});
  assert.equal(api.status, 410);
  assert.equal((await api.json()).configured, false);
  const asset = await worker.fetch(new Request('https://surfare.example/'), {
    ASSETS: { fetch: async () => new Response('app shell') },
  });
  assert.equal(await asset.text(), 'app shell');
  assert.equal((await worker.fetch(new Request('https://surfare.example/api/missing'), {})).status, 404);
});
