import { createHash } from 'node:crypto';
import { z } from 'zod';
import { distanceBetween } from 'geofire-common';
import type { Coordinates, Region } from '../../src/domain/entities';
import type { ServiceErrorCode, Result } from '../../src/types/result';

export const DAY = 86_400_000;
export const RETENTION = 14 * DAY;
export const MAX_CANDIDATES = 2_000;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const categorySchema = z.enum(['traffic', 'accident', 'waterlogging', 'flood', 'fallen-tree', 'infrastructure', 'other']);
export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const createReportSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  idempotencyKey: z.string().min(8).max(128),
  description: z.string().trim().min(1).max(2_000),
  categoryId: categorySchema,
  photoUploadId: idSchema,
  location: coordinatesSchema,
}).strict();
export const feedSchema = z.object({
  center: coordinatesSchema,
  // Local safety ceiling. Increasing it requires review, not a silent clamp.
  radiusMeters: z.number().finite().positive().max(5_000),
  categoryIds: z.array(categorySchema).max(7),
  regionIds: z.array(idSchema).max(50),
  cursor: z.string().max(1024).nullable(),
  limit: z.number().int().min(1).max(50),
}).strict();
export const preferencesSchema = z.object({
  followedRegionIds: z.array(idSchema).max(50),
  followedCategoryIds: z.array(categorySchema).max(7),
  priorityCategoryIds: z.union([z.tuple([]), z.tuple([categorySchema]), z.tuple([categorySchema, categorySchema]), z.tuple([categorySchema, categorySchema, categorySchema])]),
  notificationsEnabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
  for (const field of ['followedRegionIds', 'followedCategoryIds', 'priorityCategoryIds'] as const) {
    if (new Set(value[field]).size !== value[field].length) ctx.addIssue({ code: 'custom', path: [field], message: 'Valores repetidos.' });
  }
});

export class ServiceError extends Error {
  constructor(readonly code: ServiceErrorCode, message: string) { super(message); }
}
export function requireThat(condition: unknown, code: ServiceErrorCode, message: string): asserts condition {
  if (!condition) throw new ServiceError(code, message);
}
export async function result<T>(work: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await work() }; }
  catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: { code: error.code, message: error.message } };
    if (error instanceof z.ZodError) return { ok: false, error: { code: 'invalid-input', message: 'Entrada inválida.' } };
    return { ok: false, error: { code: 'unavailable', message: 'Serviço temporariamente indisponível.' } };
  }
}
export function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function meters(a: Coordinates, b: Coordinates): number {
  return distanceBetween([a.latitude, a.longitude], [b.latitude, b.longitude]) * 1000;
}

function onSegment(p: Coordinates, a: Coordinates, b: Coordinates): boolean {
  const cross = (p.longitude - a.longitude) * (b.latitude - a.latitude) - (p.latitude - a.latitude) * (b.longitude - a.longitude);
  return Math.abs(cross) < 1e-12 && p.longitude >= Math.min(a.longitude, b.longitude)
    && p.longitude <= Math.max(a.longitude, b.longitude) && p.latitude >= Math.min(a.latitude, b.latitude)
    && p.latitude <= Math.max(a.latitude, b.latitude);
}
function inRing(p: Coordinates, ring: readonly Coordinates[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!; const b = ring[i + 1]!;
    if (onSegment(p, a, b)) return true;
    if ((a.latitude > p.latitude) !== (b.latitude > p.latitude)
      && p.longitude < (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}
export function regionContains(region: Region, p: Coordinates): boolean {
  const [outer, ...holes] = region.boundary;
  return !!outer && inRing(p, outer) && !holes.some(hole => inRing(p, hole));
}

/** Refuse all real projects and all non-loopback service hosts. No ADC fallback. */
export function assertLocalEnvironment(env: NodeJS.ProcessEnv): void {
  requireThat(env.GCLOUD_PROJECT === 'demo-monisystem', 'unavailable', 'Somente o projeto demo-monisystem é permitido.');
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    requireThat(/^127\.0\.0\.1:\d+$/.test(env[key] ?? ''), 'unavailable', `Emulador local obrigatório: ${key}.`);
  }
}
