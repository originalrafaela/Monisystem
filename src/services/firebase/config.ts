export interface FirebaseClientConfiguration {
  readonly environment: 'emulator' | 'development' | 'production';
  readonly projectId: string;
  readonly webClientId: string;
  readonly endpoint: string;
  readonly emulatorHost?: '127.0.0.1' | '10.0.2.2';
}

/** Values are public identifiers; never put service-account keys in EXPO_PUBLIC variables. */
export function readFirebaseClientConfiguration(env: Readonly<Record<string, string | undefined>>): FirebaseClientConfiguration {
  const environment = env.EXPO_PUBLIC_FIREBASE_ENV;
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const webClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const endpoint = env.EXPO_PUBLIC_FIREBASE_API_URL;
  if (!['emulator', 'development', 'production'].includes(environment ?? '') || !projectId
    || !webClientId?.endsWith('.apps.googleusercontent.com') || !endpoint) throw new Error('Configuração Firebase incompleta.');
  if (environment === 'emulator') {
    const emulatorHost = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    if (projectId !== 'demo-monisystem' || !['127.0.0.1', '10.0.2.2'].includes(emulatorHost ?? '')
      || new URL(endpoint).protocol !== 'http:' || new URL(endpoint).hostname !== emulatorHost
      || (new URL(endpoint).pathname !== '/api' && !endpoint.startsWith(`http://${emulatorHost}:5001/demo-monisystem/`))) throw new Error('Configuração de emulador inválida.');
    return { environment: 'emulator', projectId, webClientId, endpoint, emulatorHost: emulatorHost as '127.0.0.1' | '10.0.2.2' };
  }
  if (projectId.startsWith('demo-') || new URL(endpoint).protocol !== 'https:'
    || env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST) throw new Error('Configuração remota inválida.');
  return { environment: environment as 'development' | 'production', projectId, webClientId, endpoint };
}
