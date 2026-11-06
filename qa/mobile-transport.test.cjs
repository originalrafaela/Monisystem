const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createApiReadiness, createHttpTransport, uploadProtectedPhoto, readProtectedPhoto, validateEndpoint } = require('../src/services/firebase/http.ts');
const auth = { getIdToken: async () => 'synthetic-test-token' };
const endpoint = 'http://127.0.0.1:3000/api';
const success = () => Response.json({ ok: true, value: null });
test('Node local endpoint allowed; remote plaintext, credentials and query forbidden', () => {
  validateEndpoint(endpoint);
  validateEndpoint('https://example.onrender.com/api');
  for (const url of ['http://example.com/api', 'https://user:password@example.com/api', endpoint + '?key=secret', endpoint + '#token']) assert.throws(() => validateEndpoint(url));
});
test('cold readiness retries GET only and shares in-flight startup and short ready cache', async () => {
  let clock = 0; const calls = [];
  const ready = createApiReadiness({ endpoint, now: () => clock, sleep: async ms => { clock += ms; }, budgetMs: 100, intervalMs: 10,
    fetch: async (url, options) => { calls.push({ url, method: options.method }); return new Response('', { status: calls.length === 1 ? 503 : 200 }); } });
  await Promise.all([ready(), ready()]); await ready();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === 'http://127.0.0.1:3000/healthz' && call.method === 'GET'));
});
test('cold readiness has bounded budget and recoverable message', async () => {
  let clock = 0; let requests = 0;
  const ready = createApiReadiness({ endpoint, now: () => clock, sleep: async ms => { clock += ms; }, budgetMs: 25, intervalMs: 10,
    fetch: async () => { requests++; return new Response('', { status: 503 }); } });
  await assert.rejects(ready(), /iniciando|indisponível/);
  assert.equal(clock, 25); assert.equal(requests, 3);
});
test('health success never causes automatic retry of a mutation returning 503', async () => {
  const requests = [];
  const service = createHttpTransport({ endpoint, auth, uploadFile: async () => {}, fetch: async (url, options) => {
    requests.push({ url, method: options.method });
    return new Response('', { status: options.method === 'GET' ? 200 : 503 });
  } });
  const result = await service.call('createReport', { idempotencyKey: 'synthetic-key' });
  assert.equal(result.ok, false); assert.match(result.error.message, /iniciando|indisponível/);
  assert.deepEqual(requests.map(r => r.method), ['GET', 'POST']);
});
test('logout while Render wakes prevents JSON mutation and binary upload', async () => {
  let token = 'synthetic'; let sent = 0;
  const input = { endpoint, auth: { getIdToken: async () => token }, fetch: async () => { sent++; return success(); }, readiness: async () => { token = null; } };
  const service = createHttpTransport({ ...input, uploadFile: async () => {} });
  assert.equal((await service.call('createReport')).error.code, 'unauthenticated');
  token = 'synthetic';
  assert.equal((await uploadProtectedPhoto({ ...input, stagingPath: 'staging/user/upload-1/original', bytes: new Uint8Array([1]), contentType: 'image/jpeg' })).error.code, 'unauthenticated');
  assert.equal(sent, 0);
});
test('raw upload sends only Firebase bearer and bytes to the reserved path once', async () => {
  const calls = [];
  const result = await uploadProtectedPhoto({ endpoint, auth, readiness: async () => {}, stagingPath: 'staging/user/upload-1/original', bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg',
    fetch: async (url, options) => { calls.push({ url, options }); return success(); } });
  assert.equal(result.ok, true); assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/upload');
  assert.equal(new URL(calls[0].url).searchParams.get('path'), 'staging/user/upload-1/original');
  assert.deepEqual(calls[0].options.headers, { Authorization: 'Bearer synthetic-test-token', 'Content-Type': 'image/jpeg' });
  assert.deepEqual([...new Uint8Array(calls[0].options.body)], [1, 2]);
});
test('upload validation rejects empty/oversized/type/path and missing auth before network', async () => {
  let sent = 0;
  const input = { endpoint, auth, readiness: async () => {}, stagingPath: 'staging/user/upload-1/original', bytes: new Uint8Array([1]), contentType: 'image/jpeg', fetch: async () => { sent++; return success(); } };
  for (const update of [{ bytes: new Uint8Array() }, { bytes: new Uint8Array(5 * 1024 * 1024 + 1) }, { contentType: 'text/plain' }, { stagingPath: 'processed/forged/photo.jpg' }]) assert.equal((await uploadProtectedPhoto({ ...input, ...update })).error.code, 'invalid-input');
  assert.equal((await uploadProtectedPhoto({ ...input, auth: { getIdToken: async () => null } })).error.code, 'unauthenticated');
  assert.equal(sent, 0);
});
test('upload preserves structured ownership errors and never retries lost response', async () => {
  let sent = 0;
  const input = { endpoint, auth, readiness: async () => {}, stagingPath: 'staging/user/upload-1/original', bytes: new Uint8Array([1]), contentType: 'image/jpeg' };
  const denied = await uploadProtectedPhoto({ ...input, fetch: async () => Response.json({ ok: false, error: { code: 'forbidden', message: 'Upload indisponível.' } }, { status: 403 }) });
  assert.equal(denied.error.code, 'forbidden');
  const lost = await uploadProtectedPhoto({ ...input, fetch: async () => { sent++; throw Error('lost response'); } });
  assert.equal(lost.error.code, 'unavailable'); assert.equal(sent, 1);
});
test('photo is authenticated binary; private or expired photo is not made public', async () => {
  const result = await readProtectedPhoto({ endpoint, auth, readiness: async () => {}, storagePath: 'processed/upload-1/photo.jpg', fetch: async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-token');
    return new Response('', { status: 404 });
  } });
  assert.equal(result.error.code, 'not-found');
});
