# Account deletion — field-by-field data matrix (§16.12)

What `purgeUserAccount` (services/api/src/prisma-store.ts) does to every model
touching a purged user, and **why**. Three dispositions:

- **deleted** — row removed; re-counted to 0 after purge (folds into
  `ErasureProof.verifiedZeroRemaining`).
- **anonymized** — row kept for a legitimate reason (append-only audit,
  deliverability, retained finance), with **every PII field scrubbed**.
- **retained** — row kept intact under an explicit, consigned reason
  (financial/legal retention); never silent.

A row is only ever *kept* (anonymized/retained) when a reason forbids deletion;
everything else is deleted. The tombstone (`User`) carries `purgedAt` and the
proof is written in the **same transaction** (atomic — reserve #2).

## Deleted (removed entirely)

| Model | Trigger | Notes |
| --- | --- | --- |
| Session, EmailVerificationToken, PasswordResetToken, MfaRecoveryCode | `userId` | credentials/sessions |
| ApiKey | `userId` | |
| Account, OAuthConnection, UserConnection | `userId` | connected identities |
| AiConversation (+AiMessage/AiToolCall/AiTokenUsage cascade), AgentRun, AgentMemory, AgentMemoryPreference, McpInstall, McpUserConfig, AiMessageFeedback, Notification | `userId` | AI history + prompts (free-form content) |
| AgentCheckpoint | sole-org | workspace snapshots of sole orgs |
| ProjectCollaborator, CollaborationPresence, CollaborationComment, ProjectShareLink, UserSpendLimit | `userId` | |
| Project (+files/snapshots/deployments/workspaces/gallery cascade), ImportJob | sole-org | the user's own projects |
| OrganizationMember | `userId` | membership removed everywhere |
| NewsletterSubscriber | `email` | unsubscribed before the tombstone rewrites the address |
| **Subscription** (status flipped to `CANCELED`) | sole-org active subs | **reserve #1**: no orphan future billing; external provider cancelled pre-tx (fail-closed) |

## Anonymized (kept, PII scrubbed) — the reserve-#4 focus

| Model | Field | Disposition |
| --- | --- | --- |
| **User** (tombstone) | email | → `purged-<id>@erased.invalid` |
| | name, passwordHash, mfaSecretCiphertext, language, timezone, emailVerifiedAt, lastActiveAt | → null |
| | platformAdmin, mfaEnabled | → false |
| | preferences | → `{ accountDeletion: { requestedAt, purgedAt } }` only |
| **AuditLog** | ipAddress | → null |
| | metadata (free-form) | → `{ redacted: true, redactedAt }` |
| **AdminAuditLog** | ipAddress | → null |
| | **metadata (free-form)** | → `{ redacted: true, redactedAt }` (reserve #4 — was previously kept) |
| **EmailDeliveryEvent** | email | → `purged-<id>@erased.invalid` (reserve #4 — was previously kept) |
| | subject, fromAddress | → null |
| | payload (free-form provider blob) | → `{ redacted: true, redactedAt }` |
| Organization (sole-org shell) | name, slug, billingEmail | → tombstone / null (kept as anchor for retained finance) |
| UsageEvent, AgentCallLog, LedgerReservation, AgentCheckpoint, ProjectActivity, ImportJob, GalleryListing, SupportTicket | userId / actorUserId / authorUserId | → null (row detached from the user) |

**Free-form payloads** (`metadata`, `payload`) are the reserve-#4 risk: arbitrary
PII (names, emails, prompts) can live in them, so they are **replaced wholesale**
with a redaction marker rather than field-filtered. Covered by
`account-purge-db.spec.ts › (reserve #1,#2,#4)`, which seeds real PII into
`EmailDeliveryEvent.payload` / `AdminAuditLog.metadata` and asserts the markers
after a real-Postgres purge.

## Retained (kept intact, consigned)

| Model | Reason |
| --- | --- |
| UsageEvent / AiCostLedger / CreditLedger / StripeEvent / Subscription (rows) inside the 7-year window | `financial_retention_7y_fail_closed` |
| LedgerTransaction | `ledger_immutable_posted_entries_mig0078` (DB trigger blocks DELETE) |
| Projects of **shared** orgs | `shared_organization_belongs_to_other_members` |

Financial rows *past* the 7-year window are deleted (`canPurgeFinancialRecord`).

## Concurrency (reserve #3)

The sole-vs-shared classification runs under a per-user advisory lock **plus**
`FOR UPDATE` locks on the candidate `Organization` and `OrganizationMember` rows,
so a concurrent add/remove member cannot flip a sole↔shared decision mid-purge.
