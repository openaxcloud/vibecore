# SSO and SCIM

## OIDC and Microsoft Entra ID

OIDC settings are managed with `PUT /orgs/:orgId/sso/oidc`.

Required fields:

- `issuer`
- `clientId`
- `clientSecret`

Optional fields:

- `authorizationUrl`
- `tokenUrl`
- `jwksUrl`
- `enabled`

The API validates URL fields and encrypts the full config before storage. Updating OIDC settings requires `security:manage` and recent administrator re-authentication.

## SAML SSO

SAML settings are managed with `PUT /orgs/:orgId/sso/saml`.

Required fields:

- `entityId`
- `ssoUrl`
- `x509Certificate`

The public metadata endpoint is `GET /auth/saml/metadata/:orgId`. SAML configs are encrypted before storage and require `security:manage` plus recent administrator re-authentication.

The ACS endpoint is:

```http
POST /auth/saml/:orgId/acs
```

It requires an enabled organization SAML config, decodes the SAML response, validates the XML assertion signature against the configured certificate, maps `NameID`/`email`, `externalId`/`sub`, `name` and optional `roleKey`, then creates or links the user and membership.

## Domain verification

Enterprise domain records are managed with:

- `GET /orgs/:orgId/domains`
- `POST /orgs/:orgId/domains`
- `POST /orgs/:orgId/domains/:domain/verify`

Domain verification records contain a generated verification token and `verifiedAt` timestamp. The verification endpoint records the verified state and audit trail for the domain workflow.

## SCIM

SCIM tokens are created with `POST /orgs/:orgId/scim/tokens`.

The raw token is returned once. Only the token hash is stored.

SCIM endpoints:

- `GET /scim/v2/:orgId/Users`
- `POST /scim/v2/:orgId/Users`

SCIM requests authenticate with `Authorization: Bearer <scim_token>`. Provisioning creates a user when needed and adds a `member` organization membership.

## Security rules

- SSO and SCIM management requires backend RBAC, never only frontend checks.
- SSO configuration is encrypted at rest.
- SCIM tokens are hashed at rest.
- All SSO, SCIM token and provisioning changes are audited.
- Enterprise IP allowlist enforcement applies to organization-scoped API calls.
- Production SSO/OAuth/OIDC/SAML configuration must pass `pnpm production:validate`; external discovery and metadata reachability must pass `pnpm production:validate:live` before production traffic is enabled.
