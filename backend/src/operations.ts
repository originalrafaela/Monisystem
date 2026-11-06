import { z } from 'zod';
import type { Backend } from './backend';
import { ServiceError } from './core';

/** Single dispatch table shared by legacy emulators and the Render HTTP server. */
export async function dispatchOperation(backend: Backend, uid: string, body: unknown, displayName?: string): Promise<unknown> {
  const { operation, input } = z.object({ operation: z.string().max(80), input: z.unknown() }).strict().parse(body);
  switch (operation) {
    case 'ensureSession': return backend.ensureSession(uid, displayName);
    case 'getOwnProfile': return backend.getOwnProfile(uid);
    case 'updateOwnProfile': return backend.updateOwnProfile(uid, input);
    case 'getPreferences': return backend.getPreferences(uid);
    case 'savePreferences': return backend.savePreferences(uid, input);
    case 'getCategories': return backend.getCategories();
    case 'getRegions': return backend.getRegions();
    case 'reservePhoto': return backend.reservePhoto(uid, input);
    case 'completePhoto': return backend.completePhoto(uid, input);
    case 'discardPhoto': return backend.discardPhoto(uid, input);
    case 'createReport': return backend.createReport(uid, input);
    case 'getFeed': return backend.getFeed(uid, input);
    case 'getIncidentReports': return backend.getIncidentReports(uid, input);
    case 'getRegionalHistory': return backend.getRegionalHistory(uid, input);
    case 'getRegionalMetrics': return backend.getRegionalMetrics(input);
    case 'registerOwnDevice': return backend.registerOwnDevice(uid, input);
    case 'unregisterOwnDevice': return backend.unregisterOwnDevice(uid, input);
    case 'readPhoto': return backend.readPhoto(uid, input);
    default: throw new ServiceError('invalid-input', 'Operação desconhecida.');
  }
}
