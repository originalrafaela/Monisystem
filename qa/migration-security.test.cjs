/* global Buffer */
// Requires a fresh backend build. All data and credentials below are synthetic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
const path = require('node:path');
const backendRequire = createRequire(path.resolve('backend/package.json'));
const sharp = backendRequire('sharp');
const { Backend } = require('../backend/dist/backend/src/backend.js');
const { time } = require('../backend/dist/backend/src/persistence.js');
const { SupabasePhotoBucket } = require('../backend/dist/backend/src/storage.js');
const { createApiHandler } = require('../backend/dist/backend/src/http.js');

function database(initial) {
  const documents = new Map(Object.entries(initial));
  function snapshot(ref) { const data = documents.get(ref.path); return { exists: !!data, id: ref.path.split('/').pop(), ref, data: () => data, get: key => data?.[key] }; }
  const db = {
    doc(name) { const ref = { path: name, get: async () => snapshot(ref), delete: async () => documents.delete(name) }; return ref; },
    collection(name) {
      function query(filters = [], maximum = Infinity) {
        return { where(field, operator, value) { return query([...filters, [field, operator, value]], maximum); }, limit(value) { return query(filters, value); }, async get() {
          const docs = [...documents].filter(([key, data]) => key.startsWith(name + '/') && filters.every(([field, operator, value]) => operator === '==' ? data[field] === value : data[field] <= value)).slice(0, maximum).map(([key]) => snapshot(db.doc(key)));
          return { docs, size: docs.length };
        } };
      }
      return query();
    },
    async runTransaction(work) { return work({ get: async ref => snapshot(ref), update: (ref, patch) => documents.set(ref.path, { ...documents.get(ref.path), ...patch }) }); },
  };
  return { db, documents };
}
function privateStorage() {
  const objects = new Map();
  const calls = [];
  return { objects, calls, file(name) { return {
    async save(bytes, options) { calls.push(['save', name]); if (objects.has(name)) throw Error('object already exists'); objects.set(name, { bytes: Buffer.from(bytes), contentType: options.metadata?.contentType }); },
    async getMetadata() { const value = objects.get(name); if (!value) throw Error('not found'); return [{ size: value.bytes.length, contentType: value.contentType }]; },
    async download() { calls.push(['download', name]); const value = objects.get(name); if (!value) throw Error('not found'); return [value.bytes]; },
    async delete() { calls.push(['delete', name]); objects.delete(name); },
  }; } };
}
function fixture() {
  const now = Date.UTC(2026, 10, 5);
  const reservation = { ownerUid: 'alice', purpose: 'report', stagingPath: 'staging/alice/upload-1/original', processedPath: 'processed/upload-1/photo.jpg', status: 'reserved', expiresAt: time(now + 60000) };
  const { db, documents } = database({ 'uploads/upload-1': reservation });
  const storage = privateStorage();
  return { backend: new Backend(db, storage, { now: () => now }), now, documents, storage, reservation };
}
test('API upload checks reservation ownership, expiry, MIME, size and immutable bytes', async () => {
  const f = fixture(); const bytes = Buffer.from('synthetic-payload'); const target = f.reservation.stagingPath;
  await assert.rejects(() => f.backend.uploadPhoto('bob', target, bytes, 'image/jpeg'));
  await assert.rejects(() => f.backend.uploadPhoto('alice', '../processed/key', bytes, 'image/jpeg'));
  await assert.rejects(() => f.backend.uploadPhoto('alice', target, bytes, 'text/plain'));
  await assert.rejects(() => f.backend.uploadPhoto('alice', target, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'));
  assert.equal(f.storage.objects.size, 0);
  f.documents.set('uploads/upload-1', { ...f.reservation, expiresAt: time(f.now) });
  await assert.rejects(() => f.backend.uploadPhoto('alice', target, bytes, 'image/jpeg'));
  f.documents.set('uploads/upload-1', f.reservation);
  await f.backend.uploadPhoto('alice', target, bytes, 'image/jpeg');
  await assert.rejects(() => f.backend.uploadPhoto('alice', target, Buffer.from('different'), 'image/jpeg'));
  assert.deepEqual(f.storage.objects.get(target).bytes, bytes);
});
test('real sharp processing strips existing EXIF; arbitrary bytes never become a ready photo', async () => {
  const f = fixture();
  const original = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#778899' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'QA synthetic marker' }, IFD2: { UserComment: 'private synthetic metadata' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 38/1 0/1' } } }).toBuffer();
  const inputExif = (await sharp(original).metadata()).exif;
  assert.ok(inputExif, 'fixture must contain actual EXIF before processing');
  assert.ok(inputExif.includes(Buffer.from([0x25, 0x88])) || inputExif.includes(Buffer.from([0x88, 0x25])), 'fixture must contain a GPS IFD pointer');
  await f.backend.uploadPhoto('alice', f.reservation.stagingPath, original, 'image/jpeg');
  const result = await f.backend.completePhoto('alice', { uploadId: 'upload-1' });
  const processed = f.storage.objects.get(result.photo.storagePath).bytes;
  assert.equal((await sharp(processed).metadata()).exif, undefined);
  assert.equal(processed.includes(Buffer.from('QA synthetic marker')), false);
  const invalid = fixture();
  await invalid.backend.uploadPhoto('alice', invalid.reservation.stagingPath, Buffer.from('not-an-image'), 'image/jpeg');
  await assert.rejects(() => invalid.backend.completePhoto('alice', { uploadId: 'upload-1' }));
  assert.notEqual(invalid.documents.get('uploads/upload-1').status, 'ready');
});
test('expired protected photo is denied before any object download', async () => {
  const f = fixture();
  f.documents.set('uploads/upload-1', { ...f.reservation, status: 'linked', reportId: 'report-1' });
  f.documents.set('reports/report-1', { deletionState: 'retained', deleteAfter: time(f.now) });
  await assert.rejects(() => f.backend.readPhoto('alice', { storagePath: f.reservation.processedPath }));
  assert.equal(f.storage.calls.filter(([kind]) => kind === 'download').length, 0);
});
test('Supabase adapter refuses public bucket and prevents object requests until private verified', async () => {
  const calls = [];
  const storage = new SupabasePhotoBucket({ url: 'https://qa.supabase.co', serviceRoleKey: 'sb_secret_synthetic_server_only_key', bucket: 'photos', fetch: async (url, options) => { calls.push({ url: String(url), options }); return new Response(JSON.stringify({ id: 'photos', public: true }), { status: 200 }); } });
  await assert.rejects(() => storage.assertPrivate());
  await assert.rejects(() => storage.file('processed/id/photo.jpg').download());
  assert.ok(calls.every(call => !call.url.includes('/object/')));
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_synthetic_server_only_key');
  assert.equal(calls[0].options.headers.Authorization, undefined, 'modern secret keys must not be sent as Firebase/user JWT bearer');
});
async function request(handler, { method = 'POST', url = '/api', headers = {}, body = Buffer.from('{}') } = {}) {
  const req = Readable.from([body]); req.method = method; req.url = url; req.headers = headers;
  const chunks = []; const responseHeaders = {};
  let finish;
  const completion = new Promise(resolve => { finish = resolve; });
  const res = { statusCode: 200, setHeader(key, value) { responseHeaders[key.toLowerCase()] = value; return this; }, end(value) { if (value) chunks.push(Buffer.from(value)); finish(); }, writeHead(status, extra) { this.statusCode = status; Object.assign(responseHeaders, extra); return this; } };
  handler(req, res); await completion;
  return { status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: responseHeaders };
}
test('HTTP rejects missing/invalid Firebase tokens; health reveals no identities or administrative data', async () => {
  let mutations = 0;
  const backend = { ensureSession: async () => { mutations++; return { uid: 'alice', publicProfileId: 'public' }; } };
  const handler = createApiHandler({ backend, verifyToken: async token => { if (token !== 'valid-synthetic-token') throw Error('sensitive verifier failure'); return { uid: 'alice' }; } });
  const body = Buffer.from(JSON.stringify({ operation: 'ensureSession', input: null }));
  assert.equal((await request(handler, { body })).status, 401);
  const denied = await request(handler, { body, headers: { authorization: 'Bearer invalid-token', 'content-type': 'application/json' } });
  assert.equal(denied.status, 401); assert.equal(denied.body.includes('sensitive'), false); assert.equal(mutations, 0);
  const health = await request(handler, { method: 'GET', url: '/healthz' });
  assert.equal(health.status, 200); assert.equal(health.body.includes('alice'), false); assert.equal(health.body.includes('key'), false);
});

test('Supabase object API uses create-only private writes, refuses traversal and bounded downloads', async () => {
  const calls = [];
  const storage = new SupabasePhotoBucket({ url: 'https://qa.supabase.co', serviceRoleKey: 'sb_secret_synthetic_server_only_key', bucket: 'photos', fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/bucket/')) return new Response(JSON.stringify({ id: 'photos', public: false }), { status: 200 });
    if (options.method === 'POST') return new Response('{}', { status: 409 });
    return new Response(new Uint8Array(5 * 1024 * 1024 + 1), { status: 200 });
  } });
  await storage.assertPrivate();
  for (const path of ['../secrets', 'processed/../photo.jpg', 'https://evil.invalid/private', 'staging/alice/id/%2e%2e']) assert.throws(() => storage.file(path));
  await assert.rejects(() => storage.file('staging/alice/upload-1/original').save(Buffer.from('image'), { metadata: { contentType: 'image/jpeg' } }), error => error.code === 'conflict');
  const write = calls.find(call => call.options.method === 'POST');
  assert.equal(write.options.headers['x-upsert'], 'false');
  assert.ok(write.url.includes('/object/photos/staging/'));
  assert.ok(calls.every(call => call.options.redirect === 'error'), 'provider redirect must not forward server credentials');
  await assert.rejects(() => storage.file('processed/upload-1/photo.jpg').download());
  assert.ok(calls.every(call => !call.url.includes('/public/') && !call.url.includes('/sign/')));
});

test('physical cleanup preserves retry metadata when object deletion fails and removes on retry', async () => {
  const f = fixture();
  f.documents.set('uploads/upload-1', { ...f.reservation, status: 'failed', expiresAt: time(f.now) });
  f.storage.objects.set(f.reservation.stagingPath, { bytes: Buffer.from('old-image'), contentType: 'image/jpeg' });
  f.storage.objects.set(f.reservation.processedPath, { bytes: Buffer.from('old-processed'), contentType: 'image/jpeg' });
  const original = f.storage.file.bind(f.storage); let fail = true;
  f.storage.file = name => { const file = original(name); return { ...file, async delete(options) { if (fail) { fail = false; throw Error('temporary provider outage'); } return file.delete(options); } }; };
  await assert.rejects(() => f.backend.cleanup());
  assert.equal(f.documents.has('uploads/upload-1'), true, 'failed deletion must retain retry metadata');
  assert.equal(f.storage.objects.has(f.reservation.processedPath), true);
  const result = await f.backend.cleanup();
  assert.equal(result.uploads, 1); assert.equal(f.documents.has('uploads/upload-1'), false);
  assert.equal(f.storage.objects.size, 0);
});

test('provider upload failure never marks reservation received or ready', async () => {
  const f = fixture();
  f.storage.file = () => ({ async save() { throw Error('provider unavailable'); } });
  await assert.rejects(() => f.backend.uploadPhoto('alice', f.reservation.stagingPath, Buffer.from('image'), 'image/jpeg'));
  const state = f.documents.get('uploads/upload-1');
  assert.equal(state.status, 'failed'); assert.notEqual(state.uploadReceived, true);
  assert.equal(f.storage.objects.size, 0);
});

test('HTTP enforces JSON/upload limits and delegates authenticated upload exactly once', async () => {
  const uploads = [];
  const handler = createApiHandler({ backend: { async uploadPhoto(...args) { uploads.push(args); } }, verifyToken: async () => ({ uid: 'alice' }) });
  const headers = { authorization: 'Bearer valid-synthetic-token', 'content-type': 'image/jpeg' };
  assert.equal((await request(handler, { url: '/api/upload?path=staging%2Falice%2Fid%2Foriginal', headers, body: Buffer.from('jpeg') })).status, 200);
  assert.equal(uploads.length, 1); assert.equal(uploads[0][0], 'alice'); assert.equal(uploads[0][1], 'staging/alice/id/original');
  const over = await request(handler, { url: '/api/upload?path=staging%2Falice%2Fid%2Foriginal', headers: { ...headers, 'content-length': String(5 * 1024 * 1024 + 1) } });
  assert.equal(over.status, 400); assert.equal(uploads.length, 1);
  assert.equal((await request(handler, { url: '/api/upload?path=a&path=b', headers })).status, 400);
  assert.equal((await request(handler, { headers: { ...headers, 'content-type': 'application/json' }, body: Buffer.alloc(64 * 1024 + 1, 32) })).status, 400);
  const malformed = await request(handler, { headers: { ...headers, 'content-type': 'application/json' }, body: Buffer.from('{invalid-json') });
  assert.equal(malformed.status, 400); assert.equal(malformed.body.includes('SyntaxError'), false);
});

test('Supabase constructor rejects publishable/anonymous credentials and insecure provider URLs', () => {
  for (const url of ['http://remote.invalid', 'https://user:password@qa.supabase.co', 'https://qa.supabase.co?token=secret']) assert.throws(() => new SupabasePhotoBucket({ url, serviceRoleKey: 'sb_secret_synthetic_server_only_key', bucket: 'photos' }));
  const anonymous = 'test.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.test';
  assert.throws(() => new SupabasePhotoBucket({ url: 'https://qa.supabase.co', serviceRoleKey: anonymous, bucket: 'photos' }));
});
