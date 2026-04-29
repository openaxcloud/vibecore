# Database

The database package is `packages/database`.

## Stack

- PostgreSQL
- Prisma schema: `packages/database/prisma/schema.prisma`
- Seed: `packages/database/prisma/seed.ts`
- Generated client output: `packages/database/generated/client`

## Required models

The schema includes:

`User`, `Account`, `Session`, `Organization`, `OrganizationMember`, `OrganizationInvite`, `Role`, `Permission`, `Project`, `ProjectEnvironment`, `ProjectSecret`, `Workspace`, `WorkspaceSession`, `WorkspacePort`, `FileSnapshot`, `ProjectSnapshot`, `Deployment`, `DeploymentEnvironment`, `AuditLog`, `AdminAuditLog`, `BillingCustomer`, `Subscription`, `Plan`, `UsageEvent`, `QuotaLedger`, `AiConversation`, `AiMessage`, `AiToolCall`, `AiTokenUsage`, `AbuseEvent`, `SupportTicket`, `FeatureFlag`, `ApiKey`, `OAuthConnection`, plus `SystemSetting`.

## Local migration

```bash
docker compose -f docker-compose.dev.yml up -d postgres
export DATABASE_URL="postgresql://vibecore:vibecore@localhost:5432/vibecore"
pnpm --filter @vibecore/database db:generate
pnpm --filter @vibecore/database db:migrate
pnpm --filter @vibecore/database db:seed
```

Use `db:deploy` in CI/production.
