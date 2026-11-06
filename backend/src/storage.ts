import { MAX_PHOTO_BYTES, requireThat, ServiceError } from './core';
import { StartupFailure } from './startup';

export interface PhotoMetadata { size?: string | number; contentType?: string }
export interface PhotoSaveOptions {
  resumable?: boolean;
  metadata: { contentType: string; cacheControl?: string };
  preconditionOpts?: { ifGenerationMatch: number };
}
/** Structural port also accepts the legacy Firebase emulator Bucket. No public URL API. */
export interface PhotoBucket {
  file(path: string): {
    getMetadata(): Promise<[PhotoMetadata, ...unknown[]]>;
    download(): Promise<[Buffer, ...unknown[]]>;
    save(bytes: Buffer, options: PhotoSaveOptions): Promise<unknown>;
    delete(options: { ignoreNotFound: boolean }): Promise<unknown>;
  };
}

function objectPath(path: string): string {
  requireThat(/^(staging\/[a-zA-Z0-9:_-]+\/[a-zA-Z0-9_-]+\/original|processed\/[a-zA-Z0-9_-]+\/photo\.jpg)$/.test(path), 'invalid-input', 'Caminho de foto inválido.');
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Uses only the server service role and a verified private bucket. Never creates a bucket. */
export class SupabasePhotoBucket implements PhotoBucket {
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private privateVerified = false;
  constructor(private readonly config: { url: string; serviceRoleKey: string; bucket: string; fetch?: typeof fetch; allowLocalTestServer?: boolean }) {
    const url = new URL(config.url);
    const local = config.allowLocalTestServer && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    requireThat((url.protocol === 'https:' || local) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'unavailable', 'URL Supabase inválida.');
    requireThat(/^[a-zA-Z0-9_-]{1,100}$/.test(config.bucket) && config.serviceRoleKey.length > 0, 'unavailable', 'Storage não configurado.');
    // JWT keys must be administrative. New Supabase secret keys are server-only too.
    if (!config.serviceRoleKey.startsWith('sb_secret_') && !config.allowLocalTestServer) {
      try {
        const payload = JSON.parse(Buffer.from(config.serviceRoleKey.split('.')[1] ?? '', 'base64url').toString()) as { role?: string };
        requireThat(payload.role === 'service_role', 'unavailable', 'Chave administrativa Storage obrigatória.');
      } catch { throw new ServiceError('unavailable', 'Chave administrativa Storage obrigatória.'); }
    }
    this.base = url.origin + '/storage/v1';
    this.fetcher = config.fetch ?? fetch;
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetcher(this.base + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { apikey: this.config.serviceRoleKey, ...(!this.config.serviceRoleKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${this.config.serviceRoleKey}` } : {}), ...init.headers } });
    } catch { throw new ServiceError('unavailable', 'Storage privado indisponível.'); }
  }
  async assertPrivate(): Promise<void> {
    this.privateVerified = false;
    let response: Response;
    try { response = await this.request('/bucket/' + encodeURIComponent(this.config.bucket)); }
    catch { throw new StartupFailure('SUPABASE_CONNECT'); }
    if (!response.ok) throw new StartupFailure('SUPABASE_HTTP', response.status);
    let bucket: unknown;
    try { bucket = await response.json(); }
    catch { throw new StartupFailure('SUPABASE_BUCKET_RESPONSE'); }
    if (!bucket || typeof bucket !== 'object') throw new StartupFailure('SUPABASE_BUCKET_RESPONSE');
    if (!('public' in bucket) || bucket.public !== false) throw new StartupFailure('SUPABASE_BUCKET_PRIVATE');
    if (!(('id' in bucket && bucket.id === this.config.bucket) || ('name' in bucket && bucket.name === this.config.bucket))) throw new StartupFailure('SUPABASE_BUCKET_ID');
    this.privateVerified = true;
  }
  file(path: string): ReturnType<PhotoBucket['file']> {
    const encoded = objectPath(path);
    const key = '/' + encodeURIComponent(this.config.bucket) + '/' + encoded;
    const ready = () => requireThat(this.privateVerified, 'unavailable', 'Bucket privado não verificado.');
    const download = async (): Promise<[Buffer]> => {
      ready();
      const response = await this.request('/object/authenticated' + key);
      requireThat(response.ok, response.status === 404 || response.status === 400 ? 'not-found' : 'unavailable', 'Foto privada indisponível.');
      const length = Number(response.headers.get('content-length') ?? 0);
      requireThat(Number.isFinite(length) && length <= MAX_PHOTO_BYTES, 'unavailable', 'Foto excede o limite.');
      const reader = response.body?.getReader();
      requireThat(reader, 'unavailable', 'Foto privada indisponível.');
      const chunks: Buffer[] = []; let total = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          total += chunk.value.byteLength;
          requireThat(total <= MAX_PHOTO_BYTES, 'unavailable', 'Foto excede o limite.');
          chunks.push(Buffer.from(chunk.value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      return [Buffer.concat(chunks)];
    };
    return {
      async getMetadata() {
        const [bytes] = await download();
        // Actual image bytes are decoded by sharp; MIME here does not grant image validity.
        return [{ size: bytes.length, contentType: 'image/jpeg' }];
      },
      download,
      save: async (bytes, options) => {
        ready(); requireThat(bytes.length > 0 && bytes.length <= MAX_PHOTO_BYTES, 'invalid-input', 'Foto excede o limite.');
        const response = await this.request('/object' + key, { method: 'POST', headers: { 'Content-Type': options.metadata.contentType, 'Cache-Control': 'private, no-store', 'x-upsert': 'false' }, body: new Uint8Array(bytes) });
        if (!response.ok) {
          let duplicate = response.status === 409;
          if (response.status === 400) { const body: unknown = await response.json().catch(() => null); duplicate = !!body && typeof body === 'object' && (('error' in body && body.error === 'Duplicate') || ('statusCode' in body && String(body.statusCode) === '409')); }
          throw new ServiceError(duplicate ? 'conflict' : 'unavailable', duplicate ? 'Foto já recebida.' : 'Não foi possível armazenar a foto.');
        }
      },
      delete: async options => {
        ready(); const response = await this.request('/object/' + encodeURIComponent(this.config.bucket), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
        requireThat(response.ok || (options.ignoreNotFound && response.status === 404), 'unavailable', 'Não foi possível remover a foto.');
      },
    };
  }
}
