import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import { RevealButton } from '~/components/ui/RevealButton';
import type { SecretRequestField, SecretRequestMessage } from '~/lib/chat/connector-messages';
import { formatChatConnectorsCopy, getChatConnectorsCopy } from '~/lib/i18n/catalogs/chat-connectors';

/*
 * Inline card rendered when the agent emits a secret_request data
 * part. Mirrors the visual language of the Replit "Set up <Service>
 * API" modal but lives inline in the chat. The card POSTs the
 * collected fields to /api/projects/:projectId/secrets so the value
 * lands in the encrypted ProjectSecret table (the same store the
 * server-side code uses today). The agent resumes once the client
 * acknowledges the resumeToken.
 *
 * For Phase 1 the resume path is fire-and-forget: the next turn the
 * builder sends will carry the updated secret state implicitly. The
 * dedicated /api/agent-runs/:resumeToken/resume endpoint ships in a
 * follow-up commit when secret_request gains a fully blocking flow.
 */

export interface SecretRequestCardProps {
  payload: SecretRequestMessage;
  projectId?: string;
  onProvided?: () => void;
}

/*
 * The upstream filter (AssistantMessage.tsx) only validates that the
 * connector part's `kind` is a string — it never validates `fields`. A
 * secret_request part that survives chat persistence, import, or a
 * future/edge producer can therefore arrive with `fields` undefined or
 * non-array. Since there is no error boundary around the message list, a
 * naive `payload.fields.map(...)` read would throw and blank the entire
 * transcript. This accessor normalizes the optional array to a safe value.
 */
export function getSecretFields(payload: Pick<SecretRequestMessage, 'fields'>): SecretRequestField[] {
  return Array.isArray(payload.fields) ? payload.fields : [];
}

/*
 * The secrets store (projects.$projectId.secrets.tsx) persists `value` as a
 * raw scalar string and the runtime injects it verbatim as an environment
 * variable. The common single-field case (e.g. an API key) must therefore be
 * stored as the raw value, NOT a JSON-encoded object — otherwise the app
 * receives the literal string `{"OPENAI_API_KEY":"sk-..."}` instead of the
 * key. Only when a request genuinely collects more than one field do we
 * JSON-pack the map under a single secretKey; consumers of such a secret must
 * `JSON.parse` it to recover the individual values.
 */
export function buildSecretValue(fields: SecretRequestField[], values: Record<string, string>): string {
  if (fields.length === 1) {
    return values[fields[0].name] ?? '';
  }

  return JSON.stringify(values);
}

export function SecretRequestCard({ payload, projectId, onProvided }: SecretRequestCardProps) {
  const { i18n } = useTranslation();
  const copy = getChatConnectorsCopy(i18n.resolvedLanguage ?? i18n.language);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!projectId) {
      setError(copy['chatConnectors.secret.projectMissing']);
      return;
    }

    const fields = getSecretFields(payload);

    for (const field of fields) {
      if (field.required && !values[field.name]?.trim()) {
        setError(formatChatConnectorsCopy(copy['chatConnectors.secret.fieldRequired'], { field: field.label }));
        return;
      }
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/secrets`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: payload.secretKey, value: buildSecretValue(fields, values) }),
      });

      if (!response.ok) {
        setError(copy['chatConnectors.secret.saveFailed']);

        return;
      }

      setSubmitted(true);
      onProvided?.();
    } catch {
      setError(copy['chatConnectors.secret.saveFailed']);
    } finally {
      setSubmitting(false);
    }
  }, [copy, onProvided, payload, projectId, values]);

  if (submitted) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
        <span className="i-ph:check-circle-fill h-4 w-4 shrink-0 text-bolt-elements-icon-success" aria-hidden />
        <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
          {formatChatConnectorsCopy(copy['chatConnectors.secret.saved'], { name: payload.displayName })}{' '}
          <code className="break-all">{payload.secretKey}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
      <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
        {formatChatConnectorsCopy(copy['chatConnectors.secret.provide'], { name: payload.displayName })}
      </p>
      <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">{payload.description}</p>

      <div className="mt-3 space-y-3">
        {getSecretFields(payload).map((field) => {
          const isSecret = field.type === 'password';

          return (
            <label key={field.name} className="block">
              <span className="text-xs text-bolt-elements-textSecondary">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              <div className="relative mt-1">
                <input
                  type={isSecret && !revealed[field.name] ? 'password' : 'text'}
                  value={values[field.name] ?? ''}
                  placeholder={field.placeholder}
                  disabled={submitting}
                  required={field.required}
                  aria-required={field.required}
                  autoComplete="off"
                  spellCheck={false}
                  style={isSecret ? { fontFamily: 'var(--vc-font-code)' } : undefined}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className={`min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-1 text-sm text-bolt-elements-textPrimary ${
                    isSecret ? 'pl-2 pr-10' : 'px-2'
                  }`}
                />
                {isSecret ? (
                  <RevealButton
                    revealed={Boolean(revealed[field.name])}
                    onToggle={() => setRevealed((current) => ({ ...current, [field.name]: !current[field.name] }))}
                    subject={field.label}
                    className="absolute right-0 top-1/2 min-h-11 min-w-11 -translate-y-1/2"
                  />
                ) : null}
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Button onClick={handleSubmit} disabled={submitting || !projectId} className="min-h-11 whitespace-normal">
          {submitting
            ? copy['chatConnectors.secret.saving']
            : formatChatConnectorsCopy(copy['chatConnectors.secret.save'], { name: payload.displayName })}
        </Button>
        {!projectId ? (
          <span className="text-xs text-bolt-elements-textTertiary">{copy['chatConnectors.secret.projectHint']}</span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-bolt-elements-icon-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
