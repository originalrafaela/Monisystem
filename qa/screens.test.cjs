const { test } = require('node:test');
const assert = require('node:assert/strict');
const { screen } = require('./screen-harness.cjs');
const ok = value => ({ ok: true, value });
const failure = { ok: false, error: { code: 'unavailable', message: 'Rede indisponível' } };
const preferences = () => ({ priorityCategoryIds: [], followedCategoryIds: [], followedRegionIds: [], notificationsEnabled: false });
function state(services) { return { services, demo: !services, entered: true, enter() {}, preferences: preferences(), setPreferences() {}, incidents: [], revision: 0, rememberIncidents() {}, reportPublished() {}, categories: [{ id: 'traffic', label: 'Trânsito' }, { id: 'accident', label: 'Acidente' }, { id: 'waterlogging', label: 'Alagamento' }, { id: 'flood', label: 'Enchente' }], regions: [], refreshCatalog: async () => {} }; }

test('login cancelado/falho não navega; sucesso navega', async () => {
  let entered = 0;
  const mobile = state({ auth: { signInWithGoogle: async () => failure } });
  mobile.enter = () => entered++;
  const ui = screen('index', mobile);
  await ui.press('Entrar com Google');
  assert.deepEqual(ui.routes, []); assert.equal(entered, 0);
  assert.match(ui.text(), /Rede indisponível/);
  mobile.services.auth.signInWithGoogle = async () => ok({ uid: 'qa' });
  await ui.press('Entrar com Google');
  assert.deepEqual(ui.routes, ['/ocorrencias']); assert.equal(entered, 1);
});
test('publicação incompleta não chama upload; câmera/GPS negados exibem erro recuperável', async () => {
  let uploads = 0;
  const ui = screen('publicar', state({
    capturePhoto: async () => { throw Error('Câmera negada'); },
    currentLocation: async () => { throw Error('GPS indisponível'); },
    photos: { upload: async () => { uploads++; return failure; } },
  }));
  await ui.press('Publicar'); assert.equal(uploads, 0);
  await ui.press('Abrir câmera'); assert.match(ui.text(), /Câmera negada/);
  await ui.press('Obter minha posição para conferir'); assert.match(ui.text(), /GPS indisponível/);
  assert.equal(ui.find('title', 'Abrir câmera').disabled, false);
});
async function fill(ui) {
  await ui.press('Abrir câmera'); await ui.press('Enchente');
  ui.change('Descrição da ocorrência', 'Alagamento sintético para QA');
  ui.change('Latitude da ocorrência', '-23,55'); ui.change('Longitude da ocorrência', '-46.63');
  await ui.press('Confirmar que este é o local do relato');
}
test('retry de publicação preserva upload e chave após falha de rede', async () => {
  const calls = []; let uploads = 0;
  const ui = screen('publicar', state({ capturePhoto: async () => 'file:///cache/qa.jpg', photos: {
    upload: async () => { uploads++; return ok({ uploadId: 'qa-upload' }); },
  }, reports: { create: async input => { calls.push(input); return calls.length === 1 ? failure : ok({ id: 'qa-report' }); } } }));
  await fill(ui); await ui.press('Publicar'); assert.match(ui.text(), /Rede indisponível/);
  await ui.press('Confirmar envio anterior');
  assert.equal(uploads, 1); assert.equal(calls.length, 2);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.deepEqual(calls[0].location, { latitude: -23.55, longitude: -46.63 });
  assert.match(ui.text(), /publicada com sucesso/);
});
test('upload falho nunca cria relato; coordenada inválida bloqueia publicação', async () => {
  let uploads = 0, creates = 0;
  const ui = screen('publicar', state({ capturePhoto: async () => 'file:///cache/qa.jpg', photos: { upload: async () => { uploads++; return failure; } }, reports: { create: async () => { creates++; return ok({}); } } }));
  await fill(ui); ui.change('Latitude da ocorrência', '91');
  await ui.press('Confirmar que este é o local do relato'); await ui.press('Publicar');
  assert.equal(uploads, 0);
  ui.change('Latitude da ocorrência', '-23.55'); await ui.press('Confirmar que este é o local do relato');
  await ui.press('Publicar'); assert.equal(uploads, 1); assert.equal(creates, 0);
});
test('quarta prioridade é rejeitada; falha de save não atualiza estado local', async () => {
  const saved = []; let local = 0;
  const mobile = state({ profile: { getPreferences: async () => ok(preferences()), savePreferences: async value => { saved.push(value); return failure; } } });
  mobile.setPreferences = () => local++;
  const ui = screen('preferencias', mobile);
  await ui.effects();
  // Titles occur twice; select the priority row through its second matching button.
  for (const title of ['Trânsito', 'Acidente', 'Alagamento', 'Enchente']) {
    ui.nodes().filter(n => n.props?.title === title)[1].props.onPress(); ui.render();
  }
  assert.match(ui.text(), /no máximo três/);
  await ui.press('Salvar preferências');
  assert.equal(saved[0].priorityCategoryIds.length, 3); assert.equal(local, 0);
  assert.match(ui.text(), /Rede indisponível/);
});
test('feed exige GPS e envia raio de 5000 m; erro de rede é recuperável', async () => {
  const queries = [];
  const ui = screen('ocorrencias', state({
    currentLocation: async () => ({ latitude: -23.55, longitude: -46.63 }),
    reports: { getFeed: async query => { queries.push(query); return failure; } },
  }));
  await ui.effects(); assert.equal(queries.length, 0);
  await ui.press('Obter localização atual'); await ui.effects();
  assert.equal(queries[0].radiusMeters, 5000); assert.match(ui.text(), /Rede indisponível/);
  await ui.press('Atualizar lista'); assert.equal(queries.length, 2);
});
test('feed pagina sem duplicar e reinicia cursor ao mudar categoria', async () => {
  const queries = [];
  const mobile = state({ currentLocation: async () => ({ latitude: 0, longitude: 0 }), reports: {
    getFeed: async query => {
      queries.push(query);
      if (query.categoryIds.length) return ok({ items: [{ id: 'qa-filtered' }], nextCursor: null });
      return ok(query.cursor ? { items: [{ id: 'qa-a' }, { id: 'qa-b' }], nextCursor: null } : { items: [{ id: 'qa-a' }], nextCursor: 'qa-next' });
    },
  } });
  const ui = screen('ocorrencias', mobile);
  await ui.effects(); await ui.press('Obter localização atual'); await ui.effects();
  await ui.press('Carregar mais ocorrências');
  assert.equal(queries[1].cursor, 'qa-next');
  assert.deepEqual(ui.nodes().filter(n => n.type === 'IncidentCard').map(n => n.props.incident.id), ['qa-a', 'qa-b']);
  await ui.press('Enchente'); await ui.effects();
  assert.equal(queries[2].cursor, null); assert.deepEqual(queries[2].categoryIds, ['flood']);
  assert.deepEqual(ui.nodes().filter(n => n.type === 'IncidentCard').map(n => n.props.incident.id), ['qa-filtered']);
});
test('preferências não podem ser sobrescritas quando carga inicial falha', async () => {
  const mobile = state({ profile: { getPreferences: async () => failure } });
  const ui = screen('preferencias', mobile); await ui.effects();
  assert.equal(ui.find('title', 'Salvar preferências').disabled, true);
  assert.match(ui.text(), /Rede indisponível/);
});
test('usuário sem sessão não envia publicação mesmo com formulário completo', async () => {
  let uploads = 0;
  const mobile = state({ capturePhoto: async () => 'file:///cache/qa.jpg', photos: { upload: async () => { uploads++; return failure; } } });
  mobile.entered = false;
  const ui = screen('publicar', mobile); await fill(ui); await ui.press('Publicar');
  assert.equal(uploads, 0); assert.match(ui.text(), /requer login/);
});
test('perfil carrega dados; falha no logout preserva navegação; sucesso encerra sessão', async () => {
  let exits = 0;
  const mobile = state({ profile: { getOwnProfile: async () => ok({ nickname: 'Perfil sintético QA', photo: null }) }, auth: { signOut: async () => failure } });
  mobile.leave = () => exits++;
  const ui = screen('perfil', mobile); await ui.effects();
  assert.match(ui.text(), /Perfil sintético QA/);
  await ui.press('Sair da conta'); assert.equal(exits, 0); assert.deepEqual(ui.routes, []);
  mobile.services.auth.signOut = async () => ok(undefined);
  await ui.press('Sair da conta'); assert.equal(exits, 1); assert.deepEqual(ui.routes, ['/']);
});
test('detalhes consulta relatos reais pelo id e mostra descrição', async () => {
  const calls = [];
  const mobile = state({ reports: { getIncidentReports: async (id, cursor) => { calls.push({ id, cursor }); return ok({ items: [{ id: 'qa-report', categoryId: 'flood', regionId: 'qa-region', description: 'Relato sintético nos detalhes', createdAt: 1, alertExpiresAt: 2, location: { latitude: 0, longitude: 0 }, photo: { storagePath: 'processed/qa/photo.jpg' } }], nextCursor: null }); } } });
  mobile.params = { id: 'qa-incident' };
  const ui = screen('detalhes', mobile); await ui.effects();
  assert.deepEqual(calls, [{ id: 'qa-incident', cursor: null }]);
  assert.match(ui.text(), /Relato sintético nos detalhes/);
  assert.equal(ui.nodes().filter(n => n.type === 'ReportPhoto').length, 1);
});
test('histórico preserva relatos quando indicadores falham', async () => {
  const queries = [];
  const mobile = state({ reports: { getRegionalHistory: async query => { queries.push(query); return ok({ items: [{ id: 'qa-history', description: 'Histórico sintético', categoryId: 'flood', createdAt: 1, photo: {} }], nextCursor: null }); } }, metrics: { getRegionalMetrics: async () => failure } });
  mobile.regions = [{ id: 'qa-region', name: 'Região sintética QA' }];
  const ui = screen('historico', mobile); await ui.effects();
  assert.equal(queries.length, 0);
  await ui.press('Região sintética QA'); await ui.effects();
  assert.equal(queries[0].regionId, 'qa-region');
  assert.match(ui.text(), /Histórico sintético/); assert.match(ui.text(), /Rede indisponível/);
});
