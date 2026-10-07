-- P7 Replit-parity cutover: rename the legacy flat-rate Plan rows to the canonical
-- Starter/Core/Pro/Enterprise keys IN PLACE, so every existing Subscription (which
-- references a plan by its immutable `planId`, not by key) automatically moves to
-- the correct new plan without touching the Subscription table.
--
-- Mapping (matches migrateLegacyPlanKey in @vibecore/billing and docs/REPLIT_PARITY_SPEC.md §2.A):
--   legacy 'free'        -> 'starter'
--   legacy 'pro'  (€29)  -> 'core'    (€25, the closest tier)
--   legacy 'team' (€99)  -> 'pro'     (€100, the new top self-serve tier)
--   'enterprise'         unchanged
--
-- seedBillingPlans() refreshes each renamed row's name/prices/limits from the
-- credit catalog at boot, so this migration only has to move the KEYS. The pro<->core
-- rename is a two-way swap, so it steps through a temporary key to never violate
-- Plan.key's unique constraint. Guards keep it a no-op when the canonical rows
-- already exist (e.g. a fresh install seeded by new code), so it is safe to replay.

UPDATE "Plan" SET "key" = '__legacy_pro'
  WHERE "key" = 'pro' AND NOT EXISTS (SELECT 1 FROM "Plan" p WHERE p."key" = 'core');

UPDATE "Plan" SET "key" = 'pro'
  WHERE "key" = 'team' AND NOT EXISTS (SELECT 1 FROM "Plan" p WHERE p."key" = 'pro');

UPDATE "Plan" SET "key" = 'core'
  WHERE "key" = '__legacy_pro';

UPDATE "Plan" SET "key" = 'starter'
  WHERE "key" = 'free' AND NOT EXISTS (SELECT 1 FROM "Plan" p WHERE p."key" = 'starter');
