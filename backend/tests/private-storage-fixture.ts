import { createServer } from 'node:http';
/** Local wire fixture for Supabase REST; never contacts Supabase or creates external resources. */
export function privateStorageFixture() {
  const objects = new Map<string, Buffer>();
  const server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (request.headers.apikey !== 'test-service-key') { response.writeHead(401).end(); return; }
      if (request.method === 'GET' && path === '/storage/v1/bucket/test-photos') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ id: 'test-photos', public: false })); return; }
      if (request.method === 'POST' && path.startsWith('/storage/v1/object/test-photos/')) {
        const name = path.slice('/storage/v1/object/test-photos/'.length);
        if (objects.has(name) || request.headers['x-upsert'] !== 'false') { response.writeHead(409).end(); return; }
        const chunks: Buffer[] = []; for await (const c of request) chunks.push(Buffer.from(c));
        objects.set(name, Buffer.concat(chunks)); response.end('{}'); return;
      }
      if (request.method === 'GET' && path.startsWith('/storage/v1/object/authenticated/test-photos/')) {
        const name = path.slice('/storage/v1/object/authenticated/test-photos/'.length); const object = objects.get(name);
        if (!object) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Length', object.length); response.setHeader('Content-Type', 'image/jpeg'); response.end(object); return;
      }
      if (request.method === 'DELETE' && path === '/storage/v1/object/test-photos') {
        const chunks: Buffer[] = []; for await (const c of request) chunks.push(Buffer.from(c));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { prefixes: string[] }; body.prefixes.forEach(name => objects.delete(name)); response.end('[]'); return;
      }
      response.writeHead(404).end();
    })().catch(() => response.writeHead(500).end());
  });
  return { server, objects };
}
