import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  formatConnectionsTabRequestDate,
  formatConnectionsTabRequestHeading,
  getConnectionsTabCopy,
  getConnectionsTabRequestSafeError,
  getConnectionsTabRequestStatusLabel,
} from '~/lib/i18n/catalogs/connections-tab';
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
  switch (
    status
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/gu, '_')
  ) {
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

function parseIntegrationFeatureRequest(value: unknown): IntegrationFeatureRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const request = value as Partial<Record<keyof IntegrationFeatureRequest, unknown>>;

  if (
    typeof request.id !== 'string' ||
    typeof request.integrationName !== 'string' ||
    typeof request.useCaseDescription !== 'string' ||
    typeof request.status !== 'string' ||
    (request.organizationId !== null && typeof request.organizationId !== 'string') ||
    typeof request.createdAt !== 'string' ||
    typeof request.mine !== 'boolean'
  ) {
    return null;
  }

  return {
    id: request.id,
    integrationName: request.integrationName,
    useCaseDescription: request.useCaseDescription,
    status: request.status,
    organizationId: request.organizationId,
    createdAt: request.createdAt,
    mine: request.mine,
  };
}

function parseIntegrationRequestsPayload(value: unknown): IntegrationFeatureRequest[] {
  if (!value || typeof value !== 'object' || !('requests' in value) || !Array.isArray(value.requests)) {
    throw new TypeError();
  }

  const requests = value.requests.map(parseIntegrationFeatureRequest);

  if (requests.some((request) => request === null)) {
    throw new TypeError();
  }

  return requests as IntegrationFeatureRequest[];
}

const textareaClassName =
  'flex min-h-[88px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary ring-offset-bolt-elements-background-depth-1 placeholder:text-bolt-elements-textSecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function RequestIntegrationCard() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getConnectionsTabCopy(language);
  const [requests, setRequests] = useState<IntegrationFeatureRequest[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [integrationName, setIntegrationName] = useState('');
  const [useCaseDescription, setUseCaseDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setLoadState('loading');

    void fetch('/api/integration-requests', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }

        return parseIntegrationRequestsPayload(await response.json());
      })
      .then((nextRequests) => {
        if (!controller.signal.aborted) {
          setRequests(nextRequests);
          setLoadState('success');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRequests([]);
          setLoadState('error');
        }
      });

    return () => controller.abort();
  }, [loadAttempt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = integrationName.trim();
    const useCase = useCaseDescription.trim();

    if (!name || !useCase || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitFailed(false);
    setSubmitted(false);

    try {
      const form = new FormData();
      form.set('integrationName', name);
      form.set('useCaseDescription', useCase);

      const response = await fetch('/api/integration-requests', { method: 'POST', body: form });

      const data: unknown = await response.json().catch(() => null);

      const request =
        data && typeof data === 'object' && 'request' in data ? parseIntegrationFeatureRequest(data.request) : null;

      if (!response.ok || !request) {
        throw new Error();
      }

      setRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
      setLoadState('success');
      setIntegrationName('');
      setUseCaseDescription('');
      setSubmitted(true);
    } catch {
      setSubmitFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = integrationName.trim().length > 0 && useCaseDescription.trim().length > 0 && !submitting;

  return (
    <section
      className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
      aria-labelledby="integration-request-title"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id="integration-request-title" className="break-words text-sm font-medium text-bolt-elements-textPrimary">
          {copy['connectionsTab.request.title']}
        </h3>
        <p className="break-words text-sm text-bolt-elements-textSecondary">
          {copy['connectionsTab.request.description']}
        </p>
      </div>

      <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="integration-name" className="text-xs font-medium text-bolt-elements-textSecondary">
            {copy['connectionsTab.request.nameLabel']}
          </label>
          <Input
            id="integration-name"
            value={integrationName}
            onChange={(event) => {
              setIntegrationName(event.target.value);
              setSubmitFailed(false);
              setSubmitted(false);
            }}
            placeholder={copy['connectionsTab.request.namePlaceholder']}
            maxLength={120}
            disabled={submitting}
            className="!h-11"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="integration-use-case" className="text-xs font-medium text-bolt-elements-textSecondary">
            {copy['connectionsTab.request.useCaseLabel']}
          </label>
          <textarea
            id="integration-use-case"
            className={textareaClassName}
            value={useCaseDescription}
            onChange={(event) => {
              setUseCaseDescription(event.target.value);
              setSubmitFailed(false);
              setSubmitted(false);
            }}
            placeholder={copy['connectionsTab.request.useCasePlaceholder']}
            maxLength={2000}
            disabled={submitting}
            required
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={classNames(
              'min-w-0 flex-1 break-words text-xs',
              submitFailed
                ? 'text-[var(--status-error-text)]'
                : submitted
                  ? 'text-[var(--status-success-text)]'
                  : 'text-bolt-elements-textTertiary',
            )}
            role={submitFailed ? 'alert' : submitted ? 'status' : undefined}
            aria-live="polite"
          >
            {submitFailed
              ? getConnectionsTabRequestSafeError('submit', language)
              : submitted
                ? copy['connectionsTab.request.submitSuccess']
                : copy['connectionsTab.request.visibility']}
          </p>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="!h-auto min-h-11 max-w-full shrink-0 !whitespace-normal break-words py-2 text-center leading-tight"
          >
            {submitting ? copy['connectionsTab.request.submitting'] : copy['connectionsTab.request.submit']}
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t border-bolt-elements-borderColor pt-4">
        <h4 className="break-words text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
          {formatConnectionsTabRequestHeading(requests.length, language)}
        </h4>

        {loadState === 'loading' ? (
          <div className="mt-3" role="status" aria-live="polite" aria-busy="true">
            <p className="text-sm text-bolt-elements-textSecondary">{copy['connectionsTab.request.loading']}</p>
            <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-bolt-elements-background-depth-1" />
              ))}
            </div>
          </div>
        ) : loadState === 'error' ? (
          <div
            className="mt-3 flex min-w-0 flex-col items-start gap-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 sm:flex-row sm:justify-between"
            role="alert"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-[var(--status-error-text)]">
                {copy['connectionsTab.request.loadErrorTitle']}
              </p>
              <p className="mt-1 break-words text-sm text-[var(--status-error-text)]">
                {getConnectionsTabRequestSafeError('load', language)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLoadAttempt((current) => current + 1)}
              className="!h-auto min-h-11 max-w-full shrink-0 !whitespace-normal break-words py-2 text-center leading-tight"
            >
              {copy['connectionsTab.request.retry']}
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <p className="mt-3 break-words text-sm text-bolt-elements-textSecondary" role="status">
            {copy['connectionsTab.request.empty']}
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
                    {!request.mine && (
                      <span className="shrink-0 text-xs text-bolt-elements-textTertiary">
                        ({copy['connectionsTab.request.team']})
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
                    {request.useCaseDescription}
                  </p>
                  {request.createdAt && (
                    <p className="mt-1 text-xs text-bolt-elements-textTertiary">
                      {formatConnectionsTabRequestDate(request.createdAt, language)}
                    </p>
                  )}
                </div>
                <Badge variant={statusBadgeVariant(request.status)} size="md" className="shrink-0 self-start">
                  {getConnectionsTabRequestStatusLabel(request.status, language)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
