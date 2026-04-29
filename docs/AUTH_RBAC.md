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

## Audit

`packages/audit` defines critical audit events and metadata redaction. The API records audit logs for critical actions such as auth, org creation, member changes, project creation, workspace creation, snapshots, billing, admin changes, and support tickets.
