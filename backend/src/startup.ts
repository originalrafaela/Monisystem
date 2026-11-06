export type StartupCode =
  | 'API_PORT' | 'API_BIND' | 'ENV_MODE' | 'ENV_PROJECT' | 'ENV_EMULATOR'
  | 'ENV_MISSING' | 'FIREBASE_JSON' | 'FIREBASE_FIELDS' | 'FIREBASE_PROJECT'
  | 'SUPABASE_CONFIG' | 'SUPABASE_CONNECT' | 'SUPABASE_HTTP'
  | 'SUPABASE_BUCKET_RESPONSE' | 'SUPABASE_BUCKET_PRIVATE' | 'SUPABASE_BUCKET_ID'
  | 'FIREBASE_INIT' | 'STARTUP_UNKNOWN';

/** Fixed codes and numeric status only. Never retain a provider exception or credentials. */
export class StartupFailure extends Error {
  constructor(readonly step: StartupCode, readonly httpStatus?: number) {
    super(step);
  }
}

export function startupCheck<T>(step: StartupCode, work: () => T): T {
  try { return work(); }
  catch { throw new StartupFailure(step); }
}

export function startupDiagnostic(error: unknown): string {
  if (!(error instanceof StartupFailure)) return 'API_STARTUP_FAILED step=STARTUP_UNKNOWN';
  const status = Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599
    ? ` httpStatus=${error.httpStatus}` : '';
  return `API_STARTUP_FAILED step=${error.step}${status}`;
}
