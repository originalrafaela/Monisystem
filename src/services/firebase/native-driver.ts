import type { AuthDriver } from './index';

/** Small ports allow race/error tests without loading Android native modules in Node. */
export interface NativeAuthBindings {
  googleSignIn(): Promise<string | null>;
  firebaseSignIn(idToken: string): Promise<void>;
  firebaseSignOut(): Promise<void>;
  googleSignOut(): Promise<void>;
  idToken(): Promise<string | null>;
  observe(listener: (uid: string | null) => void): () => void;
}
export function createNativeAuthDriver(bindings: NativeAuthBindings): AuthDriver {
  return {
    async signInWithGoogle() {
      const token = await bindings.googleSignIn();
      if (!token) throw new Error('Login Google cancelado.');
      await bindings.firebaseSignIn(token);
    },
    async signOut() {
      // End the Firebase session even if clearing Google's account selection fails.
      await bindings.firebaseSignOut();
      try { await bindings.googleSignOut(); } catch { /* Firebase session already ended. */ }
    },
    getIdToken: () => bindings.idToken(),
    observeUser: listener => bindings.observe(listener),
  };
}

/** No remote URLs, content providers, traversal or files outside app-owned cache. */
export function validateCaptureUri(uri: string, cacheDirectory: string): void {
  if (!uri.startsWith('file:///') || /[?#\\]/.test(uri)) throw new Error('Arquivo local inválido.');
  const decoded = decodeURIComponent(uri);
  if (decoded.split('/').some(part => part === '..' || part === '.')
    || !decoded.startsWith(cacheDirectory.replace(/\/$/, '') + '/')) throw new Error('Foto fora do cache do aplicativo.');
}
