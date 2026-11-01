import { createHash } from 'node:crypto';
import { buildExplicitRunPermit, type AgentRoutingCard, type ExplicitBudgetExtensionInput } from '@vibecore/billing';
import { agentRoutingCardSchema } from './agent-routing-service.js';

/** Pure preflight: computes a permit but never reserves budget or calls a provider. */
export function extensionPermit(input: {
  projectId: string;
  card?: { version: number; data: unknown };
  provider?: { enabled: boolean; baseUrl?: string | null };
  subscription?: { status: string; planKey: string };
  routingVersion?: number;
}) {
  const parsed = agentRoutingCardSchema.safeParse(input.card?.data);
  if (
    !parsed.success ||
    input.card?.version !== parsed.data.version ||
    (input.routingVersion !== undefined && input.routingVersion !== parsed.data.version) ||
    !input.subscription ||
    !['ACTIVE', 'TRIALING'].includes(input.subscription.status) ||
    input.provider?.enabled !== true ||
    (input.provider.baseUrl && input.provider.baseUrl !== 'https://api.openai.com/v1') ||
    ![undefined, 'false'].includes(process.env.BILLING_CREDITS_ENABLED)
  )
    return undefined;
  try {
    const permit = buildExplicitRunPermit({
      projectId: input.projectId,
      runId: 'extension-proposal-only',
      planKey: input.subscription.planKey,
      card: parsed.data as AgentRoutingCard,
    });
    return permit.provider === 'openai' &&
      permit.model === 'gpt-5.6-luna' &&
      permit.serviceTier === 'default' &&
      permit.maxCalls <= 2 &&
      permit.reservedBudgetMicros <= 15260000
      ? permit
      : undefined;
  } catch {
    return undefined;
  }
}

/** A duplicate authenticated approval keeps its original server timestamp. Other fields still undergo exact CAS. */
export function stableExtensionApproval(
  existing: unknown,
  input: ExplicitBudgetExtensionInput,
): ExplicitBudgetExtensionInput {
  const extension =
    existing && typeof existing === 'object' && 'extension' in existing ? existing.extension : undefined;
  if (
    extension &&
    typeof extension === 'object' &&
    'approvalId' in extension &&
    'approvedBy' in extension &&
    'approvedAt' in extension &&
    extension.approvalId === input.approvalId &&
    extension.approvedBy === input.approvedBy &&
    typeof extension.approvedAt === 'string'
  ) {
    return { ...input, approvedAt: extension.approvedAt };
  }
  return input;
}

/** Canonical baseline digest also remains stable after the single authorized extra reservation. */
export function explicitBudgetSnapshotDigest(value: unknown): string {
  let snapshot = value;
  if (
    value &&
    typeof value === 'object' &&
    'extension' in value &&
    value.extension &&
    typeof value.extension === 'object'
  ) {
    const ledger = value as {
      extension: { baselineRunIds: string[]; baselineReservedMicros: number };
      permits: unknown[];
    };
    const { extension, ...rest } = ledger;
    snapshot = {
      ...rest,
      reservedMicros: extension.baselineReservedMicros,
      runIds: extension.baselineRunIds,
      permits: ledger.permits.slice(0, extension.baselineRunIds.length),
    };
  }
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return '[' + item.map(canonical).join(',') + ']';
    if (item && typeof item === 'object')
      return (
        '{' +
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => JSON.stringify(key) + ':' + canonical(value))
          .join(',') +
        '}'
      );
    return JSON.stringify(item) ?? 'null';
  };
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}
