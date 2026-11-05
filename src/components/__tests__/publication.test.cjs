const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (loaded, filename) => loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { PublicationAttempt, validateCoordinates } = require('../publication.ts');
const draft = { photoUri: 'file:///cache/camera.jpg', description: 'Árvore obstruindo a via.', categoryId: 'fallen-tree', location: { latitude: -23.55, longitude: -46.63 } };
const uploaded = { ok: true, value: { uploadId: 'photo-1' } };
test('timeout de criação repete entrada e chave originais sem reenviar foto', async () => {
  let uploads = 0;
  const inputDraft = { ...draft, location: { ...draft.location } };
  const inputs = [];
  const attempt = new PublicationAttempt({ upload: async () => { uploads++; return uploaded; } }, { create: async input => {
    inputs.push(input);
    return inputs.length === 1 ? { ok: false, error: { code: 'unavailable', message: 'timeout' } } : { ok: true, value: { id: 'report-1' } };
  } });
  await assert.rejects(attempt.submit(inputDraft), /timeout/);
  assert.equal(attempt.awaitingResult, true);
  inputDraft.location.latitude = -23.56;
  const report = await attempt.submit({ ...draft, description: 'Alteração posterior' });
  assert.equal(report.id, 'report-1'); assert.equal(uploads, 1);
  assert.strictEqual(inputs[0], inputs[1]); assert.equal(inputs[1].location.latitude, -23.55);
  assert.equal(attempt.awaitingResult, false);
});
test('toques simultâneos compartilham uma única publicação', async () => {
  let finish;
  let uploads = 0; let creates = 0;
  const attempt = new PublicationAttempt({ upload: () => { uploads++; return new Promise(resolve => { finish = resolve; }); } }, { create: async () => { creates++; return { ok: true, value: { id: 'report-2' } }; } });
  const first = attempt.submit(draft); const second = attempt.submit(draft);
  assert.strictEqual(first, second); finish(uploaded);
  await first; assert.equal(uploads, 1); assert.equal(creates, 1);
});
test('erro definitivo permite corrigir o formulário e descarta a reserva', async () => {
  let discards = 0;
  const attempt = new PublicationAttempt({ upload: async () => uploaded, discard: async () => { discards++; return { ok: true }; } }, { create: async () => ({ ok: false, error: { code: 'invalid-input', message: 'Região não atendida' } }) });
  await assert.rejects(attempt.submit(draft), /Região/);
  assert.equal(attempt.awaitingResult, false); assert.equal(discards, 1);
});
test('coordenadas aceitam sinal e vírgula, rejeitam vazios, limites inválidos e formatos não decimais', () => {
  assert.deepEqual(validateCoordinates('-23,55', '-46.63'), { latitude: -23.55, longitude: -46.63 });
  assert.deepEqual(validateCoordinates('0', '0'), { latitude: 0, longitude: 0 });
  for (const [lat, lon] of [['', '1'], ['91', '0'], ['0', '-181'], ['0x10', '0'], ['Infinity', '0'], ['1e1', '1'], ['1 2', '1']]) assert.equal(validateCoordinates(lat, lon), null);
});
