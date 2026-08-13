import { useEffect, useState } from 'react';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { classNames } from '~/utils/classNames';

interface IntegrationFeatureRequest {
  id: string;
  integrationName: string;
  useCaseDescription: string;
  status: string;
  organizationId: string | null;
  createdAt: string;
  mine: boolean;
}

/*
 * Maps the backend status string (`pending` by default; admins may later move
 * rows to `planned` / `shipped` / `declined`) to a Badge variant. Unknown
 * statuses fall back to a neutral pill so a new status never renders un-styled.
 */
function statusBadgeVariant(status: string): 'warning' | 'info' | 'success' | 'danger' | 'secondary' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'planned':
    case 'in_progress':
      return 'info';
    case 'shipped':
    case 'completed':
      return 'success';
    case 'declined':
    case 'rejected':
      return 'danger';
    default:
      return 'secondary';
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

const textareaClassName =
  'flex min-h-[88px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary ring-offset-bolt-elements-background-depth-1 placeholder:text-bolt-elements-textSecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function RequestIntegrationCard() {
  const [requests, setRequests] = useState<IntegrationFeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [integrationName, setIntegrationName] = useState('');
  const [useCaseDescription, setUseCaseDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/integration-requests')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
      .then((data) => {
        const responseData = data as { requests?: IntegrationFeatureRequest[] };

        if (!cancelled) {
          setRequests(Array.isArray(responseData.requests) ? responseData.requests : []);
          setListError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRequests([]);
          setListError('Could not load your integration requests. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = integrationName.trim();
    const useCase = useCaseDescription.trim();

    if (!name || !useCase || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitted(false);

    try {
      const form = new FormData();
      form.set('integrationName', name);
      form.set('useCaseDescription', useCase);

      const response = await fetch('/api/integration-requests', { method: 'POST', body: form });

      const data = (await response.json().catch(() => ({}))) as {
        request?: IntegrationFeatureRequest;
        error?: string;
      };

      if (!response.ok || !data.request) {
        throw new Error(data.error ?? 'Unable to submit your integration request.');
      }

      setRequests((current) => [data.request as IntegrationFeatureRequest, ...current]);
      setIntegrationName('');
      setUseCaseDescription('');
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit your integration request.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = integrationName.trim().length > 0 && useCaseDescription.trim().length > 0 && !submitting;

  return (
    <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Request an integration</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          Need a connector or service that isn&apos;t available yet? Tell us what you&apos;d build with it.
        </p>
      </div>

      <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="integration-name" className="text-xs font-medium text-bolt-elements-textSecondary">
            Integration name
          </label>
          <Input
            id="integration-name"
            value={integrationName}
            onChange={(event) => setIntegrationName(event.target.value)}
            placeholder="e.g. Notion, Stripe, Twilio"
            maxLength={120}
            disabled={submitting}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="integration-use-case" className="text-xs font-medium text-bolt-elements-textSecondary">
            What would you use it for?
          </label>
          <textarea
            id="integration-use-case"
            className={textareaClassName}
            value={useCaseDescription}
            onChange={(event) => setUseCaseDescription(event.target.value)}
            placeholder="Describe the use case so we can prioritize it."
            maxLength={2000}
            disabled={submitting}
            required
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={classNames(
              'text-xs',
              submitError ? 'text-red-500' : submitted ? 'text-green-500' : 'text-bolt-elements-textTertiary',
            )}
            role={submitError ? 'alert' : undefined}
          >
            {submitError
              ? submitError
              : submitted
                ? 'Thanks! Your request has been recorded.'
                : 'Your request is visible to you and your organization.'}
          </p>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Submitting...' : 'Submit request'}
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t border-bolt-elements-borderColor pt-4">
        <h4 className="text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">Your requests</h4>

        {loading ? (
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">Loading your requests...</p>
        ) : listError ? (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {listError}
          </p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">
            You haven&apos;t requested any integrations yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-2 rounded-lg bg-bolt-elements-background-depth-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                      {request.integrationName}
                    </span>
                    {!request.mine && <span className="text-xs text-bolt-elements-textTertiary">(team)</span>}
                  </div>
                  <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
                    {request.useCaseDescription}
                  </p>
                  {request.createdAt && (
                    <p className="mt-1 text-xs text-bolt-elements-textTertiary">{formatDate(request.createdAt)}</p>
                  )}
                </div>
                <Badge variant={statusBadgeVariant(request.status)} size="md" className="shrink-0 self-start">
                  {formatStatus(request.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
