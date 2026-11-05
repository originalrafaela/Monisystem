/* global __dirname */
// Run from backend after installing its dependencies and starting local emulators:
// node --test ../qa/rules.test.cjs
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../backend/package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = req('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, Timestamp } = req('firebase/firestore');
const { ref, uploadBytes, getBytes } = req('firebase/storage');

test('nega acessos diretos e restringe upload a proprietário, reserva e tamanho', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-monisystem-qa',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(path.join(__dirname, '../backend/firestore.rules'), 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: readFileSync(path.join(__dirname, '../backend/storage.rules'), 'utf8') },
  });
  try {
    await env.clearFirestore();
    const owner = env.authenticatedContext('qa-owner');
    const other = env.authenticatedContext('qa-other');
    const anon = env.unauthenticatedContext();
    for (const context of [owner, other, anon]) {
      await assertFails(getDoc(doc(context.firestore(), 'accounts/qa-owner')));
      await assertFails(setDoc(doc(context.firestore(), 'reports/forged'), { ownerUid: 'qa-owner' }));
    }
    const uploadPath = 'staging/qa-owner/qa-reservation/original';
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'uploads/qa-reservation'), {
        ownerUid: 'qa-owner', status: 'reserved', expiresAt: Timestamp.fromMillis(Date.now() + 60000),
      });
    });
    const jpeg = new Uint8Array([255, 216, 255, 217]);
    const put = (context, bytes = jpeg, contentType = 'image/jpeg', target = uploadPath) =>
      uploadBytes(ref(context.storage(), target), bytes, { contentType });
    await assertFails(put(anon));
    await assertFails(put(other));
    await assertFails(put(owner, jpeg, 'text/plain'));
    await assertFails(put(owner, new Uint8Array(0)));
    await assertFails(put(owner, new Uint8Array(5 * 1024 * 1024 + 1)));
    await assertFails(put(owner, jpeg, 'image/jpeg', 'processed/forged/photo.jpg'));
    await assertFails(put(owner, jpeg, 'image/jpeg', 'staging/qa-owner/missing/original'));
    for (const [id, changes] of [
      ['expired', { expiresAt: Timestamp.fromMillis(Date.now() - 60000) }],
      ['consumed', { status: 'linked' }],
      ['wrong-owner', { ownerUid: 'qa-other' }],
    ]) {
      await env.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), `uploads/${id}`), {
          ownerUid: 'qa-owner', status: 'reserved', expiresAt: Timestamp.fromMillis(Date.now() + 60000), ...changes,
        });
      });
      await assertFails(put(owner, jpeg, 'image/jpeg', `staging/qa-owner/${id}/original`));
    }
    await assertSucceeds(put(owner));
    await assertFails(put(owner)); // overwrite
    await assertFails(getBytes(ref(owner.storage(), uploadPath)));
  } finally { await env.cleanup(); }
});
