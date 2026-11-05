import type { CategoryId, Coordinates, Report } from '../domain/entities';
import type { PhotoService, ReportService, CreateReportInput } from '../services/contracts';
export interface PublicationDraft {
  readonly photoUri: string; readonly description: string;
  readonly categoryId: CategoryId; readonly location: Coordinates;
}
/** Retains the exact input after a possibly committed request; retries cannot duplicate it. */
export class PublicationAttempt {
  private uploadId: string | null = null;
  private input: CreateReportInput | null = null;
  private key = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private flight: Promise<Report> | null = null;
  constructor(private photos: PhotoService, private reports: ReportService) {}
  get awaitingResult() { return this.input !== null; }
  submit(draft: PublicationDraft): Promise<Report> {
    if (this.flight) return this.flight;
    this.flight = this.send(draft).finally(() => { this.flight = null; });
    return this.flight;
  }
  private async send(draft: PublicationDraft): Promise<Report> {
    if (!this.input) {
      if (!this.uploadId) {
        const upload = await this.photos.upload({ localUri: draft.photoUri, purpose: 'report' });
        if (!upload.ok) throw new Error(upload.error.message);
        this.uploadId = upload.value.uploadId;
      }
      this.input = { idempotencyKey: this.key, description: draft.description.trim(), categoryId: draft.categoryId, photoUploadId: this.uploadId, location: { ...draft.location } };
    }
    const result = await this.reports.create(this.input);
    if (!result.ok) {
      if (result.error.code !== 'unavailable' && result.error.code !== 'unauthenticated') {
        const abandoned = this.uploadId;
        this.input = null; this.uploadId = null;
        this.key = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (abandoned) { try { await this.photos.discard(abandoned); } catch { /* Server retention cleans abandoned reservations. */ } }
      }
      throw new Error(result.error.message);
    }
    this.uploadId = null; this.input = null;
    this.key = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return result.value;
  }
}
export function validateCoordinates(latitude: string, longitude: string): Coordinates | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const numeric = /^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
  if (!numeric.test(latitude.trim()) || !numeric.test(longitude.trim())) return null;
  const lat = Number(latitude.replace(',', '.')); const lon = Number(longitude.replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}
