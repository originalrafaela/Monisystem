import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Backend } from './backend';
import { assertLocalEnvironment } from './core';
import { createProductionRuntime } from './runtime';

/** Safe MVP runner. Production scheduling is deliberately not provisioned. */
async function main() {
  if (process.env.MONISYSTEM_ENV === 'production') {
    if (!process.argv.includes('--confirm-project=monisystem-f6d63')) throw Error('Confirmação explícita do projeto obrigatória.');
    const runtime = await createProductionRuntime();
    console.info(JSON.stringify(await runtime.backend.cleanup()));
    return;
  }
  assertLocalEnvironment(process.env);
  const app = initializeApp({ projectId: 'demo-monisystem', storageBucket: 'demo-monisystem.appspot.com' });
  const backend = new Backend(getFirestore(app), getStorage(app).bucket());
  const counts = await backend.cleanup();
  console.info(JSON.stringify(counts));
}
void main().catch(() => { console.error('Falha na limpeza. Confira o ambiente autorizado e reexecute.'); process.exitCode = 1; });
