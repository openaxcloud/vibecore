# Custom Domains

Custom domains are attached to project deployments through the deployment wizard and organization domain verification APIs.

## Flow

1. Add a domain in organization settings.
2. Verify DNS ownership through `/orgs/:orgId/domains/:domain/verify`.
3. Select the verified domain in the project deployment wizard.
4. Deploy to `production`.
5. The deployment stores `customDomain` and the provider-specific URL remains available as fallback.

## Requirements

- Domain ownership must be verified before production traffic is routed.
- Preview deployments should use generated VibeCore URLs unless explicitly approved.
- TLS certificates are provisioned by the provider integration.
- Domain operations are audited.

## Safety

- No project can claim a domain owned by another organization.
- Domain mappings must be environment-specific.
- Rollback keeps the same domain mapping while switching the target deployment.
