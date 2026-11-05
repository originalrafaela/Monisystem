/** Domain dates use UTC milliseconds; Firebase adapters convert Timestamp at the boundary. */
export type Instant = number;
export type CategoryId =
  | 'traffic'
  | 'accident'
  | 'waterlogging'
  | 'flood'
  | 'fallen-tree'
  | 'infrastructure'
  | 'other';

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Object references, never permanent public download URLs. */
export interface PhotoReference {
  readonly storagePath: string;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly width: number;
  readonly height: number;
}

/** Public identifier must not expose the Firebase Authentication UID. */
export interface PublicProfile {
  readonly id: string;
  readonly nickname: string;
  readonly photo: PhotoReference | null;
}

export interface PrivateAccount {
  readonly uid: string;
  readonly publicProfileId: string;
  readonly createdAt: Instant;
}

export type PriorityCategories =
  | readonly []
  | readonly [CategoryId]
  | readonly [CategoryId, CategoryId]
  | readonly [CategoryId, CategoryId, CategoryId];

export interface UserPreferences {
  readonly followedRegionIds: readonly string[];
  readonly followedCategoryIds: readonly CategoryId[];
  readonly priorityCategoryIds: PriorityCategories;
  readonly notificationsEnabled: boolean;
}

export interface Category {
  readonly id: CategoryId;
  readonly label: string;
  /** Server-controlled policy; initial durations still require a product decision. */
  readonly alertDurationSeconds: number;
  readonly groupingDistanceMeters: number;
  readonly groupingWindowSeconds: number;
}

export interface Region {
  readonly id: string;
  readonly name: string;
  /** Closed rings: first outer boundary, remaining rings holes. */
  readonly boundary: readonly (readonly Coordinates[])[];
}

/** Every report is retained independently of its incident grouping. */
export interface Report {
  readonly id: string;
  readonly publicProfileId: string;
  readonly incidentId: string;
  readonly description: string;
  readonly categoryId: CategoryId;
  readonly photo: PhotoReference;
  readonly location: Coordinates;
  readonly geohash: string;
  readonly regionId: string;
  readonly createdAt: Instant;
  readonly alertExpiresAt: Instant;
  readonly deleteAfter: Instant;
}

export interface Incident {
  readonly id: string;
  readonly categoryId: CategoryId;
  readonly location: Coordinates;
  readonly geohash: string;
  readonly regionId: string;
  readonly state: 'active' | 'expired';
  readonly reportCount: number;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly alertExpiresAt: Instant;
  readonly deleteAfter: Instant;
}

export interface RegionalMetric {
  readonly regionId: string;
  readonly categoryId: CategoryId;
  readonly periodStart: Instant;
  readonly periodEnd: Instant;
  readonly reportCount: number;
  readonly incidentCount: number;
  readonly updatedAt: Instant;
}

/** Owner-only collection; never returned by public profile/feed services. */
export interface NotificationDevice {
  readonly id: string;
  readonly pushToken: string;
  readonly platform: 'android' | 'ios';
  readonly updatedAt: Instant;
}
