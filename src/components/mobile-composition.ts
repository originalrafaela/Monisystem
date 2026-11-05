import { readFirebaseClientConfiguration } from '../services/firebase/config';
import type { MobileServices } from './MobileProvider';
import { currentLocation } from './device-location';
let backendPromise: Promise<Awaited<ReturnType<typeof import('../services/firebase/native').createAndroidFirebaseServices>>> | null = null;
/** SDK creation is shared across UI remounts. Public Expo variables are inlined by Metro. */
export async function composeMobileServices(capturePhoto: () => Promise<string>): Promise<MobileServices> {
  const config = readFirebaseClientConfiguration({
    EXPO_PUBLIC_FIREBASE_ENV: process.env.EXPO_PUBLIC_FIREBASE_ENV,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_FIREBASE_API_URL: process.env.EXPO_PUBLIC_FIREBASE_API_URL,
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
  });
  backendPromise ??= import('../services/firebase/native').then(module => module.createAndroidFirebaseServices(config)).catch(error => { backendPromise = null; throw error; });
  const backend = await backendPromise;
  return { ...backend, capturePhoto, currentLocation,
    async resolvePhoto(path) {
      const result = await backend.readPhoto(path);
      if (!result.ok) throw new Error(result.error.message);
      // Keep protected bytes in memory; no download token, public URL or disk cache.
      const chunks: string[] = [];
      for (let i = 0; i < result.value.length; i += 8192) chunks.push(String.fromCharCode(...result.value.subarray(i, i + 8192)));
      return `data:image/jpeg;base64,${btoa(chunks.join(''))}`;
    },
  };
}
