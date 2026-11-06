import { getApp } from '@react-native-firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged, getIdToken, connectAuthEmulator } from '@react-native-firebase/auth';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { File, Paths } from 'expo-file-system';
import { createFirebaseServices, createHttpTransport, readProtectedPhoto, createApiReadiness, uploadProtectedPhoto } from './index';
import type { FirebaseClientConfiguration } from './config';
import { createNativeAuthDriver, validateCaptureUri } from './native-driver';

/** Call once from app composition, after the native Firebase app is configured. */
export function createAndroidFirebaseServices(config: Pick<FirebaseClientConfiguration, 'endpoint' | 'webClientId' | 'emulatorHost'> & Partial<Pick<FirebaseClientConfiguration, 'projectId' | 'environment'>>) {
  if (config.projectId && getApp().options.projectId !== config.projectId) throw new Error('Projeto nativo Firebase incompatível com o ambiente.');
  if (!config.webClientId.endsWith('.apps.googleusercontent.com')) throw new Error('OAuth webClientId obrigatório.');
  GoogleSignin.configure({ webClientId: config.webClientId });
  const auth = getAuth();
  if (config.emulatorHost) {
    const endpoint = new URL(config.endpoint);
    if (endpoint.hostname !== config.emulatorHost || endpoint.protocol !== 'http:') throw new Error('Endpoint de emulador inválido.');
    connectAuthEmulator(auth, `http://${config.emulatorHost}:9099`);
  }
  const driver = createNativeAuthDriver({
    async googleSignIn() {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      return isSuccessResponse(response) ? response.data.idToken : null;
    },
    async firebaseSignIn(token) { await signInWithCredential(auth, GoogleAuthProvider.credential(token)); },
    async firebaseSignOut() { await signOut(auth); },
    async googleSignOut() { await GoogleSignin.signOut(); },
    async idToken() { return auth.currentUser ? getIdToken(auth.currentUser) : null; },
    observe(listener) { return onAuthStateChanged(auth, user => listener(user?.uid ?? null)); },
  });
  const readiness = createApiReadiness({ endpoint: config.endpoint });
  const transport = createHttpTransport({
    endpoint: config.endpoint, auth: driver, readiness,
    async uploadFile(path, localUri) {
      const uid = auth.currentUser?.uid;
      if (!uid || !path.startsWith(`staging/${uid}/`) || !/^staging\/[^/]+\/[a-zA-Z0-9_-]+\/original$/.test(path)) throw new Error('Reserva inválida.');
      validateCaptureUri(localUri, Paths.cache.uri);
      const file = new File(localUri);
      if (!file.exists || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Foto deve ter até 5 MiB.');
      const contentType = file.type;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new Error('Formato inválido.');
      return uploadProtectedPhoto({ endpoint: config.endpoint, auth: driver, stagingPath: path, bytes: await file.bytes(), contentType, readiness });
    },
  });
  return { ...createFirebaseServices(driver, transport),
    readPhoto: (storagePath: string) => readProtectedPhoto({ endpoint: config.endpoint, auth: driver, storagePath, readiness }),
    async resolvePhoto(storagePath: string): Promise<string> {
      const photo = await readProtectedPhoto({ endpoint: config.endpoint, auth: driver, storagePath, readiness });
      if (!photo.ok) throw new Error(photo.error.message);
      const chunks: string[] = [];
      for (let offset = 0; offset < photo.value.length; offset += 8192) {
        chunks.push(String.fromCharCode(...photo.value.subarray(offset, offset + 8192)));
      }
      return `data:image/jpeg;base64,${btoa(chunks.join(''))}`;
    },
  };
}
