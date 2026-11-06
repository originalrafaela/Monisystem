import type { AuthDriver, FirebaseTransport } from './index';
import type { Result, ServiceErrorCode } from '../../types/result';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const STARTING = 'O servidor está iniciando ou indisponível. Aguarde um momento e tente novamente.';
const failure = (code: ServiceErrorCode, message: string): { readonly ok: false; readonly error: { readonly code: ServiceErrorCode; readonly message: string } } => ({ ok: false, error: { code, message } });

/** HTTPS deployments; unencrypted HTTP is restricted to explicit local development. */
export function validateEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  const local = ['127.0.0.1', 'localhost', '10.0.2.2'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (local ? url.protocol !== 'http:' || (!url.pathname.startsWith('/demo-monisystem/') && url.pathname !== '/api')
      : url.protocol !== 'https:')) throw new Error('Endpoint da API inválido.');
}

export type ApiReadiness = () => Promise<void>;
/** Only the idempotent health probe is retried. A POST is sent at most once per call. */
export function createApiReadiness(input: {
  readonly endpoint: string;
  readonly fetch?: typeof fetch;
  readonly budgetMs?: number;
  readonly attemptMs?: number;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}): ApiReadiness {
  validateEndpoint(input.endpoint);
  const endpoint = new URL(input.endpoint);
  // The retained Functions emulator boundary does not expose Render health routes.
  if (endpoint.pathname !== '/api') return async () => {};
  const fetcher = input.fetch ?? fetch;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let readyUntil = 0;
  let pending: Promise<void> | null = null;
  return () => {
    if (now() < readyUntil) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      const deadline = now() + (input.budgetMs ?? 105_000);
      while (now() < deadline) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(input.attemptMs ?? 15_000, deadline - now()));
        try {
          const response = await fetcher(new URL('/healthz', endpoint).toString(), { method: 'GET', signal: controller.signal, redirect: 'error' });
          if (response.ok) { readyUntil = now() + 45_000; return; }
          if (![502, 503, 504].includes(response.status)) throw new Error(STARTING);
        } catch {
          // Failed health checks may safely be repeated; mutations never are.
        } finally { clearTimeout(timer); }
        const remaining = deadline - now();
        if (remaining > 0) await sleep(Math.min(input.intervalMs ?? 2_000, remaining));
      }
      throw new Error(STARTING);
    })().finally(() => { pending = null; });
    return pending;
  };
}

function decodeResult<T>(result: unknown): Result<T> {
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok === true && 'value' in result) return result as Result<T>;
    if (result.ok === false && 'error' in result && result.error && typeof result.error === 'object'
      && 'code' in result.error && 'message' in result.error && typeof result.error.message === 'string'
      && ['unauthenticated', 'forbidden', 'invalid-input', 'not-found', 'conflict', 'unavailable'].includes(String(result.error.code))) return result as Result<T>;
  }
  return failure('unavailable', 'Resposta inválida.');
}

export function createHttpTransport(input: {
  readonly endpoint: string;
  readonly auth: AuthDriver;
  readonly uploadFile: (path: string, localUri: string) => Promise<void | Result<void>>;
  readonly fetch?: typeof fetch;
  readonly readiness?: ApiReadiness;
}): FirebaseTransport {
  const fetcher = input.fetch ?? fetch;
  validateEndpoint(input.endpoint);
  const readiness = input.readiness ?? createApiReadiness({ endpoint: input.endpoint, fetch: fetcher });
  return {
    async call<T>(operation: string, body: unknown = null): Promise<Result<T>> {
      try {
        if (!await input.auth.getIdToken()) return failure('unauthenticated', 'Sessão obrigatória.');
        await readiness();
        // A logout while a cold server starts must not send the previous account's token.
        const token = await input.auth.getIdToken();
        if (!token) return failure('unauthenticated', 'Sessão obrigatória.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55_000);
        try {
          const response = await fetcher(input.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ operation, input: body }), signal: controller.signal, redirect: 'error' });
          if (response.status === 401) return failure('unauthenticated', 'Sessão inválida.');
          if ([502, 503, 504].includes(response.status)) return failure('unavailable', STARTING);
          return decodeResult<T>(await response.json());
        } finally { clearTimeout(timeout); }
      } catch { return failure('unavailable', STARTING); }
    },
    async upload(path, localUri) {
      try { const result = await input.uploadFile(path, localUri); return result ?? { ok: true, value: undefined }; }
      catch { return failure('unavailable', 'Não foi possível enviar a fotografia. Aguarde e tente novamente.'); }
    },
  };
}

