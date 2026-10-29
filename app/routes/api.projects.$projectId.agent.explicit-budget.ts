import { explicitBudgetSummarySchema } from '~/lib/chat/explicit-budget-summary';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { json } from '~/lib/json-response';

const headers = { 'Cache-Control': 'no-store' };
const unavailable = (status: number) => json({ error: 'BUDGET_UNAVAILABLE' }, { status, headers });

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (request.method !== 'GET') {
    return unavailable(405);
  }

  if (!params.projectId) {
    return unavailable(400);
  }

  try {
    const value = await apiRequest<unknown>(
      request,
      `/projects/${encodeURIComponent(params.projectId)}/agent/explicit-budget`,
      { redirectOn401: false },
    );

    const result = explicitBudgetSummarySchema.safeParse(value);

    return result.success ? json(result.data, { headers }) : unavailable(503);
  } catch {
    return unavailable(503);
  }
}

export function action() {
  return unavailable(405);
}
