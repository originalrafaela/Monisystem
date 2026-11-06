const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StartupFailure, startupDiagnostic, startupCheck } = require('../backend/dist/backend/src/startup.js');
const { createProductionRuntime } = require('../backend/dist/backend/src/runtime.js');
const { SupabasePhotoBucket } = require('../backend/dist/backend/src/storage.js');
const env = { MONISYSTEM_ENV: 'production', GCLOUD_PROJECT: 'monisystem-f6d63',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'monisystem-f6d63', client_email: 'fixture@example.invalid', private_key: 'sensitive-fixture' }),
  SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic_server_only_key', SUPABASE_STORAGE_BUCKET: 'photos' };
const rejectsStep = (work, step) => assert.rejects(work, error => error instanceof StartupFailure && error.step === step);
test('startup separates mode, project, emulator and missing environment without network', async () => {
  await rejectsStep(() => createProductionRuntime({}), 'ENV_MODE');
  await rejectsStep(() => createProductionRuntime({ ...env, GCLOUD_PROJECT: 'wrong' }), 'ENV_PROJECT');
  await rejectsStep(() => createProductionRuntime({ ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), 'ENV_EMULATOR');
  await rejectsStep(() => createProductionRuntime({ ...env, SUPABASE_URL: '' }), 'ENV_MISSING');
});
test('startup separates malformed JSON, fields, project and invalid Storage config', async () => {
  await rejectsStep(() => createProductionRuntime({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: 'sensitive-fixture' }), 'FIREBASE_JSON');
  await rejectsStep(() => createProductionRuntime({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }), 'FIREBASE_FIELDS');
  await rejectsStep(() => createProductionRuntime({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'wrong', client_email: 'fixture@example.invalid', private_key: 'sensitive-fixture' }) }), 'FIREBASE_PROJECT');
  await rejectsStep(() => createProductionRuntime({ ...env, SUPABASE_URL: 'http://fixture.invalid' }), 'SUPABASE_CONFIG');
});
function storage(fetch) { return new SupabasePhotoBucket({ url: 'https://fixture.supabase.co', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: 'photos', fetch }); }
test('bucket diagnostic reveals only HTTP status, never provider response body', async () => {
  for (const status of [401, 403, 404, 500]) {
    const bucket = storage(async () => new Response('sensitive-fixture', { status }));
    await assert.rejects(() => bucket.assertPrivate(), error => {
      assert.equal(startupDiagnostic(error), `API_STARTUP_FAILED step=SUPABASE_HTTP httpStatus=${status}`);
      return true;
    });
    await assert.rejects(() => bucket.file('processed/id/photo.jpg').download());
  }
});
test('bucket checks distinguish network, malformed response, public bucket and wrong id', async () => {
  await rejectsStep(() => storage(async () => { throw Error('sensitive-fixture'); }).assertPrivate(), 'SUPABASE_CONNECT');
  await rejectsStep(() => storage(async () => new Response('invalid')).assertPrivate(), 'SUPABASE_BUCKET_RESPONSE');
  await rejectsStep(() => storage(async () => Response.json({ id: 'photos', public: true })).assertPrivate(), 'SUPABASE_BUCKET_PRIVATE');
  await rejectsStep(() => storage(async () => Response.json({ id: 'wrong', public: false })).assertPrivate(), 'SUPABASE_BUCKET_ID');
  await storage(async () => Response.json({ id: 'photos', public: false })).assertPrivate();
});
test('startup formatting discards arbitrary exception text and invalid status values', () => {
  assert.equal(startupDiagnostic(Error('sensitive-fixture')), 'API_STARTUP_FAILED step=STARTUP_UNKNOWN');
  assert.equal(startupDiagnostic(new StartupFailure('FIREBASE_INIT', NaN)), 'API_STARTUP_FAILED step=FIREBASE_INIT');
  assert.throws(() => startupCheck('FIREBASE_INIT', () => { throw Error('sensitive-fixture'); }), error => {
    assert.equal(startupDiagnostic(error), 'API_STARTUP_FAILED step=FIREBASE_INIT');
    assert.equal(error.message.includes('sensitive-fixture'), false); return true;
  });
});
