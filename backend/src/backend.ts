import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import type { PhotoBucket } from './storage';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import sharp from 'sharp';
import { z } from 'zod';
import type { Category, CategoryId, Region, Coordinates, UserPreferences, PhotoReference } from '../../src/domain/entities';
import type { Page } from '../../src/types/result';
import {
  coordinatesSchema, createReportSchema, feedSchema, preferencesSchema, categorySchema, idSchema,
  DAY, RETENTION, MAX_CANDIDATES, MAX_PHOTO_BYTES, requireThat, hash, meters, regionContains,
} from './core';
import { time, millis, profileDto, reportDto, incidentDto, metricDto } from './persistence';

export interface BackendOptions {
  readonly now?: () => number;
  /** No production policy is assumed. Tests explicitly supply synthetic values. */
  readonly metricRetentionDays?: number;
  readonly notificationSelection?: 'intersection';
}
const photoSchema = z.object({ storagePath: z.string().max(300), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const emptyPreferences: UserPreferences = { followedRegionIds: [], followedCategoryIds: [], priorityCategoryIds: [], notificationsEnabled: false };

export class Backend {
  readonly now: () => number;
  constructor(readonly db: Firestore, readonly bucket: PhotoBucket, readonly options: BackendOptions = {}) {
    this.now = options.now ?? Date.now;
    if (options.metricRetentionDays !== undefined) requireThat(Number.isInteger(options.metricRetentionDays) && options.metricRetentionDays > 0 && options.metricRetentionDays <= 14, 'invalid-input', 'Retenção de métricas inválida.');
  }

  async ensureSession(uid: string, displayName?: string) {
    const accountRef = this.db.doc(`accounts/${uid}`);
    return this.db.runTransaction(async tx => {
      const existing = await tx.get(accountRef);
      if (existing.exists) return { uid, publicProfileId: existing.get('publicProfileId') as string };
      const publicProfileId = randomUUID();
      tx.create(accountRef, { publicProfileId, createdAt: time(this.now()) });
      tx.create(this.db.doc(`publicProfiles/${publicProfileId}`), { nickname: displayName?.trim().slice(0, 60) || 'Usuário', photo: null });
      tx.create(this.db.doc(`accounts/${uid}/preferences/main`), emptyPreferences);
      return { uid, publicProfileId };
    });
  }

  async getOwnProfile(uid: string) {
    const session = await this.ensureSession(uid);
    const doc = await this.db.doc(`publicProfiles/${session.publicProfileId}`).get();
    requireThat(doc.exists, 'not-found', 'Perfil inexistente.');
    return profileDto(doc.id, doc.data()!);
  }

  async updateOwnProfile(uid: string, raw: unknown) {
    const input = z.object({ nickname: z.string().trim().min(1).max(60), photo: photoSchema.nullable() }).strict().parse(raw);
    const session = await this.ensureSession(uid);
    const ref = this.db.doc(`publicProfiles/${session.publicProfileId}`);
    await this.db.runTransaction(async tx => {
      const current = await tx.get(ref);
      let newUpload: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      if (input.photo) {
        const uploads = await tx.get(this.db.collection('uploads').where('processedPath', '==', input.photo.storagePath).limit(1));
        newUpload = uploads.docs[0];
        requireThat(newUpload && newUpload.get('ownerUid') === uid && newUpload.get('purpose') === 'profile', 'forbidden', 'Foto não pertence ao perfil.');
        const samePhoto = current.get('photo')?.storagePath === input.photo.storagePath;
        requireThat(samePhoto || (newUpload.get('status') === 'ready' && millis(newUpload.get('expiresAt')) > this.now()), 'conflict', 'Upload indisponível.');
        requireThat(hash(newUpload.get('photo')) === hash(input.photo), 'invalid-input', 'Referência de foto inválida.');
      }
      const oldPath = current.get('photo')?.storagePath;
      const oldUploads = oldPath && oldPath !== input.photo?.storagePath
        ? await tx.get(this.db.collection('uploads').where('processedPath', '==', oldPath).limit(1)) : null;
      if (newUpload) tx.update(newUpload.ref, { status: 'linked', profileId: session.publicProfileId });
      for (const old of oldUploads?.docs ?? []) tx.update(old.ref, { status: 'ready', expiresAt: time(this.now()) });
      tx.update(ref, input);
    });
    return this.getOwnProfile(uid);
  }

  async getPreferences(uid: string): Promise<UserPreferences> {
    await this.ensureSession(uid);
    const doc = await this.db.doc(`accounts/${uid}/preferences/main`).get();
    return preferencesSchema.parse(doc.data()) as UserPreferences;
  }

  async savePreferences(uid: string, raw: unknown): Promise<UserPreferences> {
    const input = preferencesSchema.parse(raw);
    await this.ensureSession(uid);
    const refs = [...input.followedRegionIds.map(id => this.db.doc(`regions/${id}`)),
      ...new Set([...input.followedCategoryIds, ...input.priorityCategoryIds]).values()].map(ref => typeof ref === 'string' ? this.db.doc(`categories/${ref}`) : ref);
    if (refs.length) {
      const docs = await this.db.getAll(...refs);
      requireThat(docs.every(doc => doc.exists), 'invalid-input', 'Região ou categoria inexistente.');
    }
    await this.db.doc(`accounts/${uid}/preferences/main`).set(input);
    return input as UserPreferences;
  }

  async getCategories(): Promise<Category[]> {
    const snapshot = await this.db.collection('categories').limit(8).get();
    return snapshot.docs.map(doc => {
      const data = z.object({ label: z.string(), alertDurationSeconds: z.number().positive().max(RETENTION / 1000), groupingDistanceMeters: z.number().positive().max(5_000), groupingWindowSeconds: z.number().positive().max(RETENTION / 1000) }).parse(doc.data());
      return { id: categorySchema.parse(doc.id), ...data };
    });
  }

  async getRegions(): Promise<Region[]> {
    const snapshot = await this.db.collection('regions').limit(101).get();
    requireThat(snapshot.size <= 100, 'unavailable', 'Catálogo regional excede o limite do MVP.');
    return snapshot.docs.map(doc => {
      // Firestore cannot persist arrays of arrays: each ring is a map of points.
      const data = z.object({ name: z.string(), boundary: z.array(z.object({ points: z.array(coordinatesSchema).min(4) })).min(1) }).parse(doc.data());
      const boundary = data.boundary.map(ring => ring.points);
      requireThat(boundary.every(ring => hash(ring[0]) === hash(ring[ring.length - 1])), 'unavailable', 'Fronteira não fechada.');
      return { id: doc.id, name: data.name, boundary };
    });
  }

  async reservePhoto(uid: string, raw: unknown) {
    const { purpose } = z.object({ purpose: z.enum(['profile', 'report']) }).strict().parse(raw);
    const uploadId = randomUUID();
    const stagingPath = `staging/${uid}/${uploadId}/original`;
    const processedPath = `processed/${uploadId}/photo.jpg`;
    const expiresAt = this.now() + 30 * 60_000;
    await this.db.runTransaction(async tx => {
      const quota = this.db.doc(`uploadQuotas/${uid}`);
      const doc = await tx.get(quota);
      const windowStart = doc.exists ? millis(doc.get('windowStart')) : 0;
      const count = this.now() - windowStart < 60_000 ? doc.get('count') as number : 0;
      requireThat(count < 10, 'unavailable', 'Limite temporário de uploads atingido.');
      tx.set(quota, { windowStart: time(count ? windowStart : this.now()), count: count + 1, deleteAfter: time(expiresAt) });
      tx.create(this.db.doc(`uploads/${uploadId}`), { ownerUid: uid, purpose, stagingPath, processedPath, status: 'reserved', expiresAt: time(expiresAt), createdAt: time(this.now()) });
    });
    return { uploadId, stagingPath, expiresAt };
  }

  /** App sends only reserved bytes to our API; administrative Storage credentials stay here. */
  async uploadPhoto(uid: string, path: string, bytes: Buffer, contentType: string): Promise<void> {
    requireThat(bytes.length > 0 && bytes.length <= MAX_PHOTO_BYTES, 'invalid-input', 'Foto deve ter até 5 MiB.');
    requireThat(['image/jpeg', 'image/png', 'image/webp'].includes(contentType), 'invalid-input', 'Tipo de imagem inválido.');
    const match = /^staging\/([^/]+)\/([a-zA-Z0-9_-]+)\/original$/.exec(path);
    requireThat(match && match[1] === uid, 'forbidden', 'Reserva inválida.');
    const ref = this.db.doc(`uploads/${match[2]}`);
    await this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      requireThat(doc.exists && doc.get('ownerUid') === uid && doc.get('stagingPath') === path, 'forbidden', 'Upload indisponível.');
      requireThat(doc.get('status') === 'reserved' && !doc.get('uploadReceived') && millis(doc.get('expiresAt')) > this.now(), 'conflict', 'Upload ocupado, recebido ou expirado.');
      tx.update(ref, { status: 'uploading', processingStartedAt: time(this.now()) });
    });
    try {
      await this.bucket.file(path).save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'private, no-store' }, preconditionOpts: { ifGenerationMatch: 0 } });
      await this.db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        requireThat(doc.exists && doc.get('status') === 'uploading' && millis(doc.get('expiresAt')) > this.now(), 'conflict', 'Upload expirado durante envio.');
        tx.update(ref, { status: 'reserved', uploadReceived: true });
      });
    } catch (error) {
      await this.db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (doc.exists && doc.get('status') === 'uploading') tx.update(ref, { status: 'failed', expiresAt: time(this.now()) });
      });
      throw error;
    }
  }

  async completePhoto(uid: string, raw: unknown) {
    const { uploadId } = z.object({ uploadId: idSchema }).strict().parse(raw);
    const ref = this.db.doc(`uploads/${uploadId}`);
    const upload = await this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      requireThat(doc.exists && doc.get('ownerUid') === uid, 'forbidden', 'Upload indisponível.');
      requireThat(millis(doc.get('expiresAt')) > this.now(), 'conflict', 'Upload expirado.');
      requireThat(['reserved', 'ready'].includes(doc.get('status')), 'conflict', 'Upload ocupado ou consumido.');
      if (doc.get('status') === 'reserved') tx.update(ref, { status: 'processing', processingStartedAt: time(this.now()) });
      return doc.data()!;
    });
    if (upload.status === 'ready') return { uploadId, photo: photoSchema.parse(upload.photo) };
    try {
      const file = this.bucket.file(upload.stagingPath);
      const [metadata] = await file.getMetadata();
      requireThat(Number(metadata.size) > 0 && Number(metadata.size) <= MAX_PHOTO_BYTES, 'invalid-input', 'Tamanho de imagem inválido.');
      requireThat(['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType ?? ''), 'invalid-input', 'Tipo de imagem inválido.');
      const [bytes] = await file.download();
      const decoder = sharp(bytes, { limitInputPixels: 24_000_000, animated: false });
      const meta = await decoder.metadata();
      requireThat(['jpeg', 'png', 'webp'].includes(meta.format ?? '') && (meta.pages ?? 1) === 1, 'invalid-input', 'Formato inválido.');
      const { data, info } = await decoder.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const photo: PhotoReference = { storagePath: upload.processedPath, contentType: 'image/jpeg', width: info.width, height: info.height };
      await this.bucket.file(upload.processedPath).save(data, { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
      await this.db.runTransaction(async tx => {
        const current = await tx.get(ref);
        requireThat(current.get('status') === 'processing' && millis(current.get('expiresAt')) > this.now(), 'conflict', 'Upload expirado durante processamento.');
        tx.update(ref, { status: 'ready', photo });
      });
      // A staging-delete failure does not invalidate a committed ready image. Cleanup retries it.
      try { await file.delete({ ignoreNotFound: true }); } catch { /* tracked by upload reservation */ }
      return { uploadId, photo };
    } catch (error) {
      await this.db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (doc.exists && doc.get('status') === 'processing') tx.update(ref, { status: 'failed', expiresAt: time(this.now()) });
      });
      throw error;
    }
  }

  async discardPhoto(uid: string, raw: unknown): Promise<void> {
    const { uploadId } = z.object({ uploadId: idSchema }).strict().parse(raw);
    await this.db.runTransaction(async tx => {
      const ref = this.db.doc(`uploads/${uploadId}`); const doc = await tx.get(ref);
      requireThat(doc.exists && doc.get('ownerUid') === uid, 'forbidden', 'Upload indisponível.');
      requireThat(!['linked', 'processing', 'uploading'].includes(doc.get('status')), 'conflict', 'Foto vinculada ou em processamento.');
      tx.update(ref, { status: 'discarded', expiresAt: time(this.now()) });
    });
  }

  private geoQueries(categoryId: CategoryId, location: Coordinates, radius: number) {
    return geohashQueryBounds([location.latitude, location.longitude], radius).map(([start, end]) =>
      this.db.collection('incidents').where('categoryId', '==', categoryId).orderBy('geohash').startAt(start).endAt(end).limit(MAX_CANDIDATES + 1));
  }

  async createReport(uid: string, raw: unknown) {
    const input = createReportSchema.parse(raw);
    const session = await this.ensureSession(uid);
    const operationRef = this.db.doc(`operations/${hash([uid, input.idempotencyKey])}`);
    const fingerprint = hash(input);
    const existing = await operationRef.get();
    if (existing.exists) return this.replay(existing.data()!, fingerprint);
    const categories = await this.getCategories();
    const category = categories.find(item => item.id === input.categoryId);
    requireThat(category, 'invalid-input', 'Categoria sem política configurada.');
    const regions = (await this.getRegions()).filter(region => regionContains(region, input.location));
    requireThat(regions.length === 1, 'invalid-input', 'Localização fora da cobertura ou fronteira ambígua.');
    const regionId = regions[0]!.id;
    const reportRef = this.db.collection('reports').doc();
    const incidentRef = this.db.collection('incidents').doc();
    await this.db.runTransaction(async tx => {
      const operation = await tx.get(operationRef);
      if (operation.exists) {
        requireThat(operation.get('fingerprint') === fingerprint, 'conflict', 'Chave reutilizada com outra entrada.');
        return;
      }
      // A category-wide version serializes selection, including the no-candidate case.
      // This deliberately favors correctness over throughput for the academic MVP.
      const gateRef = this.db.doc(`groupingGates/${input.categoryId}`);
      const gate = await tx.get(gateRef);
      const uploadRef = this.db.doc(`uploads/${input.photoUploadId}`);
      const upload = await tx.get(uploadRef);
      requireThat(upload.exists && upload.get('ownerUid') === uid && upload.get('purpose') === 'report', 'forbidden', 'Foto inválida para publicação.');
      const now = this.now();
      requireThat(upload.get('status') === 'ready' && millis(upload.get('expiresAt')) > now, 'conflict', 'Foto não está pronta.');
      const candidates = await Promise.all(this.geoQueries(input.categoryId, input.location, category.groupingDistanceMeters).map(query => tx.get(query)));
      requireThat(candidates.every(snapshot => snapshot.size <= MAX_CANDIDATES), 'unavailable', 'Área excede o limite de agrupamento local.');
      const unique = new Map(candidates.flatMap(snapshot => snapshot.docs.map(doc => [doc.id, doc] as const)));
      const eligible = [...unique.values()].filter(doc => {
        const data = doc.data();
        return data.regionId === regionId && millis(data.alertExpiresAt) > now && millis(data.deleteAfter) > now
          && now - millis(data.createdAt) <= category.groupingWindowSeconds * 1000
          && meters(input.location, data.location) <= category.groupingDistanceMeters;
      }).sort((a, b) => meters(input.location, a.get('location')) - meters(input.location, b.get('location')) || a.id.localeCompare(b.id));
      const selected = eligible[0];
      const target = selected?.ref ?? incidentRef;
      const deleteAfter = now + RETENTION;
      const alertExpiresAt = Math.min(deleteAfter, now + category.alertDurationSeconds * 1000);
      const metricRef = this.db.doc(`regionalMetrics/${hash([regionId, input.categoryId, Math.floor(now / DAY)])}`);
      const metric = this.options.metricRetentionDays ? await tx.get(metricRef) : null;
      const geohash = geohashForLocation([input.location.latitude, input.location.longitude]);
      tx.set(gateRef, { version: (gate.get('version') ?? 0) + 1 });
      tx.create(reportRef, { publicProfileId: session.publicProfileId, incidentId: target.id,
        title: input.title ?? null, description: input.description, categoryId: input.categoryId, photo: upload.get('photo'), location: input.location,
        geohash, regionId, ownerUid: uid, uploadId: upload.id,
        createdAt: time(now), alertExpiresAt: time(alertExpiresAt), deleteAfter: time(deleteAfter), deletionState: 'retained' });
      if (selected) tx.update(target, { reportCount: FieldValue.increment(1), updatedAt: time(now),
        alertExpiresAt: time(Math.max(millis(selected.get('alertExpiresAt')), alertExpiresAt)),
        deleteAfter: time(Math.max(millis(selected.get('deleteAfter')), deleteAfter)) });
      else tx.create(target, { categoryId: input.categoryId, location: input.location, geohash, regionId,
        reportCount: 1, createdAt: time(now), updatedAt: time(now), alertExpiresAt: time(alertExpiresAt), deleteAfter: time(deleteAfter) });
      tx.update(uploadRef, { status: 'linked', reportId: reportRef.id, expiresAt: time(deleteAfter) });
      tx.create(operationRef, { ownerUid: uid, fingerprint, reportId: reportRef.id, deleteAfter: time(deleteAfter) });
      if (metric && this.options.metricRetentionDays) {
        const periodStart = Math.floor(now / DAY) * DAY;
        tx.set(metricRef, { regionId, categoryId: input.categoryId, periodStart: time(periodStart), periodEnd: time(periodStart + DAY),
          reportCount: (metric.get('reportCount') ?? 0) + 1, incidentCount: (metric.get('incidentCount') ?? 0) + (selected ? 0 : 1),
          updatedAt: time(now), deleteAfter: time(periodStart + DAY + this.options.metricRetentionDays * DAY) });
      }
    }, { maxAttempts: 10 });
    return this.replay((await operationRef.get()).data()!, fingerprint);
  }

  private async replay(operation: DocumentData, fingerprint: string) {
    requireThat(operation.fingerprint === fingerprint, 'conflict', 'Chave reutilizada com outra entrada.');
    requireThat(millis(operation.deleteAfter) > this.now(), 'not-found', 'Publicação fora da retenção.');
    const doc = await this.db.doc(`reports/${operation.reportId}`).get();
    requireThat(doc.exists && millis(doc.get('deleteAfter')) > this.now() && doc.get('deletionState') === 'retained', 'not-found', 'Publicação indisponível.');
    return reportDto(doc.id, doc.data()!);
  }

  async getFeed(uid: string, raw: unknown) {
    const query = feedSchema.parse(raw);
    const filters = { ...query, categoryIds: [...new Set(query.categoryIds)].sort(), regionIds: [...new Set(query.regionIds)].sort(), cursor: null };
    return this.page(uid, 'incidents', filters, query.cursor, query.limit, async () => {
      const bounds = geohashQueryBounds([query.center.latitude, query.center.longitude], query.radiusMeters);
      const snapshots = await Promise.all(bounds.map(([start, end]) => this.db.collection('incidents').orderBy('geohash').startAt(start).endAt(end).limit(MAX_CANDIDATES + 1).get()));
      requireThat(snapshots.every(snapshot => snapshot.size <= MAX_CANDIDATES), 'unavailable', 'Área muito densa; refine os filtros.');
      const docs = new Map(snapshots.flatMap(snapshot => snapshot.docs.map(doc => [doc.id, doc] as const)));
      requireThat(docs.size <= MAX_CANDIDATES, 'unavailable', 'Área excede o limite de candidatos.');
      return [...docs.values()].filter(doc => this.feedEligible(doc.data(), query)).sort((a, b) => millis(b.get('updatedAt')) - millis(a.get('updatedAt')) || a.id.localeCompare(b.id)).map(doc => doc.id);
    }, data => this.feedEligible(data, query));
  }

  private feedEligible(data: DocumentData, query: z.infer<typeof feedSchema>) {
    return millis(data.alertExpiresAt) > this.now() && millis(data.deleteAfter) > this.now()
      && (!query.categoryIds.length || query.categoryIds.includes(data.categoryId))
      && (!query.regionIds.length || query.regionIds.includes(data.regionId))
      && meters(query.center, data.location) <= query.radiusMeters;
  }

  async getIncidentReports(uid: string, raw: unknown) {
    const query = z.object({ incidentId: idSchema, cursor: z.string().max(1024).nullable() }).strict().parse(raw);
    return this.reportPage(uid, { type: 'incident', incidentId: query.incidentId }, query.cursor,
      this.db.collection('reports').where('incidentId', '==', query.incidentId).orderBy('createdAt', 'desc'));
  }
  async getRegionalHistory(uid: string, raw: unknown) {
    const query = z.object({ regionId: idSchema, categoryIds: z.array(categorySchema).max(7), cursor: z.string().max(1024).nullable() }).strict().parse(raw);
    return this.reportPage(uid, { type: 'region', regionId: query.regionId, categoryIds: [...new Set(query.categoryIds)].sort() }, query.cursor,
      this.db.collection('reports').where('regionId', '==', query.regionId).orderBy('createdAt', 'desc'), query.categoryIds);
  }
  private async reportPage(uid: string, filters: unknown, cursor: string | null, query: FirebaseFirestore.Query, categories: CategoryId[] = []) {
    return this.page(uid, 'reports', filters, cursor, 25, async () => {
      const snapshot = await query.limit(MAX_CANDIDATES + 1).get();
      requireThat(snapshot.size <= MAX_CANDIDATES, 'unavailable', 'Histórico excede o limite local.');
      return snapshot.docs.filter(doc => millis(doc.get('deleteAfter')) > this.now() && doc.get('deletionState') === 'retained' && (!categories.length || categories.includes(doc.get('categoryId')))).map(doc => doc.id);
    }, data => data.deletionState === 'retained' && (!categories.length || categories.includes(data.categoryId)));
  }

  private async page(uid: string, collection: 'reports' | 'incidents', filters: unknown, cursor: string | null,
    limit: number, collect: () => Promise<string[]>, eligible: (data: DocumentData) => boolean): Promise<Page<ReturnType<typeof reportDto> | ReturnType<typeof incidentDto>>> {
    const fingerprint = hash([collection, filters]);
    let sessionId: string; let offset = 0; let ids: string[];
    if (cursor) {
      let decoded: unknown;
      try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { requireThat(false, 'invalid-input', 'Cursor inválido.'); }
      const parsed = z.object({ id: idSchema, offset: z.number().int().min(0).max(MAX_CANDIDATES) }).strict().parse(decoded);
      sessionId = parsed.id; offset = parsed.offset;
      const snapshot = await this.db.doc(`querySessions/${sessionId}`).get();
      requireThat(snapshot.exists && snapshot.get('ownerUid') === uid, 'invalid-input', 'Cursor inválido.');
      requireThat(snapshot.get('fingerprint') === fingerprint && millis(snapshot.get('deleteAfter')) > this.now(), 'invalid-input', 'Cursor expirado ou incompatível.');
      ids = snapshot.get('ids');
    } else {
      ids = await collect(); sessionId = randomUUID();
      await this.db.doc(`querySessions/${sessionId}`).create({ ownerUid: uid, fingerprint, ids, deleteAfter: time(this.now() + 10 * 60_000) });
    }
    const items: (ReturnType<typeof reportDto> | ReturnType<typeof incidentDto>)[] = [];
    while (offset < ids.length && items.length < limit) {
      const id = ids[offset++]!;
      const doc = await this.db.doc(`${collection}/${id}`).get();
      if (doc.exists && millis(doc.get('deleteAfter')) > this.now() && eligible(doc.data()!)) {
        items.push(collection === 'reports' ? reportDto(id, doc.data()!) : incidentDto(id, doc.data()!, this.now()));
      }
    }
    return { items, nextCursor: offset < ids.length ? Buffer.from(JSON.stringify({ id: sessionId, offset })).toString('base64url') : null };
  }

  async registerOwnDevice(uid: string, raw: unknown): Promise<void> {
    const input = z.object({ id: idSchema, pushToken: z.string().min(1).max(4096), platform: z.enum(['android', 'ios']), updatedAt: z.number().finite() }).strict().parse(raw);
    await this.ensureSession(uid);
    await this.db.runTransaction(async tx => {
      const accountRef = this.db.doc(`accounts/${uid}`);
      const account = await tx.get(accountRef);
      const deviceRef = accountRef.collection('devices').doc(input.id);
      const devices = await tx.get(accountRef.collection('devices').limit(11));
      requireThat(devices.docs.some(doc => doc.id === input.id) || devices.size < 10,
        'invalid-input', 'Limite de dez dispositivos por conta.');
      tx.update(accountRef, { deviceVersion: (account.get('deviceVersion') ?? 0) + 1 });
      tx.set(deviceRef, { pushToken: input.pushToken, platform: input.platform, updatedAt: time(this.now()) });
    });
  }
  async unregisterOwnDevice(uid: string, raw: unknown): Promise<void> {
    const { deviceId } = z.object({ deviceId: idSchema }).strict().parse(raw);
    await this.db.doc(`accounts/${uid}/devices/${deviceId}`).delete();
  }

  async getRegionalMetrics(raw: unknown) {
    const input = z.object({ regionId: idSchema, categoryIds: z.array(categorySchema).max(7) }).strict().parse(raw);
    requireThat(this.options.metricRetentionDays, 'unavailable', 'Política de métricas ainda não aprovada.');
    const snapshot = await this.db.collection('regionalMetrics').where('regionId', '==', input.regionId).orderBy('periodStart', 'desc').limit(200).get();
    return snapshot.docs.filter(doc => millis(doc.get('deleteAfter')) > this.now() && (!input.categoryIds.length || input.categoryIds.includes(doc.get('categoryId')))).map(doc => metricDto(doc.data()!));
  }

  async readPhoto(uid: string, raw: unknown) {
    const { storagePath } = z.object({ storagePath: z.string().regex(/^processed\/[a-zA-Z0-9_-]+\/photo\.jpg$/) }).strict().parse(raw);
    const uploads = await this.db.collection('uploads').where('processedPath', '==', storagePath).limit(1).get();
    const upload = uploads.docs[0];
    requireThat(upload, 'not-found', 'Foto indisponível.');
    const data = upload.data();
    if (data.status === 'linked' && data.reportId) {
      const report = await this.db.doc(`reports/${data.reportId}`).get();
      requireThat(report.exists && report.get('deletionState') === 'retained' && millis(report.get('deleteAfter')) > this.now(), 'not-found', 'Foto expirada.');
    } else if (data.status === 'linked' && data.profileId) {
      const profile = await this.db.doc(`publicProfiles/${data.profileId}`).get();
      requireThat(profile.exists && profile.get('photo')?.storagePath === storagePath, 'not-found', 'Foto indisponível.');
    } else requireThat(data.ownerUid === uid && data.status === 'ready' && millis(data.expiresAt) > this.now(), 'forbidden', 'Foto indisponível.');
    const [bytes] = await this.bucket.file(storagePath).download();
    return bytes;
  }

  /** Builds jobs only; deliberately no FCM/Expo transport or credentials. */
  async planNotifications(reportId: string): Promise<number> {
    requireThat(this.options.notificationSelection === 'intersection', 'unavailable', 'Seleção de notificações pendente de aprovação.');
    const report = await this.db.doc(`reports/${idSchema.parse(reportId)}`).get();
    requireThat(report.exists && millis(report.get('alertExpiresAt')) > this.now() && millis(report.get('deleteAfter')) > this.now(), 'not-found', 'Alerta indisponível.');
    const accounts = await this.db.collection('accounts').limit(101).get();
    requireThat(accounts.size <= 100, 'unavailable', 'Planejamento local limitado a 100 contas.');
    let count = 0;
    for (const account of accounts.docs) {
      const preferences = await this.getPreferences(account.id);
      if (!preferences.notificationsEnabled || !preferences.followedRegionIds.includes(report.get('regionId')) || !preferences.followedCategoryIds.includes(report.get('categoryId'))) continue;
      const priority = (preferences.priorityCategoryIds as readonly CategoryId[]).includes(report.get('categoryId'));
      const devices = await account.ref.collection('devices').limit(10).get();
      for (const device of devices.docs) {
        const job = this.db.doc(`notificationJobs/${hash([report.get('incidentId'), account.id, device.id])}`);
        await this.db.runTransaction(async tx => {
          if ((await tx.get(job)).exists) return;
          tx.create(job, { ownerUid: account.id, deviceId: device.id, incidentId: report.get('incidentId'), categoryId: report.get('categoryId'), regionId: report.get('regionId'), priority,
            status: 'pending', createdAt: time(this.now()), deleteAfter: report.get('alertExpiresAt') });
        });
        count++;
      }
    }
    return count;
  }

  /** Explicit local runner; no scheduler or TTL infrastructure is provisioned. */
  async cleanup(): Promise<{ reports: number; uploads: number }> {
    const now = this.now(); let reports = 0; let uploads = 0;
    const expired = await this.db.collection('reports').where('deleteAfter', '<=', time(now)).limit(100).get();
    for (const item of expired.docs) {
      await this.db.runTransaction(async tx => {
        const current = await tx.get(item.ref);
        if (!current.exists) return;
        tx.update(item.ref, { deletionState: 'deleting' });
        tx.set(this.db.doc(`cleanupJobs/${item.id}`), { reportId: item.id, uploadId: current.get('uploadId'), incidentId: current.get('incidentId'), deleteAfter: current.get('deleteAfter') });
      });
    }
    const jobs = await this.db.collection('cleanupJobs').limit(100).get();
    for (const job of jobs.docs) {
      const uploadRef = this.db.doc(`uploads/${job.get('uploadId')}`);
      const upload = await uploadRef.get();
      if (upload.exists) {
        await this.bucket.file(upload.get('stagingPath')).delete({ ignoreNotFound: true });
        await this.bucket.file(upload.get('processedPath')).delete({ ignoreNotFound: true });
      }
      await this.db.runTransaction(async tx => {
        const currentJob = await tx.get(job.ref);
        if (!currentJob.exists) return;
        const reportRef = this.db.doc(`reports/${job.get('reportId')}`);
        const remaining = await tx.get(this.db.collection('reports').where('incidentId', '==', job.get('incidentId')).limit(MAX_CANDIDATES + 1));
        requireThat(remaining.size <= MAX_CANDIDATES, 'unavailable', 'Grupo excede o limite de limpeza local.');
        const retained = remaining.docs.filter(doc => doc.id !== job.get('reportId') && millis(doc.get('deleteAfter')) > now && doc.get('deletionState') === 'retained');
        const incidentRef = this.db.doc(`incidents/${job.get('incidentId')}`);
        // Read the same category gate used by createReport to serialize cleanup/recount.
        const incident = await tx.get(incidentRef);
        const gateRef = incident.exists ? this.db.doc(`groupingGates/${incident.get('categoryId')}`) : null;
        const gate = gateRef ? await tx.get(gateRef) : null;
        if (gateRef) tx.set(gateRef, { version: (gate?.get('version') ?? 0) + 1 });
        tx.delete(reportRef); tx.delete(uploadRef); tx.delete(job.ref);
        if (!retained.length) tx.delete(incidentRef);
        else tx.update(incidentRef, { reportCount: retained.length, updatedAt: time(now),
          alertExpiresAt: time(Math.max(...retained.map(doc => millis(doc.get('alertExpiresAt'))))),
          deleteAfter: time(Math.max(...retained.map(doc => millis(doc.get('deleteAfter'))))) });
      });
      reports++;
    }
    const abandoned = await this.db.collection('uploads').where('expiresAt', '<=', time(now)).limit(100).get();
    for (const item of abandoned.docs) {
      const claimed = await this.db.runTransaction(async tx => {
        const doc = await tx.get(item.ref);
        if (!doc.exists || doc.get('status') === 'linked' || millis(doc.get('expiresAt')) > now) return null;
        if (['processing', 'uploading'].includes(doc.get('status')) && millis(doc.get('processingStartedAt')) + 120_000 > now) return null;
        tx.update(item.ref, { status: 'deleting' });
        return doc.data()!;
      });
      if (!claimed) continue;
      await this.bucket.file(claimed.stagingPath).delete({ ignoreNotFound: true });
      await this.bucket.file(claimed.processedPath).delete({ ignoreNotFound: true });
      await item.ref.delete(); uploads++;
    }
    for (const collection of ['operations', 'querySessions', 'regionalMetrics', 'notificationJobs', 'uploadQuotas']) {
      const docs = await this.db.collection(collection).where('deleteAfter', '<=', time(now)).limit(100).get();
      if (docs.size) { const batch = this.db.batch(); docs.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
    }
    return { reports, uploads };
  }
}
