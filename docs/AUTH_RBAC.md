# Auth And RBAC

## Auth

`packages/auth` provides password hashing, opaque session token creation, token hashing, and secure cookie options. The API accepts either:

- `Authorization: Bearer <session-token>`
- `session` httpOnly cookie

The current implementation uses opaque rotating-ready sessions stored by hash. The API never logs raw tokens.

## Organization Isolation

Resources are scoped as:

- Organization owns projects, billing, usage, support tickets, feature flags, audit logs.
- Project belongs to one organization.
- Workspace belongs to one project.
- Snapshots and deployments belong to one project.

Handlers resolve the parent organization before returning project/workspace/deployment/snapshot data.

## RBAC

`packages/rbac` defines backend permissions. Frontend checks are never authoritative.

Default roles:

- `owner`: full org, project, workspace, billing, admin, support, usage.
- `admin`: member/project/workspace/billing read/support/usage.
- `member`: project and workspace read/write.
- `viewer`: read-only project/workspace/usage.

Custom organization roles are persisted per organization and are resolved by the API during every `requireOrg` permission check. A custom role can only use known backend permissions, and system role keys cannot be overwritten.

## Team Management

Team membership is a backend-enforced production flow:

- `GET /orgs/:orgId/memberships` lists organization members.
- `POST /orgs/:orgId/memberships` adds a real user to an organization.
- `PATCH /orgs/:orgId/memberships/:userId` updates a member role.
- `DELETE /orgs/:orgId/memberships/:userId` removes a member.
- `POST /orgs/:orgId/invitations` creates email invitations.
- `POST /invitations/accept` accepts invitations with quota checks.
- `/invitations/accept?token=...` provides the authenticated UI flow for accepting an invitation.
- `GET /orgs/:orgId/roles` lists custom roles for role management and member assignment.
- `POST /orgs/:orgId/roles` creates custom roles.

The API blocks removal or demotion of the last organization owner. `team.members` quota is enforced when adding members through direct membership changes, invitation acceptance, SAML just-in-time provisioning and SCIM provisioning.

## Audit

`packages/audit` defines critical audit events and metadata redaction. The API records audit logs for critical actions such as auth, org creation, member changes, project creation, workspace creation, snapshots, billing, admin changes, and support tickets.
