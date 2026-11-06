import { z } from 'zod';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Backend } from './backend';
import { requireThat } from './core';
import { SupabasePhotoBucket } from './storage';
import { StartupFailure, startupCheck } from './startup';

export async function createProductionRuntime(env: NodeJS.ProcessEnv = process.env) {
  if (env.MONISYSTEM_ENV !== 'production') throw new StartupFailure('ENV_MODE');
  if (env.GCLOUD_PROJECT !== 'monisystem-f6d63') throw new StartupFailure('ENV_PROJECT');
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_STORAGE_EMULATOR_HOST) throw new StartupFailure('ENV_EMULATOR');
  const { FIREBASE_SERVICE_ACCOUNT_JSON, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET } = env;
  if (!FIREBASE_SERVICE_ACCOUNT_JSON || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_STORAGE_BUCKET) throw new StartupFailure('ENV_MISSING');
  const parsed: unknown = startupCheck('FIREBASE_JSON', () => JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON));
  const credentials = startupCheck('FIREBASE_FIELDS', () => z.object({ project_id: z.string(), client_email: z.string().email(), private_key: z.string().min(1) }).parse(parsed));
  if (credentials.project_id !== env.GCLOUD_PROJECT) throw new StartupFailure('FIREBASE_PROJECT');
  const bucket = startupCheck('SUPABASE_CONFIG', () => new SupabasePhotoBucket({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY, bucket: SUPABASE_STORAGE_BUCKET }));
  await bucket.assertPrivate();
  const { app, backend } = startupCheck('FIREBASE_INIT', () => {
    const app = getApps()[0] ?? initializeApp({ projectId: env.GCLOUD_PROJECT!, credential: cert({ projectId: credentials.project_id, clientEmail: credentials.client_email, privateKey: credentials.private_key }) });
    requireThat(app.options.projectId === env.GCLOUD_PROJECT, 'unavailable', 'Projeto Firebase incompatível.');
    return { app, backend: new Backend(getFirestore(app), bucket, { metricRetentionDays: 14 }) };
  });
  return { backend, verifyToken: async (token: string) => {
    const decoded = await getAuth(app).verifyIdToken(token, true);
    return { uid: decoded.uid, ...(typeof decoded.name === 'string' ? { name: decoded.name } : {}) };
  } };
}

/** Sequential, bounded cleanup runs on startup, activity and timer; sleep prevents guaranteed deadlines. */
export function createCleanupRunner(backend: Pick<Backend, 'cleanup'>, now: () => number = Date.now) {
  let pending: Promise<void> | null = null; let lastAttempt = -Infinity;
  return (force = false): Promise<void> => {
    if (pending) return pending;
    if (!force && now() - lastAttempt < 60_000) return Promise.resolve();
    lastAttempt = now();
    pending = backend.cleanup().then(() => {}).catch(() => {
      // Never log tokens, object paths, coordinates or provider response bodies.
      console.error('Limpeza de retenção pendente; nova tentativa necessária.');
    }).finally(() => { pending = null; });
    return pending;
  };
}
