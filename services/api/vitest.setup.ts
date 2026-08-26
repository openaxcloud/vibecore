/*
 * Legacy route suites predate tenant reputation fixtures. Keep them in explicit
 * observe-only mode so the security boundary does not rewrite unrelated test
 * intent. tenant-guardrails-routes.spec.ts deletes/sets this value per scenario
 * and therefore proves the real secure default plus enforced negative paths.
 */
process.env.TENANT_GUARDRAILS_ENABLED ??= 'false';
