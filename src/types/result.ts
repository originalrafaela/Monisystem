export type ServiceErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-input'
  | 'not-found'
  | 'conflict'
  | 'unavailable';

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: ServiceErrorCode; readonly message: string } };

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
