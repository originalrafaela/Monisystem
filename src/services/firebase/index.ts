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

export { createHttpTransport, validateEndpoint, readProtectedPhoto, createApiReadiness, uploadProtectedPhoto } from './http';
