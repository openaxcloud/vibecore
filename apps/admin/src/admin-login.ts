/**
 * Pure, framework-free helpers for the admin login + action flow.
 *
 * Kept out of `main.tsx` (which has a `createRoot` side effect on import) so
 * the logic stays unit-testable in the plain-node vitest environment used by
 * the rest of `apps/admin`.
 */

/**
 * Builds the JSON body for `POST /auth/login`. MFA-enabled platform admins
 * must send a `mfaCode` (TOTP or recovery code); the API returns 401
 * `AUTH_MFA_REQUIRED` otherwise (services/api/src/app.ts). We only include the
 * key when a code was actually supplied so non-MFA logins keep their shape.
 */
export function buildAdminLoginBody(
  email: string,
  password: string,
  mfaCode?: string,
): { email: string; password: string; mfaCode?: string } {
  const trimmedCode = mfaCode?.trim();
  return {
    email: email.trim(),
    password,
    ...(trimmedCode ? { mfaCode: trimmedCode } : {}),
  };
}

/**
 * Detects the API's "MFA required" failure so the UI can prompt for a code
 * instead of leaving the operator staring at a dead-end error.
 */
export function isMfaRequiredError(message: string): boolean {
  return /MFA code is required|AUTH_MFA_REQUIRED/i.test(message);
}

/**
 * Normalizes an unknown thrown value into a human-readable message for a toast.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
}
