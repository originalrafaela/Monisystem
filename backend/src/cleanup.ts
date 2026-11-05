import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Backend } from './backend';
import { assertLocalEnvironment } from './core';

/** Safe MVP runner. Production scheduling is deliberately not provisioned. */
async function main() {
  assertLocalEnvironment(process.env);
  const app = initializeApp({ projectId: 'demo-monisystem', storageBucket: 'demo-monisystem.appspot.com' });
  const backend = new Backend(getFirestore(app), getStorage(app).bucket());
  const counts = await backend.cleanup();
  console.info(JSON.stringify(counts));
}
void main().catch(() => { console.error('Falha na limpeza local. Reexecute após verificar os emuladores.'); process.exitCode = 1; });
