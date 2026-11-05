// Requires: npm --prefix backend run build
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Backend } = require('../backend/dist/backend/src/backend.js');
const { meters, feedSchema, preferencesSchema } = require('../backend/dist/backend/src/core.js');
const { time } = require('../backend/dist/backend/src/persistence.js');
const now = Date.UTC(2026, 10, 5);
const backend = new Backend({}, {}, { now: () => now });
const center = { latitude: 0, longitude: 0 };
const query = { center, radiusMeters: 5000, categoryIds: [], regionIds: [], cursor: null, limit: 30 };
const north = distance => ({ latitude: distance / 6371000 * 180 / Math.PI, longitude: 0 });
const data = distance => ({ location: north(distance), categoryId: 'flood', regionId: 'qa', alertExpiresAt: time(now + 60000), deleteAfter: time(now + 60000) });
test('feed real inclui 4999.9 m e exclui 5000.1 m', () => {
  for (const distance of [4999.9, 5000.1]) {
    assert.ok(Math.abs(meters(center, north(distance)) - distance) < 1e-8);
    assert.equal(backend.feedEligible(data(distance), query), distance <= 5000);
  }
});
test('fronteira numérica inclusiva em 5000 m e filtros de categoria/região/expiração', () => {
  // At this equatorial meridian the spherical formula evaluates exactly to 5000.
  const boundary = data(5000);
  const computed = meters(center, boundary.location);
  assert.ok(Math.abs(computed - 5000) < 1e-8);
  assert.equal(computed, 5000);
  assert.equal(backend.feedEligible(boundary, query), true);
  assert.equal(backend.feedEligible(boundary, { ...query, radiusMeters: computed - 1e-8 }), false);
  assert.equal(backend.feedEligible(data(1), { ...query, categoryIds: ['traffic'] }), false);
  assert.equal(backend.feedEligible(data(1), { ...query, regionIds: ['other'] }), false);
  assert.equal(backend.feedEligible({ ...data(1), alertExpiresAt: time(now) }, query), false);
  assert.equal(backend.feedEligible({ ...data(1), deleteAfter: time(now) }, query), false);
});
test('distância em São Paulo e antimeridiano usa unidades geográficas corretas', () => {
  assert.ok(Math.abs(meters({ latitude: -23.55, longitude: -46.63 }, { latitude: -23.54, longitude: -46.63 }) - 1111.949266) < 0.01);
  assert.ok(meters({ latitude: 0, longitude: 179.99 }, { latitude: 0, longitude: -179.99 }) < 2300);
});
test('contrato rejeita raio maior que 5 km e prioridades inválidas', () => {
  for (const radiusMeters of [0, -1, 5000.1, NaN, Infinity]) assert.equal(feedSchema.safeParse({ ...query, radiusMeters }).success, false);
  const pref = { followedRegionIds: [], followedCategoryIds: [], notificationsEnabled: false };
  for (const priorityCategoryIds of [[], ['flood'], ['flood', 'traffic'], ['flood', 'traffic', 'accident']]) assert.equal(preferencesSchema.safeParse({ ...pref, priorityCategoryIds }).success, true);
  for (const priorityCategoryIds of [['flood', 'traffic', 'accident', 'other'], ['flood', 'flood'], ['unknown']]) assert.equal(preferencesSchema.safeParse({ ...pref, priorityCategoryIds }).success, false);
});
