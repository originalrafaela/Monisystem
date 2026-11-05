import type {
  AuthService, Session, ProfileService, ReportService, PhotoService, CatalogService,
  MetricsService, NotificationService, PhotoUpload,
} from '../contracts';
import type { Result, ServiceErrorCode } from '../../types/result';

/** Native SDK binding belongs to the app composition, not to screens or domain. */
export interface AuthDriver {
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getIdToken(): Promise<string | null>;
  observeUser(listener: (uid: string | null) => void): () => void;
}
export interface FirebaseTransport {
  call<T>(operation: string, input?: unknown): Promise<Result<T>>;
  upload(stagingPath: string, localUri: string): Promise<Result<void>>;
}
export function createFirebaseServices(authDriver: AuthDriver, transport: FirebaseTransport): {
  auth: AuthService; profile: ProfileService; reports: ReportService; photos: PhotoService;
  catalog: CatalogService; metrics: MetricsService; notifications: NotificationService;
} {
  const auth: AuthService = {
    async signInWithGoogle() {
      try {
        await authDriver.signInWithGoogle();
        return await transport.call<Session>('ensureSession');
      } catch { return failure('unavailable', 'Não foi possível concluir o login Google.'); }
    },
    async signOut() {
      try { await authDriver.signOut(); return { ok: true, value: undefined }; }
      catch { return failure('unavailable', 'Não foi possível encerrar a sessão.'); }
    },
    observeSession(listener) {
      let active = true; let generation = 0;
      const stop = authDriver.observeUser(uid => {
        const version = ++generation;
        if (!uid) { if (active) listener(null); return; }
        void transport.call<Session>('ensureSession').then(result => {
          if (active && generation === version) listener(result.ok ? result.value : null);
        }).catch(() => { if (active && generation === version) listener(null); });
      });
      return () => { active = false; generation++; stop(); };
    },
  };
  const profile: ProfileService = {
    getOwnProfile: () => transport.call('getOwnProfile'),
    updateOwnProfile: input => transport.call('updateOwnProfile', input),
    getPreferences: () => transport.call('getPreferences'),
    savePreferences: input => transport.call('savePreferences', input),
  };
  const reports: ReportService = {
    create: input => transport.call('createReport', input),
    getFeed: query => transport.call('getFeed', query),
    getIncidentReports: (incidentId, cursor) => transport.call('getIncidentReports', { incidentId, cursor }),
    getRegionalHistory: query => transport.call('getRegionalHistory', query),
  };
  const photos: PhotoService = {
    async upload(input) {
      const reservation = await transport.call<{ uploadId: string; stagingPath: string }>('reservePhoto', { purpose: input.purpose });
      if (!reservation.ok) return reservation;
      const { uploadId, stagingPath } = reservation.value;
      const sent = await transport.upload(stagingPath, input.localUri);
      if (!sent.ok) { await transport.call('discardPhoto', { uploadId }); return sent; }
      const completed = await transport.call<PhotoUpload>('completePhoto', { uploadId });
      if (!completed.ok) await transport.call('discardPhoto', { uploadId });
      return completed;
    },
    discard: uploadId => transport.call('discardPhoto', { uploadId }),
  };
  return {
    auth, profile, reports, photos,
    catalog: { getCategories: () => transport.call('getCategories'), getRegions: () => transport.call('getRegions') },
    metrics: { getRegionalMetrics: (regionId, categoryIds) => transport.call('getRegionalMetrics', { regionId, categoryIds }) },
    notifications: {
      registerOwnDevice: device => transport.call('registerOwnDevice', device),
      unregisterOwnDevice: deviceId => transport.call('unregisterOwnDevice', { deviceId }),
    },
  };
}
function failure(code: ServiceErrorCode, message: string): { readonly ok: false; readonly error: { readonly code: ServiceErrorCode; readonly message: string } } {
  return { ok: false, error: { code, message } };
}

/** Storage SDK and native file IO are injected: no root dependencies/configuration change. */
export function createHttpTransport(input: {
  readonly endpoint: string;
  readonly auth: AuthDriver;
  readonly uploadFile: (path: string, localUri: string) => Promise<void>;
  readonly fetch?: typeof fetch;
}): FirebaseTransport {
  const fetcher = input.fetch ?? fetch;
  validateEndpoint(input.endpoint);
  return {
    async call<T>(operation: string, body: unknown = null): Promise<Result<T>> {
      try {
        const token = await input.auth.getIdToken();
        if (!token) return failure('unauthenticated', 'Sessão obrigatória.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55_000);
        try {
          const response = await fetcher(input.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ operation, input: body }), signal: controller.signal });
          const result: unknown = await response.json();
          if (!result || typeof result !== 'object' || !('ok' in result)) return failure('unavailable', 'Resposta inválida.');
          if (result.ok === true && 'value' in result) return result as Result<T>;
          if (result.ok === false && 'error' in result && result.error && typeof result.error === 'object'
            && 'code' in result.error && 'message' in result.error && typeof result.error.message === 'string'
            && ['unauthenticated', 'forbidden', 'invalid-input', 'not-found', 'conflict', 'unavailable'].includes(String(result.error.code))) return result as Result<T>;
          return failure('unavailable', 'Resposta inválida.');
        } finally { clearTimeout(timeout); }
      } catch { return failure('unavailable', 'Serviço indisponível.'); }
    },
    async upload(path, localUri) {
      try { await input.uploadFile(path, localUri); return { ok: true, value: undefined }; }
      catch { return failure('unavailable', 'Não foi possível enviar a fotografia.'); }
    },
  };
}

/** HTTPS for configured deployments; plaintext only for the fixed local emulator project. */
export function validateEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  const local = ['127.0.0.1', 'localhost', '10.0.2.2'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (local ? url.protocol !== 'http:' || !url.pathname.startsWith('/demo-monisystem/')
      : url.protocol !== 'https:')) throw new Error('Endpoint Firebase inválido.');
}

/** Binary photo delivery keeps Storage objects private and enforces server retention. */
export async function readProtectedPhoto(input: {
  readonly endpoint: string;
  readonly auth: AuthDriver;
  readonly storagePath: string;
  readonly fetch?: typeof fetch;
}): Promise<Result<Uint8Array>> {
  try {
    validateEndpoint(input.endpoint);
    if (!/^processed\/[a-zA-Z0-9_-]+\/photo\.jpg$/.test(input.storagePath)) return failure('invalid-input', 'Referência de foto inválida.');
    const token = await input.auth.getIdToken();
    if (!token) return failure('unauthenticated', 'Sessão obrigatória.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await (input.fetch ?? fetch)(input.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ operation: 'readPhoto', input: { storagePath: input.storagePath } }), signal: controller.signal,
      });
      if (response.status === 401) return failure('unauthenticated', 'Sessão inválida.');
      if (response.status === 403 || response.status === 404) return failure('not-found', 'Foto indisponível.');
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/jpeg')) return failure('unavailable', 'Foto indisponível.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024) return failure('unavailable', 'Resposta inválida.');
      return { ok: true, value: bytes };
    } finally { clearTimeout(timeout); }
  } catch { return failure('unavailable', 'Não foi possível carregar a foto.'); }
}
