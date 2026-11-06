import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Backend } from './backend';
import { MAX_PHOTO_BYTES, requireThat, result, ServiceError } from './core';
import { dispatchOperation } from './operations';

export interface ApiOptions {
  backend: Backend;
  verifyToken(token: string): Promise<{ uid: string; name?: string }>;
  onRequest?: () => void;
}
const statuses = { unauthenticated: 401, forbidden: 403, 'invalid-input': 400, 'not-found': 404, conflict: 409, unavailable: 503 } as const;
async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = request.headers['content-length'];
  requireThat(declared === undefined || (/^\d+$/.test(declared) && Number(declared) <= limit), 'invalid-input', 'Requisição excede o limite.');
  const parts: Buffer[] = []; let size = 0;
  for await (const raw of request) {
    const part = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += part.length;
    requireThat(size <= limit, 'invalid-input', 'Requisição excede o limite.');
    parts.push(part);
  }
  return Buffer.concat(parts);
}
/** No CORS wildcard or administrative endpoint. All application operations require Firebase identity. */
export function createApiHandler(options: ApiOptions): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    void (async () => {
      const outcome = await result(async () => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) return { status: 'ready' };
        requireThat(request.method === 'POST' && ['/api', '/api/upload'].includes(url.pathname), 'not-found', 'Rota indisponível.');
        const authorization = request.headers.authorization;
        requireThat(authorization && authorization.startsWith('Bearer ') && authorization.length <= 8192, 'unauthenticated', 'Sessão obrigatória.');
        let identity: { uid: string; name?: string };
        try { identity = await options.verifyToken(authorization.slice(7)); }
        catch { throw new ServiceError('unauthenticated', 'Sessão inválida.'); }
        requireThat(!!identity.uid && identity.uid.length <= 128, 'unauthenticated', 'Sessão inválida.');
        options.onRequest?.();
        const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
        if (url.pathname === '/api/upload') {
          requireThat(url.searchParams.getAll('path').length === 1 && [...url.searchParams.keys()].every(key => key === 'path'), 'invalid-input', 'Reserva inválida.');
          requireThat(contentType && ['image/jpeg', 'image/png', 'image/webp'].includes(contentType), 'invalid-input', 'Tipo de imagem inválido.');
          const bytes = await readBody(request, MAX_PHOTO_BYTES);
          await options.backend.uploadPhoto(identity.uid, url.searchParams.get('path')!, bytes, contentType);
          return undefined;
        }
        requireThat(!url.search && contentType === 'application/json', 'invalid-input', 'Use JSON.');
        const bytes = await readBody(request, 64 * 1024);
        let body: unknown;
        try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new ServiceError('invalid-input', 'JSON inválido.'); }
        return dispatchOperation(options.backend, identity.uid, body, identity.name);
      });
      if (response.destroyed) return;
      if (outcome.ok && Buffer.isBuffer(outcome.value)) {
        response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(outcome.value); return;
      }
      const status = outcome.ok ? 200 : statuses[outcome.error.code];
      const value = outcome.ok ? { ok: true, value: outcome.value ?? null } : outcome;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value));
      // A rejected request must not retain an unread request body/socket indefinitely.
      if (!request.readableEnded) request.resume();
    })().catch(() => {
      if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json' });
      if (!response.writableEnded) response.end(JSON.stringify({ ok: false, error: { code: 'unavailable', message: 'Serviço temporariamente indisponível.' } }));
    });
  };
}
export function createApiServer(options: ApiOptions) {
  const server = createServer(createApiHandler(options));
  server.headersTimeout = 15_000; server.requestTimeout = 65_000; server.keepAliveTimeout = 5_000;
  return server;
}
