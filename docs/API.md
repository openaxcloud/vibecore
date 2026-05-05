# SaaS API

The production SaaS backend lives in `services/api` and uses Fastify, Zod validation, structured JSON logs, rate limiting, strict CORS, httpOnly cookies or bearer tokens, and backend RBAC.

## Local

```bash
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL="postgresql://vibecore:vibecore@localhost:5432/vibecore" pnpm --filter @vibecore/database db:migrate
pnpm --filter @vibecore/api dev
```

## Public routes

- `GET /health`
- `GET /ready`
- `POST /auth/register`
- `POST /auth/login`

All other routes require `Authorization: Bearer <token>` or the `session` httpOnly cookie.

## Protected route groups

- `/auth/*`
- `/orgs/*`
- `/projects/*`
- `/workspaces/*`
- `/files/*`
- `/snapshots/*`
- `/ai/*`
- `/billing/*`
- `/admin/*`
- `/usage/*`
- `/deployments/*`
- `/support/*`

Every org, project, workspace, deployment, snapshot, billing, usage, and support route verifies membership server-side before returning data.

## Security defaults

- Zod validates input bodies and params.
- RBAC is enforced in the API handlers.
- Critical mutations create audit events.
- Rate limits are keyed by IP, user, and org header.
- Logs redact authorization, cookies, tokens, secrets, passwords, and API keys.
- Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- CORS only allows configured origins through `API_CORS_ORIGINS`.
