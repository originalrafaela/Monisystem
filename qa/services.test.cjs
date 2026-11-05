const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createHttpTransport, createFirebaseServices } = require('../src/services/firebase/index.ts');
const auth = { getIdToken: async () => null };
test('transport recusa HTTP remoto sem criptografia', () => {
  assert.throws(() => createHttpTransport({ endpoint: 'http://example.com/demo-monisystem/api', auth }));
});
test('sem sessão não faz requisição', async () => {
  let called = false;
  const service = createHttpTransport({ endpoint: 'http://127.0.0.1:5001/demo-monisystem/api', auth, fetch: async () => { called = true; } });
  assert.equal((await service.call('getFeed')).error.code, 'unauthenticated');
  assert.equal(called, false);
});
test('falha de rede vira resultado indisponível', async () => {
  const service = createHttpTransport({ endpoint: 'http://127.0.0.1:5001/demo-monisystem/api', auth: { getIdToken: async () => 'synthetic' }, fetch: async () => { throw new Error('offline'); } });
  assert.equal((await service.call('getFeed')).error.code, 'unavailable');
});
test('logout durante resolução da sessão não restaura sessão antiga', async () => {
  let observe, resolve;
  const events = [];
  const services = createFirebaseServices({ observeUser: fn => { observe = fn; return () => {}; } }, { call: () => new Promise(r => { resolve = r; }) });
  const stop = services.auth.observeSession(value => events.push(value));
  observe('qa-user'); observe(null);
  resolve({ ok: true, value: { uid: 'qa-user', publicProfileId: 'qa-profile' } });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(events, [null]); stop();
});
