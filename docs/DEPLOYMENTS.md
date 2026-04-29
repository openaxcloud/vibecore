# User Project Deployments

VibeCore supports project deployments through the SaaS API at `POST /projects/:projectId/deployments`.

## Providers

- `static`: builds and publishes an immutable static artifact.
- `vercel`: uses a scoped provider integration for Vercel projects.
- `netlify`: uses a scoped provider integration for Netlify sites.
- `github-pages`: publishes static output through GitHub integration.
- `cloudflare-pages`: publishes static output through Cloudflare Pages integration.
- `google-cloud-run`: builds a user app artifact and deploys an isolated Cloud Run service.
- `docker`: custom Dockerfile deployment, Enterprise plan only.

## Deployment Wizard Contract

The deployment wizard is available in two places:

- the project page `/projects/:projectId/deployments`
- the existing Bolt IDE Deploy panel opened from `/projects/:projectId/ide?panel=deployments`

Both surfaces submit the same backend contract:

- `provider`
- `environment`: `preview`, `staging`, or `production`
- `buildCommand`
- `outputDirectory`
- optional `framework`
- optional `branch` and GitHub repository URL
- optional `customDomain`
- newline separated environment variables
- explicit user-scoped secret names to inject

The backend validates every field with Zod, checks `deployments.count` quota before creation, audits the action, records a usage event, and stores redacted deployment logs.

## Security

- User deployment secrets are scoped by project and only injected when explicitly requested.
- Logs redact keys and values matching secret/token/password/private key/API key patterns.
- Build commands that attempt privileged Docker, Docker socket access, host networking, or broad host mutations are rejected.
- Build output paths are normalized and path traversal is blocked.
- Custom Dockerfile deploys are blocked unless the organization is on Enterprise.
- Platform secrets are never included in deployment metadata or logs.

## Lifecycle

- `GET /projects/:projectId/deployments`: deployment history.
- `POST /projects/:projectId/deployments`: create deployment.
- `GET /projects/:projectId/deployments/:deploymentId/logs`: redacted logs.
- `POST /projects/:projectId/deployments/:deploymentId/redeploy`: create a new deployment from an existing one.
- `POST /projects/:projectId/deployments/:deploymentId/cancel`: cancel a queued/building deployment record.
- `POST /projects/:projectId/deployments/:deploymentId/rollback`: create a rollback deployment pointing to a previous release.
