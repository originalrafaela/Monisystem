import { readFirebaseClientConfiguration } from '../../src/services/firebase/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinatesSchema, createReportSchema, preferencesSchema, meters, regionContains, result, ServiceError, assertLocalEnvironment } from '../src/core';
import { createFirebaseServices, createHttpTransport, validateEndpoint, type AuthDriver, type FirebaseTransport } from '../../src/services/firebase';
import { createNativeAuthDriver, validateCaptureUri } from '../../src/services/firebase/native-driver';

test('reject invalid coordinates and missing report photo/category/description', () => {
  for (const p of [{ latitude: NaN, longitude: 1 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }]) assert.equal(coordinatesSchema.safeParse(p).success, false);
  const input = { idempotencyKey: 'operation-1', description: 'Alagamento', categoryId: 'flood', photoUploadId: 'photo-1', location: { latitude: 0, longitude: 0 } };
  assert.equal(createReportSchema.safeParse(input).success, true);
  for (const change of [{ description: ' ' }, { categoryId: 'invalid' }, { photoUploadId: '../secret' }, { description: 'a'.repeat(2001) }]) assert.equal(createReportSchema.safeParse({ ...input, ...change }).success, false);
});
test('priorities have at most three unique supported categories', () => {
  const pref = { followedRegionIds: [], followedCategoryIds: [], notificationsEnabled: false, priorityCategoryIds: ['flood', 'traffic', 'other'] };
  assert.equal(preferencesSchema.safeParse(pref).success, true);
  for (const categories of [['flood', 'flood'], ['flood', 'traffic', 'other', 'accident'], ['invalid']]) assert.equal(preferencesSchema.safeParse({ ...pref, priorityCategoryIds: categories }).success, false);
});
test('distance is meters, accounts for longitude and antimeridian', () => {
  assert.equal(meters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(meters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111195) < 100);
  assert.ok(meters({ latitude: 0, longitude: 179.99 }, { latitude: 0, longitude: -179.99 }) < 2300);
});
test('region polygon excludes holes', () => {
  const ring = (n: number) => [{ latitude: -n, longitude: -n }, { latitude: -n, longitude: n }, { latitude: n, longitude: n }, { latitude: n, longitude: -n }, { latitude: -n, longitude: -n }];
  const region = { id: 'r', name: 'Region', boundary: [ring(2), ring(1)] };
  assert.equal(regionContains(region, { latitude: 1.5, longitude: 0 }), true);
  assert.equal(regionContains(region, { latitude: 0, longitude: 0 }), false);
});
test('native auth exchanges Google token and restores SDK session observer', async () => {
  const calls: string[] = [];
  const driver = createNativeAuthDriver({ googleSignIn: async () => 'google-token', firebaseSignIn: async token => { calls.push(token); }, firebaseSignOut: async () => { calls.push('logout'); }, googleSignOut: async () => { throw Error('offline'); }, idToken: async () => 'firebase-token', observe: listener => { listener('uid'); return () => calls.push('unsubscribe'); } });
  await driver.signInWithGoogle(); assert.deepEqual(calls, ['google-token']);
  assert.equal(await driver.getIdToken(), 'firebase-token');
  const stop = driver.observeUser(uid => assert.equal(uid, 'uid')); stop();
  await driver.signOut(); assert.deepEqual(calls, ['google-token', 'unsubscribe', 'logout']);
});
test('session observer ignores late response after signout', async () => {
  let observe: (uid: string | null) => void = () => {};
  let resolve: () => void = () => {};
  const auth: AuthDriver = { signInWithGoogle: async () => {}, signOut: async () => {}, getIdToken: async () => null, observeUser(listener) { observe = listener; return () => {}; } };
  const transport = { call: () => new Promise<unknown>(r => { resolve = () => r({ ok: true, value: { uid: 'uid', publicProfileId: 'public' } }); }), upload: async () => ({ ok: true, value: undefined }) } as unknown as FirebaseTransport;
  const sessions: unknown[] = [];
  const stop = createFirebaseServices(auth, transport).auth.observeSession(s => sessions.push(s));
  observe('uid'); observe(null); resolve();
  await Promise.resolve(); assert.deepEqual(sessions, [null]); stop();
});
test('upload failure discards reservation and never completes publication', async () => {
  const calls: string[] = [];
  const transport: FirebaseTransport = { async call<T>(operation: string) { calls.push(operation); return { ok: true, value: { uploadId: 'id', stagingPath: 'staging/uid/id/original' } as T }; }, async upload() { return { ok: false, error: { code: 'unavailable', message: 'offline' } }; } };
  const auth = {} as AuthDriver;
  const result = await createFirebaseServices(auth, transport).photos.upload({ localUri: 'file:///cache/photo.jpg', purpose: 'report' });
  assert.equal(result.ok, false); assert.deepEqual(calls, ['reservePhoto', 'discardPhoto']);
});
test('capture URI cannot escape app cache or load remote files', () => {
  validateCaptureUri('file:///data/cache/camera/photo.jpg', 'file:///data/cache');
  for (const uri of ['https://example.com/photo.jpg', 'file:///data/private/key', 'file:///data/cache/../secret', 'file:///data/cache/%2e%2e/secret', 'file:///data/cache/file?token=1']) assert.throws(() => validateCaptureUri(uri, 'file:///data/cache'));
});
test('production transport requires HTTPS and maps missing auth', async () => {
  assert.throws(() => validateEndpoint('http://example.com/api'));
  assert.throws(() => validateEndpoint('https://user:secret@example.com/api'));
  validateEndpoint('https://example.com/api');
  const auth = { getIdToken: async () => null } as AuthDriver;
  const transport = createHttpTransport({ endpoint: 'https://example.com/api', auth, uploadFile: async () => {} });
  assert.deepEqual(await transport.call('getFeed'), { ok: false, error: { code: 'unauthenticated', message: 'Sessão obrigatória.' } });
});
test('structured errors conceal internal details; emulator guards reject real projects', async () => {
  assert.deepEqual(await result(async () => { throw Error('sensitive-data'); }), { ok: false, error: { code: 'unavailable', message: 'Serviço temporariamente indisponível.' } });
  assert.deepEqual(await result(async () => { throw new ServiceError('forbidden', 'Denied'); }), { ok: false, error: { code: 'forbidden', message: 'Denied' } });
  assert.throws(() => assertLocalEnvironment({ GCLOUD_PROJECT: 'real-project' }));
});

