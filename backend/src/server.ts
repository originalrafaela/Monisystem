import { createProductionRuntime, createCleanupRunner } from './runtime';
import { createApiServer } from './http';
import { StartupFailure, startupDiagnostic } from './startup';

async function main() {
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new StartupFailure('API_PORT');
  const runtime = await createProductionRuntime();
  const cleanup = createCleanupRunner(runtime.backend);
  const server = createApiServer({ ...runtime, onRequest: () => { void cleanup(); } });
  server.once('error', () => { console.error(startupDiagnostic(new StartupFailure('API_BIND'))); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => { console.info('API Monisystem pronta.'); void cleanup(true); });
  const interval = setInterval(() => { void cleanup(); }, 15 * 60_000); interval.unref();
  const stop = () => { clearInterval(interval); server.close(() => { process.exitCode = 0; }); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (require.main === module) void main().catch(error => { console.error(startupDiagnostic(error)); process.exitCode = 1; });