/** Firebase credentials authenticate the API; no Supabase credentials reach the device. */
export async function uploadProtectedPhoto(input: {
  readonly endpoint: string;
  readonly auth: AuthDriver;
  readonly stagingPath: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly fetch?: typeof fetch;
  readonly readiness?: ApiReadiness;
}): Promise<Result<void>> {
  try {
    validateEndpoint(input.endpoint);
    if (!/^staging\/[^/]+\/[a-zA-Z0-9_-]+\/original$/.test(input.stagingPath)
      || input.bytes.byteLength <= 0 || input.bytes.byteLength > MAX_PHOTO_BYTES
      || !['image/jpeg', 'image/png', 'image/webp'].includes(input.contentType)) return failure('invalid-input', 'Fotografia inválida.');
    if (!await input.auth.getIdToken()) return failure('unauthenticated', 'Sessão obrigatória.');
    await (input.readiness ?? createApiReadiness({ endpoint: input.endpoint, fetch: input.fetch ?? fetch }))();
    const token = await input.auth.getIdToken();
    if (!token) return failure('unauthenticated', 'Sessão obrigatória.');
    const url = new URL(input.endpoint);
    url.pathname = url.pathname.replace(/\/$/, '') + '/upload';
    url.searchParams.set('path', input.stagingPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await (input.fetch ?? fetch)(url.toString(), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': input.contentType }, body: new Uint8Array(input.bytes).buffer, signal: controller.signal, redirect: 'error' });
      if (response.status === 401) return failure('unauthenticated', 'Sessão inválida.');
      if ([502, 503, 504].includes(response.status)) return failure('unavailable', STARTING);
      const result = decodeResult<null>(await response.json());
      return result.ok ? { ok: true, value: undefined } : result;
    } finally { clearTimeout(timeout); }
  } catch { return failure('unavailable', 'Não foi possível enviar a fotografia. Aguarde e tente novamente.'); }
}

/** Binary photo delivery keeps bucket objects private and enforces server retention. */
export async function readProtectedPhoto(input: {
  readonly endpoint: string;
  readonly auth: AuthDriver;
  readonly storagePath: string;
  readonly fetch?: typeof fetch;
  readonly readiness?: ApiReadiness;
}): Promise<Result<Uint8Array>> {
  try {
    validateEndpoint(input.endpoint);
    if (!/^processed\/[a-zA-Z0-9_-]+\/photo\.jpg$/.test(input.storagePath)) return failure('invalid-input', 'Referência de foto inválida.');
    if (!await input.auth.getIdToken()) return failure('unauthenticated', 'Sessão obrigatória.');
    await (input.readiness ?? createApiReadiness({ endpoint: input.endpoint, fetch: input.fetch ?? fetch }))();
    const token = await input.auth.getIdToken();
    if (!token) return failure('unauthenticated', 'Sessão obrigatória.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await (input.fetch ?? fetch)(input.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ operation: 'readPhoto', input: { storagePath: input.storagePath } }), signal: controller.signal, redirect: 'error',
      });
      if (response.status === 401) return failure('unauthenticated', 'Sessão inválida.');
      if (response.status === 403 || response.status === 404) return failure('not-found', 'Foto indisponível.');
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/jpeg')) return failure('unavailable', 'Foto indisponível.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_PHOTO_BYTES) return failure('unavailable', 'Resposta inválida.');
      return { ok: true, value: bytes };
    } finally { clearTimeout(timeout); }
  } catch { return failure('unavailable', 'Não foi possível carregar a foto. Aguarde e tente novamente.'); }
}
