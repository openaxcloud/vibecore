# Billing, credits and quotas — local proof, 1 November 2026

Base: `a9f8b02b737e775b68a34d29e33124e5662ec63c`. No Stripe calls, real payment,
production data or infrastructure changes. Local services were disposable and
bound only to loopback; they are now stopped. This evidence does not establish
provider configuration or successful production payment delivery.

## Defect and fix

A wallet hold and its reservation previously committed separately. If insertion
failed, `heldCents` stayed raised without a reclaimable reservation. Release and
settlement likewise persisted terminal status before lowering the hold; a failure
in the second write stranded the hold permanently. A PostgreSQL fault-injection
regression demonstrated all three failures (3 failing, 1 concurrency passing).
Each operation now uses one Prisma transaction. Its conditional UPDATE retains
concurrent overspend and double-release protection. No schema change is needed.

The fix prevents new drift; it does not reset historical balances. Any suspected
production drift needs read-only reconciliation of wallet holds against HELD
reservations before a separately reviewed adjustment.

## Fresh results

| Exercise                                                                      | Result                                             | Scope / limit                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fifteen existing API credit/quota suites                                      | 115 passed, 0 failed, 3 skipped initially          | Three deployment-quota cases need real Redis.                                                                    |
| Redis-dependent deployment-quota suite                                        | 6 passed, 0 failed, 0 skipped                      | Includes all three initially skipped cases; local Redis 7.                                                       |
| Filtered existing billing API routes                                          | 20 passed, 0 failed                                | 111 unrelated cases deliberately excluded by name filter; not counted as run.                                    |
| Existing credit-pack PostgreSQL scenarios                                     | 6 passed, 0 skipped                                | Two connections, retries, rollback, receipt conflicts, coupon replay.                                            |
| Explicit budget PostgreSQL scenarios                                          | 4 passed, 0 skipped                                | Competing holds, replay rejection and persistence.                                                               |
| Combined post-fix reservation/pack PostgreSQL + reservation/store unit suites | 32 passed, 0 failed, 0 skipped                     | Includes new four-case regression; overlaps existing pack/unit results above.                                    |
| API TypeScript and build                                                      | Both exit 0                                        | Build emitted to `/tmp/api-billing-build`.                                                                       |
| ESLint                                                                        | New spec clean; changed methods have no diagnostic | Whole pre-existing Prisma store remains nonclean (106 errors, 1 warning in baseline); no unrelated lint cleanup. |
| GitHub Actions pinning / diff check                                           | Pass                                               | 30 YAML files, no temporary pinning exception.                                                                   |

Counts overlap and must not be summed. Source hashes and individual test names
are in `billing-local-evidence.json`. PostgreSQL used the exact pinned pgvector
image from existing CI; all repository migrations applied. A first stock
PostgreSQL attempt lacked the required vector extension and failed migration;
no migration was bypassed or altered.

The mandatory existing PostgreSQL workflow now runs both credit-pack and
reservation specs and requires exactly 10 passes, zero skips, the tested commit
and both source hashes. Remote CI and deployment remain separate evidence.

## Remaining launch evidence

An existing authorized Stripe sandbox must exercise checkout, invoice success,
failure/recovery, renewal, cancellation and duplicate delivery, with a reconciled
catalogue and credits. The environment reports no configured credentials and
has no Stripe destination permission; none was requested or created. Local
signed fixtures prove application behavior only. Production `BILLING_CREDITS_ENABLED`,
plan catalogue, provider price IDs, webhook configuration, and wallet drift have
not been read or certified by this exercise.
