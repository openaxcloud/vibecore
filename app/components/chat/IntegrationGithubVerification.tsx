import { useEffect, useRef, useState } from 'react';
import { PanelButton } from '~/components/project-ide/PanelPrimitives';
import { getIntegrationGithubCopy } from '~/lib/i18n/catalogs/integration-github';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';

interface Props {
  projectId: string;
  language?: string | null;
}

type Verification = { login: string; htmlUrl: string; verifiedAt: string };
type State = { status: 'unverified' | 'loading' | 'error' } | { status: 'verified'; account: Verification };

function readVerification(value: unknown): Verification | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;

  if (payload.ok !== true || 'error' in payload || !payload.account || typeof payload.account !== 'object') {
    return null;
  }

  const account = payload.account as Record<string, unknown>;

  if (
    typeof account.login !== 'string' ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(account.login) ||
    account.login.includes('--') ||
    typeof account.htmlUrl !== 'string' ||
    typeof payload.verifiedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(payload.verifiedAt) ||
    !Number.isFinite(Date.parse(payload.verifiedAt)) ||
    new Date(payload.verifiedAt).toISOString() !== payload.verifiedAt
  ) {
    return null;
  }

  try {
    const url = new URL(account.htmlUrl);

    if (
      url.origin !== 'https://github.com' ||
      url.username ||
      url.password ||
      url.pathname !== `/${account.login}` ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return { login: account.login, htmlUrl: url.href, verifiedAt: payload.verifiedAt };
  } catch {
    return null;
  }
}

/** Project identity owns the local proof and pending request, including during navigation. */
export function IntegrationGithubVerification(props: Props) {
  return <ProjectGithubVerification key={props.projectId} {...props} />;
}

function ProjectGithubVerification({ projectId, language }: Props) {
  const copy = getIntegrationGithubCopy(language);
  const [state, setState] = useState<State>({ status: 'unverified' });
  const pending = useRef<AbortController | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;

      if (deadline.current !== null) {
        clearTimeout(deadline.current);
        deadline.current = null;
      }
    },
    [],
  );

  async function verify() {
    if (pending.current) {
      return;
    }

    const controller = new AbortController();
    pending.current = controller;
    setState({ status: 'loading' });

    const timeout = setTimeout(() => {
      if (pending.current === controller) {
        pending.current = null;
        controller.abort();
        setState({ status: 'error' });
      }
    }, 20_000);
    deadline.current = timeout;

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/integration-github`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
        signal: controller.signal,
      });

      const verification = response.ok ? readVerification(await response.json()) : null;

      if (pending.current !== controller || controller.signal.aborted) {
        return;
      }

      setState(verification ? { status: 'verified', account: verification } : { status: 'error' });
    } catch {
      if (pending.current === controller && !controller.signal.aborted) {
        setState({ status: 'error' });
      }
    } finally {
      clearTimeout(timeout);

      if (deadline.current === timeout) {
        deadline.current = null;
      }

      if (pending.current === controller) {
        pending.current = null;
      }
    }
  }

  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-bolt-elements-borderColor p-4">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{copy.title}</h3>
      <p className="text-sm text-bolt-elements-textSecondary">{copy.scope}</p>
      <div
        role={state.status === 'error' ? 'alert' : 'status'}
        aria-live={state.status === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        aria-busy={state.status === 'loading'}
        className="min-w-0 break-words text-sm text-bolt-elements-textPrimary"
      >
        {state.status === 'unverified' && copy.unverified}
        {state.status === 'loading' && <span className="animate-pulse">{copy.loading}</span>}
        {state.status === 'error' && copy.error}
        {state.status === 'verified' && (
          <>
            <p>
              {copy.verified}{' '}
              <a href={state.account.htmlUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {state.account.login}
              </a>
            </p>
            <p className="text-xs text-bolt-elements-textSecondary">
              {copy.checkedAt}{' '}
              <time dateTime={state.account.verifiedAt}>
                {new Intl.DateTimeFormat(normalizeSupportedLanguage(language), {
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                }).format(new Date(state.account.verifiedAt))}
              </time>
            </p>
          </>
        )}
      </div>
      <PanelButton
        type="button"
        className="!h-auto min-h-[44px] max-w-full whitespace-normal py-2"
        disabled={state.status === 'loading'}
        onClick={() => void verify()}
      >
        {state.status === 'loading' ? copy.loading : state.status === 'error' ? copy.retry : copy.verify}
      </PanelButton>
    </section>
  );
}
