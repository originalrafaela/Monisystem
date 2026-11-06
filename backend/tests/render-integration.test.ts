import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createApiServer } from '../src/http';
import { SupabasePhotoBucket } from '../src/storage';
import { privateStorageFixture } from './private-storage-fixture';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import sharp from 'sharp';
import { Backend } from '../src/backend';
import { DAY, RETENTION } from '../src/core';

const projectId = 'demo-monisystem';
process.env.GCLOUD_PROJECT = projectId;
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] ?? '', /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, 'integration');
const db = getFirestore(app);
const fixture = privateStorageFixture();
let bucket: SupabasePhotoBucket;
let api: ReturnType<typeof createApiServer>;
let endpoint: string;
let now = Date.UTC(2026, 0, 1, 12);
let backend: Backend;
let rules: RulesTestEnvironment;
let jpeg: Buffer;
const center = { latitude: -23.55, longitude: -46.63 };
const preferences = { followedRegionIds: ['test-region'], followedCategoryIds: ['flood'], priorityCategoryIds: ['flood'], notificationsEnabled: true };
const feed = { center, radiusMeters: 5000, categoryIds: [], regionIds: [], cursor: null, limit: 50 };

before(async () => {
  rules = await initializeTestEnvironment({ projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
  await rules.clearFirestore();
  await new Promise<void>(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const address = fixture.server.address(); assert.ok(address && typeof address === 'object');
  bucket = new SupabasePhotoBucket({ url: `http://127.0.0.1:${address.port}`, serviceRoleKey: 'test-service-key', bucket: 'test-photos', allowLocalTestServer: true });
  await bucket.assertPrivate();
  backend = new Backend(db, bucket, { now: () => now, metricRetentionDays: 14, notificationSelection: 'intersection' });
  api = createApiServer({ backend, verifyToken: async token => { const user = await getAuth(app).verifyIdToken(token, true); return { uid: user.uid }; } });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const apiAddress = api.address(); assert.ok(apiAddress && typeof apiAddress === 'object'); endpoint = `http://127.0.0.1:${apiAddress.port}/api`;

  jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#4a8a9a' } }).jpeg().toBuffer();
  await db.doc('categories/flood').set({ label: 'Enchente', alertDurationSeconds: 86400, groupingDistanceMeters: 100, groupingWindowSeconds: 3600 });
  await db.doc('categories/traffic').set({ label: 'Trânsito', alertDurationSeconds: 86400, groupingDistanceMeters: 100, groupingWindowSeconds: 3600 });
  await db.doc('regions/test-region').set({ name: 'Synthetic test region', boundary: [{ points: [
    { latitude: -24, longitude: -47 }, { latitude: -24, longitude: -46 }, { latitude: -23, longitude: -46 }, { latitude: -23, longitude: -47 }, { latitude: -24, longitude: -47 },
  ] }] });
});
after(async () => { api?.closeAllConnections(); fixture.server.closeAllConnections(); await Promise.all([new Promise<void>(resolve => api ? api.close(() => resolve()) : resolve()), new Promise<void>(resolve => fixture.server.close(() => resolve()))]); await rules?.cleanup(); await deleteApp(app); });

async function photo(uid = 'alice') {
  now += 61_000; // Advance synthetic clock between publications; quota is tested separately.
  const reserved = await backend.reservePhoto(uid, { purpose: 'report' });
  await bucket.file(reserved.stagingPath).save(jpeg, { metadata: { contentType: 'image/jpeg' } });
  return backend.completePhoto(uid, { uploadId: reserved.uploadId });
}
async function report(key: string, location = center, categoryId = 'flood', uid = 'alice') {
  const upload = await photo(uid);
  return backend.createReport(uid, { idempotencyKey: key, description: 'Teste de ocorrência', categoryId, photoUploadId: upload.uploadId, location });
}

test('Render HTTP + Firebase emulators + private Supabase REST fixture', async t => {
  await t.test('session creates separate private account/public profile id and survives reentry', async () => {
    const session = await backend.ensureSession('alice');
    assert.notEqual(session.publicProfileId, 'alice');
    assert.deepEqual(await backend.ensureSession('alice'), session);
    const profile = await backend.updateOwnProfile('alice', { nickname: 'Alice', photo: null });
    assert.equal(profile.nickname, 'Alice');
    assert.equal('uid' in profile, false);
  });
  await t.test('preferences validate count, uniqueness, catalog and persist', async () => {
    assert.deepEqual(await backend.savePreferences('alice', preferences), preferences);
    assert.deepEqual(await backend.getPreferences('alice'), preferences);
    await assert.rejects(() => backend.savePreferences('alice', { ...preferences, priorityCategoryIds: ['flood', 'traffic', 'other', 'accident'] }));
    await assert.rejects(() => backend.savePreferences('alice', { ...preferences, followedRegionIds: ['missing-region'] }));
  });
  await t.test('Node raw upload validates Firebase identity, reservation owner, MIME, size and immutable private objects', async () => {
    const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const identity = await signup.json() as { idToken: string; localId: string };
    const live = new Backend(db, bucket);
    const reserved = await live.reservePhoto(identity.localId, { purpose: 'report' });
    const upload = (path: string, type = 'image/jpeg', bytes: Buffer = jpeg, token = identity.idToken) => fetch(endpoint + '/upload?path=' + encodeURIComponent(path), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body: new Uint8Array(bytes) });
    assert.equal((await upload(reserved.stagingPath, 'image/jpeg', jpeg, 'bad')).status, 401);
    assert.equal((await upload(reserved.stagingPath.replace(identity.localId, 'someone-else'))).status, 403);
    assert.equal((await upload(reserved.stagingPath, 'text/plain')).status, 400);
    assert.equal((await upload(reserved.stagingPath, 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1))).status, 400);
    assert.equal((await upload(reserved.stagingPath)).status, 200);
    assert.equal((await upload(reserved.stagingPath)).status, 409);
    const ready = await live.completePhoto(identity.localId, { uploadId: reserved.uploadId });
    assert.equal(ready.photo.contentType, 'image/jpeg');
    assert.ok(fixture.objects.has(ready.photo.storagePath));
    assert.equal((await fetch(endpoint.replace('/api', '/healthz'))).status, 200);
  });
  await t.test('Firestore rules deny private reads and all client mutation bypasses', async () => {
    for (const context of [rules.unauthenticatedContext(), rules.authenticatedContext('alice'), rules.authenticatedContext('bob')]) {
      const firestore = context.firestore();
      await assertFails(getDoc(doc(firestore, 'accounts/alice')));
      await assertFails(setDoc(doc(firestore, 'reports/forged'), { ownerUid: 'alice', location: center }));
      await assertFails(setDoc(doc(firestore, 'categories/flood'), { groupingDistanceMeters: 5000 }));
    }
  });
  await t.test('image processing validates bytes and removes metadata; rejects another owner', async () => {
    const upload = await photo();
    assert.equal(upload.photo.contentType, 'image/jpeg');
    const [bytes] = await bucket.file(upload.photo.storagePath).download();
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.exif, undefined);
    await assert.rejects(() => backend.createReport('bob', { idempotencyKey: 'stolen-photo', description: 'Teste', categoryId: 'flood', photoUploadId: upload.uploadId, location: center }));
    const invalid = await backend.reservePhoto('alice', { purpose: 'report' });
    await bucket.file(invalid.stagingPath).save(Buffer.from('not-an-image'), { metadata: { contentType: 'image/jpeg' } });
    await assert.rejects(() => backend.completePhoto('alice', { uploadId: invalid.uploadId }));
    assert.equal((await db.doc(`uploads/${invalid.uploadId}`).get()).get('status'), 'failed');
  });
  await t.test('publication is idempotent, immutable by key and contains no private UID', async () => {
    const upload = await photo();
    const input = { idempotencyKey: 'publish-once', description: 'Teste', categoryId: 'flood', photoUploadId: upload.uploadId, location: center };
    const [first, replay] = await Promise.all([backend.createReport('alice', input), backend.createReport('alice', input)]);
    assert.equal(first.id, replay.id); assert.equal('ownerUid' in first, false);
    await assert.rejects(() => backend.createReport('alice', { ...input, description: 'Different' }));
    await assert.rejects(() => backend.discardPhoto('alice', { uploadId: upload.uploadId }));
    await assert.rejects(() => backend.createReport('alice', { ...input, idempotencyKey: 'invalid-coordinate', location: { latitude: 100, longitude: 0 } }));
  });
  await t.test('grouping uses category, precise distance, time and active state', async () => {
    const first = await report('group-first');
    const near = await report('group-near', { ...center, latitude: center.latitude + 0.0001 });
    assert.equal(first.incidentId, near.incidentId);
    const far = await report('group-far', { ...center, latitude: center.latitude + 0.01 });
    assert.notEqual(first.incidentId, far.incidentId);
    const different = await report('group-category', center, 'traffic');
    assert.notEqual(first.incidentId, different.incidentId);
    now += 3600_001;
    const late = await report('group-late');
    assert.notEqual(first.incidentId, late.incidentId);
  });
  await t.test('concurrent distinct publications select a single group', async () => {
    const location = { ...center, latitude: center.latitude + 0.025 };
    const a = await photo(); const b = await photo();
    const create = (key: string, uploadId: string) => backend.createReport('alice', { idempotencyKey: key,
      description: 'Concorrência', categoryId: 'flood', photoUploadId: uploadId, location });
    const [one, two] = await Promise.all([create('concurrent-one', a.uploadId), create('concurrent-two', b.uploadId)]);
    assert.equal(one.incidentId, two.incidentId);
    assert.equal((await db.doc(`incidents/${one.incidentId}`).get()).get('reportCount'), 2);
  });
  await t.test('geohash feed filters real 5km radius, category and sorts time descending', async () => {
    const outside = await report('outside-radius', { ...center, latitude: center.latitude + 0.06 });
    const result = await backend.getFeed('alice', feed);
    assert.ok(result.items.length > 0);
    assert.equal(result.items.some(item => item.id === outside.incidentId), false);
    const times = result.items.map(item => 'updatedAt' in item ? item.updatedAt : 0);
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
    const filtered = await backend.getFeed('alice', { ...feed, categoryIds: ['traffic'] });
    assert.ok(filtered.items.every(item => item.categoryId === 'traffic'));
    await assert.rejects(() => backend.getFeed('alice', { ...feed, radiusMeters: 5001 }));
    await assert.rejects(() => backend.getFeed('alice', { ...feed, center: null }));
  });
  await t.test('pagination is bound to user and filters', async () => {
    const first = await backend.getFeed('alice', { ...feed, limit: 1 });
    assert.ok(first.nextCursor);
    const next = await backend.getFeed('alice', { ...feed, limit: 1, cursor: first.nextCursor });
    assert.notEqual(first.items[0]?.id, next.items[0]?.id);
    await assert.rejects(() => backend.getFeed('bob', { ...feed, limit: 1, cursor: first.nextCursor }));
    await assert.rejects(() => backend.getFeed('alice', { ...feed, limit: 1, categoryIds: ['traffic'], cursor: first.nextCursor }));
  });
  await t.test('metrics aggregate day, region and category transactionally', async () => {
    const metrics = await backend.getRegionalMetrics({ regionId: 'test-region', categoryIds: [] });
    assert.ok(metrics.length >= 2);
    assert.ok(metrics.every(item => item.reportCount >= item.incidentCount && item.periodEnd - item.periodStart === DAY));
  });
  await t.test('notification preparation persists device privately and plans deduplicated jobs only', async () => {
    await backend.registerOwnDevice('alice', { id: 'android-test', pushToken: 'synthetic-token', platform: 'android', updatedAt: now });
    const publication = await report('notification-report');
    await backend.planNotifications(publication.id);
    await backend.planNotifications(publication.id);
    assert.equal((await db.collection('notificationJobs').get()).size, 1);
    for (let i = 0; i < 9; i++) await backend.registerOwnDevice('alice', { id: `extra-${i}`, pushToken: 'synthetic-token', platform: 'android', updatedAt: now });
    await assert.rejects(() => backend.registerOwnDevice('alice', { id: 'eleventh', pushToken: 'synthetic-token', platform: 'android', updatedAt: now }));
    await backend.unregisterOwnDevice('alice', { deviceId: 'android-test' });
  });
  await t.test('logical alert expiry preserves history; 14 days excludes reports and photo without cleanup', async () => {
    const publication = await report('retention-report');
    now += DAY + 1;
    assert.equal((await backend.getFeed('alice', feed)).items.length, 0);
    const history = await backend.getRegionalHistory('alice', { regionId: 'test-region', categoryIds: [], cursor: null });
    assert.ok(history.items.some(item => item.id === publication.id));
    assert.ok((await backend.readPhoto('bob', { storagePath: publication.photo.storagePath })).length);
    now = publication.createdAt + RETENTION;
    assert.equal((await backend.getRegionalHistory('alice', { regionId: 'test-region', categoryIds: [], cursor: null })).items.length, 0);
    await assert.rejects(() => backend.readPhoto('alice', { storagePath: publication.photo.storagePath }));
    await backend.cleanup();
    assert.equal((await db.doc(`reports/${publication.id}`).get()).exists, false);
    assert.equal(fixture.objects.has(publication.photo.storagePath), false);
  });
  await t.test('HTTP boundary rejects missing/invalid tokens and accepts emulated Auth identity', async () => {
    const call = (token?: string) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ operation: 'ensureSession', input: null }) });
    assert.equal((await call()).status, 401);
    assert.equal((await call('invalid-token')).status, 401);
    const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const identity = await signup.json() as { idToken: string };
    const response = await call(identity.idToken);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean };
    assert.equal(body.ok, true);
  });
});
