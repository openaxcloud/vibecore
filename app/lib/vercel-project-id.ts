/**
 * Validates a Vercel project id / name before it is interpolated into upstream
 * Vercel API URLs. Vercel project ids (`prj_…`) and project names use a
 * restricted charset (alphanumerics, `_`, `-`); anything else (`/`, `?`, `&`,
 * `.`, whitespace, etc.) could re-target the request path or inject extra query
 * parameters, so it is rejected. Mirrors the ref validation used by the sibling
 * Supabase routes.
 */
export function isValidVercelProjectId(projectId: unknown): projectId is string {
  return typeof projectId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(projectId);
}