test('environment configuration refuses mixed emulator/remote setup and missing identifiers', () => {
  assert.throws(() => readFirebaseClientConfiguration({}));
  const remote = { EXPO_PUBLIC_FIREBASE_ENV: 'development', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'verified-test-project', EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'test.apps.googleusercontent.com', EXPO_PUBLIC_FIREBASE_API_URL: 'https://example.com/api' };
  assert.equal(readFirebaseClientConfiguration(remote).environment, 'development');
  assert.throws(() => readFirebaseClientConfiguration({ ...remote, EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '10.0.2.2' }));
  assert.throws(() => readFirebaseClientConfiguration({ ...remote, EXPO_PUBLIC_FIREBASE_API_URL: 'http://example.com/api' }));
  assert.throws(() => readFirebaseClientConfiguration({ ...remote, EXPO_PUBLIC_FIREBASE_ENV: 'emulator' }));
});

test('cancelled Google login never creates Firebase credentials', async () => {
  let exchanged = false;
  const driver = createNativeAuthDriver({ googleSignIn: async () => null,
    firebaseSignIn: async () => { exchanged = true; }, firebaseSignOut: async () => {},
    googleSignOut: async () => {}, idToken: async () => null, observe: () => () => {},
  });
  await assert.rejects(() => driver.signInWithGoogle());
  assert.equal(exchanged, false);
});

test('photo finalization failure schedules compensation and returns structured failure', async () => {
  const calls: string[] = [];
  const transport: FirebaseTransport = {
    async call<T>(operation: string) {
      calls.push(operation);
      if (operation === 'completePhoto') return { ok: false, error: { code: 'invalid-input', message: 'Imagem inválida.' } };
      return { ok: true, value: { uploadId: 'id', stagingPath: 'staging/uid/id/original' } as T };
    },
    async upload() { return { ok: true, value: undefined }; },
  };
  const service = createFirebaseServices({} as AuthDriver, transport);
  const response = await service.photos.upload({ purpose: 'report', localUri: 'file:///cache/photo.jpg' });
  assert.equal(response.ok, false);
  assert.deepEqual(calls, ['reservePhoto', 'completePhoto', 'discardPhoto']);
});
