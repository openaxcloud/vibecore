import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  loadAdminExplicitBudget,
  actionAdminExplicitBudget,
  type AdminExplicitBudgetLoaderData,
  type AdminExplicitBudgetActionData,
} from '~/lib/.server/admin-explicit-budget';
import type { EnterpriseActionArgs, EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getAdminExplicitBudgetCopy } from '~/lib/i18n/catalogs/admin-explicit-budget';

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  return loadAdminExplicitBudget(request);
}

export async function action({ request }: EnterpriseActionArgs) {
  return actionAdminExplicitBudget(request);
}

export default function AdminExplicitBudgetPage() {
  const data = useLoaderData<AdminExplicitBudgetLoaderData>();
  const fetcher = useFetcher<AdminExplicitBudgetActionData>();
  const revalidator = useRevalidator();
  const copy = getAdminExplicitBudgetCopy(data.language);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [refreshedAction, setRefreshedAction] = useState<AdminExplicitBudgetActionData | undefined>();
  const refreshing = useRef(false);
  const busy = fetcher.state !== 'idle' || revalidator.state !== 'idle';
  const currentAction = fetcher.data === refreshedAction ? undefined : fetcher.data;
  const snapshot = currentAction?.snapshot ?? data.snapshot;
  const issue = currentAction?.issue ?? data.issue;
  const granted = snapshot?.grantApplied === true;
  const confirmedGrant = granted && !issue && (!currentAction || currentAction.ok === true);
  const canSubmit = Boolean(snapshot?.eligible && !granted && !attempted && !issue);

  const money = (micros: number) =>
    new Intl.NumberFormat(data.language, { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      setAttempted(true);
      setConfirmed(false);

      if (passwordRef.current) {
        passwordRef.current.value = '';
      }
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (revalidator.state === 'idle' && refreshing.current) {
      refreshing.current = false;
      setRefreshedAction(fetcher.data);
      setAttempted(false);
      setConfirmed(false);

      if (passwordRef.current) {
        passwordRef.current.value = '';
      }
    }
  }, [revalidator.state, fetcher.data]);

  return (
    <EnterpriseFormPage
      title={copy['adminExplicitBudget.title']}
      description={copy['adminExplicitBudget.description']}
      error={issue ? copy[`adminExplicitBudget.${issue}`] : undefined}
      status={confirmedGrant ? copy['adminExplicitBudget.granted'] : undefined}
    >
      <Link to="/admin/projects" className="mb-5 inline-block underline">
        {copy['adminExplicitBudget.back']}
      </Link>
      {busy ? (
        <AsyncPanelSkeleton
          label={
            fetcher.state === 'submitting'
              ? copy['adminExplicitBudget.submitting']
              : copy['adminExplicitBudget.loading']
          }
          rows={2}
        />
      ) : null}
      {snapshot ? (
        <section className="my-5 min-w-0 space-y-4">
          <h2 className="font-semibold">{copy['adminExplicitBudget.scope']}</h2>
          <p className="break-all text-sm">
            {snapshot.organizationSlug} / {snapshot.projectId}
          </p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                [copy['adminExplicitBudget.limit'], snapshot.summary.limitMicros],
                [copy['adminExplicitBudget.reserved'], snapshot.summary.reservedMicros],
                [copy['adminExplicitBudget.remaining'], snapshot.summary.remainingMicros],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="min-w-0 rounded border border-bolt-elements-borderColor p-3">
                <dt className="text-sm">{label}</dt>
                <dd className="mt-1 font-semibold">{money(value)}</dd>
              </div>
            ))}
          </dl>
          {snapshot.permit ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt>{copy['adminExplicitBudget.nextRun']}</dt>
                <dd>{money(snapshot.permit.reservedBudgetMicros)}</dd>
              </div>
              <div>
                <dt>{copy['adminExplicitBudget.calls']}</dt>
                <dd>{snapshot.permit.maxCalls}</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt>{copy['adminExplicitBudget.model']}</dt>
                <dd className="break-words">
                  {snapshot.permit.provider} / {snapshot.permit.model} · {copy['adminExplicitBudget.standard']}
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="text-sm">{copy['adminExplicitBudget.unknownCosts']}</p>
          {!granted ? (
            <>
              <h2 className="font-semibold">{copy['adminExplicitBudget.proposal']}</h2>
              <p>{copy['adminExplicitBudget.constraint']}</p>
            </>
          ) : null}
          {!granted && !snapshot.eligible ? <p role="status">{copy['adminExplicitBudget.blocked']}</p> : null}
        </section>
      ) : null}
      {canSubmit && snapshot ? (
        <fetcher.Form method="post" className="my-5 space-y-4" aria-busy={busy}>
          <input type="hidden" name="intent" value="extend" />
          <input type="hidden" name="reviewToken" value={snapshot.reviewToken} />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
              required
              className="mt-1"
            />
            <span>{copy['adminExplicitBudget.confirmation']}</span>
          </label>
          <label className="block" htmlFor="budget-admin-password">
            {copy['adminExplicitBudget.password']}
          </label>
          <input
            ref={passwordRef}
            id="budget-admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            className="w-full min-w-0 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
          />
          <PrimaryButton type="submit" disabled={busy || !confirmed}>
            {busy ? copy['adminExplicitBudget.submitting'] : copy['adminExplicitBudget.activate']}
          </PrimaryButton>
        </fetcher.Form>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          refreshing.current = true;
          setConfirmed(false);

          if (passwordRef.current) {
            passwordRef.current.value = '';
          }

          revalidator.revalidate();
        }}
        className="min-h-11 rounded border border-bolt-elements-borderColor px-4 py-2 disabled:opacity-50"
      >
        {copy['adminExplicitBudget.refresh']}
      </button>
    </EnterpriseFormPage>
  );
}
