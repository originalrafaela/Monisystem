import type {
  Category, CategoryId, Coordinates, Incident, NotificationDevice, PhotoReference,
  PublicProfile, Region, RegionalMetric, Report, UserPreferences,
} from '../domain/entities';
import type { Page, Result } from '../types/result';

export interface Session {
  readonly uid: string;
  readonly publicProfileId: string;
}

export interface AuthService {
  signInWithGoogle(): Promise<Result<Session>>;
  signOut(): Promise<Result<void>>;
  observeSession(listener: (session: Session | null) => void): () => void;
}

export interface ProfileService {
  getOwnProfile(): Promise<Result<PublicProfile>>;
  updateOwnProfile(input: { readonly nickname: string; readonly photo: PhotoReference | null }): Promise<Result<PublicProfile>>;
  getPreferences(): Promise<Result<UserPreferences>>;
  savePreferences(input: UserPreferences): Promise<Result<UserPreferences>>;
}

export interface FeedQuery {
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly categoryIds: readonly CategoryId[];
  readonly regionIds: readonly string[];
  readonly cursor: string | null;
  readonly limit: number;
}

export interface CreateReportInput {
  readonly idempotencyKey: string;
  readonly description: string;
  readonly categoryId: CategoryId;
  readonly photoUploadId: string;
  readonly location: Coordinates;
}

export interface ReportService {
  create(input: CreateReportInput): Promise<Result<Report>>;
  getFeed(query: FeedQuery): Promise<Result<Page<Incident>>>;
  getIncidentReports(incidentId: string, cursor: string | null): Promise<Result<Page<Report>>>;
  getRegionalHistory(query: {
    readonly regionId: string;
    readonly categoryIds: readonly CategoryId[];
    readonly cursor: string | null;
  }): Promise<Result<Page<Report>>>;
}

export interface PhotoUpload {
  readonly uploadId: string;
  readonly photo: PhotoReference;
}

export interface PhotoService {
  upload(input: { readonly localUri: string; readonly purpose: 'profile' | 'report' }): Promise<Result<PhotoUpload>>;
  discard(uploadId: string): Promise<Result<void>>;
}

export interface CatalogService {
  getCategories(): Promise<Result<readonly Category[]>>;
  getRegions(): Promise<Result<readonly Region[]>>;
}

export interface MetricsService {
  getRegionalMetrics(regionId: string, categoryIds: readonly CategoryId[]): Promise<Result<readonly RegionalMetric[]>>;
}

export interface NotificationService {
  registerOwnDevice(device: NotificationDevice): Promise<Result<void>>;
  unregisterOwnDevice(deviceId: string): Promise<Result<void>>;
}
