import { z } from 'zod';

/** A reservation balance, never a statement of historical provider expenditure. */
export const explicitBudgetSummarySchema = z
  .object({
    scope: z.literal('explicit-runs-only'),
    currency: z.literal('USD'),
    limitMicros: z.literal(20000000),
    reservedMicros: z.number().int().min(0).max(20000000),
    remainingMicros: z.number().int().min(0).max(20000000),
    runCount: z.number().int().nonnegative(),
    historicalCostsIncluded: z.literal(false),
    totalRecipeRemainingMicros: z.null(),
  })
  .refine((value) => value.reservedMicros + value.remainingMicros === value.limitMicros);
export type ExplicitBudgetSummary = z.infer<typeof explicitBudgetSummarySchema>;
