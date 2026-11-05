import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import { Backend } from './backend';
import { assertLocalEnvironment, requireThat, result, ServiceError } from './core';

function configuredBackend(): Backend {
  const local = process.env.MONISYSTEM_ENV !== 'production';
  if (local) assertLocalEnvironment(process.env);
  else {
    requireThat(!!process.env.GCLOUD_PROJECT && !process.env.GCLOUD_PROJECT.startsWith('demo-')
      && !!process.env.MONISYSTEM_STORAGE_BUCKET, 'unavailable', 'Ambiente Firebase não configurado.');
    requireThat(!process.env.FIREBASE_AUTH_EMULATOR_HOST && !process.env.FIRESTORE_EMULATOR_HOST
      && !process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'unavailable', 'Emuladores proibidos em produção.');
  }
  const app = getApps()[0] ?? initializeApp({
    projectId: local ? 'demo-monisystem' : process.env.GCLOUD_PROJECT!,
    storageBucket: local ? 'demo-monisystem.appspot.com' : process.env.MONISYSTEM_STORAGE_BUCKET!,
  });
  return new Backend(getFirestore(app), getStorage(app).bucket(), { metricRetentionDays: 14 });
}

/** Authenticated HTTP boundary. Production requires explicit environment configuration. */
export const api = onRequest({ maxInstances: 1, timeoutSeconds: 60, memory: '512MiB', cors: false }, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const outcome = await result(async () => {
    const backend = configuredBackend();
    requireThat(request.method === 'POST', 'invalid-input', 'Use POST.');
    requireThat(request.rawBody.length <= 64 * 1024, 'invalid-input', 'Requisição excede 64 KiB.');
    const authorization = request.get('authorization');
    requireThat(authorization && authorization.startsWith('Bearer '), 'unauthenticated', 'Sessão obrigatória.');
    let uid: string; let displayName: string | undefined;
    try {
      const identity = await getAuth().verifyIdToken(authorization.slice(7), true);
      uid = identity.uid;
      displayName = typeof identity.name === 'string' ? identity.name : undefined;
    }
    catch { throw new ServiceError('unauthenticated', 'Sessão inválida.'); }
    const { operation, input } = z.object({ operation: z.string().max(80), input: z.unknown() }).strict().parse(request.body);
    switch (operation) {
      case 'ensureSession': return backend.ensureSession(uid, displayName);
      case 'getOwnProfile': return backend.getOwnProfile(uid);
      case 'updateOwnProfile': return backend.updateOwnProfile(uid, input);
      case 'getPreferences': return backend.getPreferences(uid);
      case 'savePreferences': return backend.savePreferences(uid, input);
      case 'getCategories': return backend.getCategories();
      case 'getRegions': return backend.getRegions();
      case 'reservePhoto': return backend.reservePhoto(uid, input);
      case 'completePhoto': return backend.completePhoto(uid, input);
      case 'discardPhoto': return backend.discardPhoto(uid, input);
      case 'createReport': return backend.createReport(uid, input);
      case 'getFeed': return backend.getFeed(uid, input);
      case 'getIncidentReports': return backend.getIncidentReports(uid, input);
      case 'getRegionalHistory': return backend.getRegionalHistory(uid, input);
      case 'getRegionalMetrics': return backend.getRegionalMetrics(input);
      case 'registerOwnDevice': return backend.registerOwnDevice(uid, input);
      case 'unregisterOwnDevice': return backend.unregisterOwnDevice(uid, input);
      case 'readPhoto': return backend.readPhoto(uid, input);
      default: throw new ServiceError('invalid-input', 'Operação desconhecida.');
    }
  });
  if (outcome.ok && Buffer.isBuffer(outcome.value)) {
    response.type('image/jpeg').send(outcome.value);
    return;
  }
  const status = outcome.ok ? 200 : ({ unauthenticated: 401, forbidden: 403, 'invalid-input': 400, 'not-found': 404, conflict: 409, unavailable: 503 } as const)[outcome.error.code];
  response.status(status).json(outcome.ok && outcome.value === undefined ? { ok: true, value: null } : outcome);
});
