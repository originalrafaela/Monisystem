import { createProductionRuntime, createCleanupRunner } from './runtime';
import { createApiServer } from './http';

async function main() {
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Porta inválida.');
  const runtime = await createProductionRuntime();
  const cleanup = createCleanupRunner(runtime.backend);
  const server = createApiServer({ ...runtime, onRequest: () => { void cleanup(); } });
  server.listen(port, '0.0.0.0', () => { console.info('API Monisystem pronta.'); void cleanup(true); });
  const interval = setInterval(() => { void cleanup(); }, 15 * 60_000); interval.unref();
  const stop = () => { clearInterval(interval); server.close(() => { process.exitCode = 0; }); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (require.main === module) void main().catch(() => { console.error('API não iniciada: confira configuração administrativa e bucket privado.'); process.exitCode = 1; });
