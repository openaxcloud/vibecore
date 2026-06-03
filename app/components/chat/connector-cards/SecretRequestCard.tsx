import { useCallback, useState } from 'react';
import { Button } from '~/components/ui/Button';
import type { SecretRequestMessage } from '~/lib/chat/connector-messages';

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

export function SecretRequestCard({ payload, projectId, onProvided }: SecretRequestCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!projectId) {
      setError('No project context — open this connector from a project to save the secret.');
      return;
    }

    for (const field of payload.fields) {
      if (field.required && !values[field.name]?.trim()) {
        setError(`${field.label} is required.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/secrets`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: payload.secretKey, value: JSON.stringify(values) }),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        setError(parsed.error ?? `Failed to save the secret (HTTP ${response.status}).`);

        return;
      }

      setSubmitted(true);
      onProvided?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unknown failure saving the secret.');
    } finally {
      setSubmitting(false);
    }
  }, [onProvided, payload.fields, payload.secretKey, projectId, values]);

  if (submitted) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 bg-bolt-elements-background-depth-1">
        <span className="i-ph:check-circle-fill w-4 h-4 text-bolt-elements-icon-success" />
        <p className="text-xs text-bolt-elements-textSecondary">
          {payload.displayName} saved to <code>{payload.secretKey}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
      <p className="text-sm font-medium text-bolt-elements-textPrimary">Provide {payload.displayName}</p>
      <p className="text-xs text-bolt-elements-textSecondary mt-1">{payload.description}</p>

      <div className="mt-3 space-y-3">
        {payload.fields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-xs text-bolt-elements-textSecondary">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            <input
              type={field.type}
              value={values[field.name] ?? ''}
              placeholder={field.placeholder}
              disabled={submitting}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-sm text-bolt-elements-textPrimary"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={submitting || !projectId}>
          {submitting ? 'Saving...' : `Save ${payload.displayName}`}
        </Button>
        {!projectId ? (
          <span className="text-xs text-bolt-elements-textTertiary">
            Open from a project to save the secret server-side.
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-bolt-elements-icon-error">{error}</p> : null}
    </div>
  );
}
