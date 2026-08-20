// Framework-agnostic API error — services throw it, the Next.js layer maps it
// to the HTTP envelope. Keeping it free of next/* imports lets services run in
// scripts and integration tests outside the Next runtime.

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}
