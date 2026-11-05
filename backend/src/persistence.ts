import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import type { Incident, Report, PublicProfile, PhotoReference, RegionalMetric } from '../../src/domain/entities';

export const time = (value: number): Timestamp => Timestamp.fromMillis(value);
export function millis(value: unknown): number {
  if (!(value instanceof Timestamp)) throw new Error('Timestamp persistido inválido.');
  return value.toMillis();
}
function photo(data: DocumentData): PhotoReference {
  return { storagePath: data.storagePath, contentType: data.contentType, width: data.width, height: data.height };
}
export function profileDto(id: string, data: DocumentData): PublicProfile {
  return { id, nickname: data.nickname, photo: data.photo ? photo(data.photo) : null };
}
export function reportDto(id: string, data: DocumentData): Report {
  return {
    id, publicProfileId: data.publicProfileId, incidentId: data.incidentId, description: data.description,
    categoryId: data.categoryId, photo: photo(data.photo), location: data.location,
    geohash: data.geohash, regionId: data.regionId, createdAt: millis(data.createdAt),
    alertExpiresAt: millis(data.alertExpiresAt), deleteAfter: millis(data.deleteAfter),
  };
}
export function incidentDto(id: string, data: DocumentData, now: number): Incident {
  return {
    id, categoryId: data.categoryId, location: data.location, geohash: data.geohash, regionId: data.regionId,
    state: millis(data.alertExpiresAt) > now ? 'active' : 'expired', reportCount: data.reportCount,
    createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt),
    alertExpiresAt: millis(data.alertExpiresAt), deleteAfter: millis(data.deleteAfter),
  };
}
export function metricDto(data: DocumentData): RegionalMetric {
  return {
    regionId: data.regionId, categoryId: data.categoryId, periodStart: millis(data.periodStart),
    periodEnd: millis(data.periodEnd), reportCount: data.reportCount, incidentCount: data.incidentCount,
    updatedAt: millis(data.updatedAt),
  };
}
