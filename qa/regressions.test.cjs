const { test } = require('node:test');
const assert = require('node:assert/strict');
const { screen } = require('./screen-harness.cjs');
const preferences = { priorityCategoryIds: [], followedCategoryIds: [], followedRegionIds: [], notificationsEnabled: false };
test('BUG-C01: preferências salvas são carregadas ao reabrir a tela', async () => {
  let loads = 0;
  const ui = screen('preferencias', { demo: false, preferences, categories: [{ id: 'flood', label: 'Enchente' }], regions: [], setPreferences() {}, services: { profile: {
    getPreferences: async () => { loads++; return { ok: true, value: { ...preferences, priorityCategoryIds: ['flood'] } }; },
  } } });
  await ui.effects();
  assert.equal(loads, 1, 'Reabrir com estado inicial deve recuperar preferências persistidas');
  assert.equal(ui.nodes().filter(n => n.props?.title === 'Enchente')[1].props.selected, true);
});
test('BUG-C02: resposta perdida bloqueia edição e confirma o mesmo payload', async () => {
  const calls = [];
  const ui = screen('publicar', { demo: false, entered: true, categories: [{ id: 'flood', label: 'Enchente' }], reportPublished() {}, services: {
    capturePhoto: async () => 'file:///cache/qa.jpg',
    photos: { upload: async () => ({ ok: true, value: { uploadId: 'qa-upload' } }) },
    reports: { create: async input => { calls.push(input); return { ok: false, error: { code: 'unavailable', message: 'Resposta perdida' } }; } },
  } });
  await ui.press('Abrir câmera'); await ui.press('Enchente');
  ui.change('Descrição da ocorrência', 'Descrição original de teste');
  ui.change('Latitude da ocorrência', '-23.55'); ui.change('Longitude da ocorrência', '-46.63');
  await ui.press('Confirmar que este é o local do relato'); await ui.press('Publicar');
  assert.equal(ui.find('accessibilityLabel', 'Descrição da ocorrência').editable, false);
  assert.equal(ui.find('title', 'Refazer fotografia').disabled, true);
  await ui.press('Confirmar envio anterior');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1], 'Mesmo envio pendente deve preservar fingerprint e chave');
});
