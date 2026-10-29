import { Ban, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher, useRevalidator } from 'react-router';
import { Button } from '~/components/ui/Button';
import {
  formatProjectUserAreaCurrency,
  getProjectDeploymentsCopy,
  interpolateProjectCopy,
  resolveProjectUserAreaLanguage,
  type ProjectDeploymentsCopy,
  type ProjectUserAreaLanguage,
} from '~/lib/i18n/catalogs/project-user-area';

const DEPLOYMENT_DOMAIN_PLACEHOLDER = 'app.example.com';

export type DeployDetect = {
  mode: 'server' | 'static' | 'unknown';
  framework: string;
  reason: string;
  error?: string;
  pending?: boolean;
};

/** The versioned rate card served by /projects/:id/deployments/rate-card. */
export type DeployRateCard = {
  version: number;
  currency: string;
  compute: { unitCents: number; requestCents: number };
  planKey: string;
  defaultMachineSize: string;
  machineSizes: Array<{
    key: string;
    label: string;
    vcpu: number;
    ramGb: number;
    computeUnitsPerSecond: number;
    available: boolean;
    reason?: 'plan' | 'capacity';
  }>;
};

/** ~$ per active hour for a size (compute units/s × 3600 × unit price). */
export function machineSizeHourlyDollars(
  card: DeployRateCard,
  size: { computeUnitsPerSecond: number },
  language: ProjectUserAreaLanguage = 'en',
): string {
  const cents = size.computeUnitsPerSecond * 3600 * card.compute.unitCents;
  return formatProjectUserAreaCurrency(cents / 100, card.currency, language, cents >= 100 ? 2 : 3);
}

function useProjectDeploymentsLocale(): {
  copy: ProjectDeploymentsCopy;
  language: ProjectUserAreaLanguage;
} {
  const { i18n } = useTranslation();
  const language = resolveProjectUserAreaLanguage(i18n.resolvedLanguage ?? i18n.language);

  return { copy: getProjectDeploymentsCopy(language), language };
}

// Memory only: never serialize environment values into URLs or browser storage.
export const deploymentDrafts = new Map<string, Record<string, string>>();

export function DeployPublishCard({
  projectId,
  workspaceId,
  busy,
  building,
  onSubmit,
}: {
  projectId: string;
  workspaceId: string;
  busy: boolean;
  building: boolean;
  onSubmit: (data: FormData) => void | Promise<void>;
}) {
  const { copy, language } = useProjectDeploymentsLocale();
  const detectFetcher = useFetcher<{ detected: DeployDetect }>();
  const rateCardFetcher = useFetcher<{ rateCard: DeployRateCard | null }>();
  const scopeKey = JSON.stringify([projectId, workspaceId]);
  const [draftState, setDraftState] = useState(() => ({ scopeKey, values: deploymentDrafts.get(scopeKey) ?? {} }));
  const draft = draftState.scopeKey === scopeKey ? draftState.values : (deploymentDrafts.get(scopeKey) ?? {});
  const override = (draft.deployModeOverride ?? 'auto') as 'auto' | 'server' | 'static';

  const updateDraft = (name: string, value: string) => {
    const next = { ...(deploymentDrafts.get(scopeKey) ?? {}), [name]: value };
    deploymentDrafts.set(scopeKey, next);
    setDraftState({ scopeKey, values: next });
  };

  const detectHref = `/projects/${projectId}/deployments?detect=1${
    workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}` : ''
  }`;

  // Detect on mount and whenever the workspace changes.
  useEffect(() => {
    detectFetcher.load(detectHref);
  }, [detectHref]);

  // The rate card (machine sizes + availability) drives the server-mode selector.
  useEffect(() => {
    rateCardFetcher.load(`/projects/${projectId}/deployments?rateCard=1`);
  }, [projectId]);

  const revalidator = useRevalidator();
  const rateCard = rateCardFetcher.data?.rateCard ?? null;

  const detected = detectFetcher.data?.detected;
  const detecting = detectFetcher.state !== 'idle' || !detected;
  const detectedMode = detected?.mode ?? 'unknown';

  // The effective mode: an explicit override wins; otherwise the detected mode.
  const effectiveMode: 'server' | 'static' | 'unknown' = override === 'auto' ? detectedMode : override;

  const provider = effectiveMode === 'server' ? 'server' : 'static';
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!busy) {
      submitting.current = false;
      setPending(false);
    }
  }, [busy]);

  // Fetchers retain previous data while revalidating; only an explicit override may bypass detection.
  const canPublish =
    (effectiveMode === 'server' || effectiveMode === 'static') &&
    (override !== 'auto' || (!detecting && revalidator.state === 'idle')) &&
    !busy &&
    !building &&
    !pending;

  return (
    <div className="grid gap-4">
      {/* Detected-mode banner — transparency, no opaque magic. */}
      <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{copy.publish.title}</h2>
        {detecting || (override === 'auto' && revalidator.state !== 'idle') ? (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {copy.publish.detecting}
          </p>
        ) : detectedMode === 'unknown' && override === 'auto' ? (
          <div className="grid gap-2">
            <p className="flex items-start gap-2 text-xs text-[var(--status-error-text)]">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{detected?.reason ?? copy.publish.detectionFailed}</span>
            </p>
            <button
              type="button"
              onClick={() => detectFetcher.load(detectHref)}
              className="justify-self-start text-xs font-medium text-bolt-elements-item-contentAccent hover:underline"
            >
              {copy.publish.redetect}
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text,currentColor)]" aria-hidden />
            <span>
              {copy.publish.detected}{' '}
              <span className="font-medium text-bolt-elements-textPrimary">{detected?.framework}</span> →{' '}
              <span className="font-medium text-bolt-elements-textPrimary">
                {effectiveMode === 'server' ? copy.publish.serverMode : copy.publish.staticMode}
              </span>
              {override !== 'auto' ? ` ${copy.publish.overridden}` : ''}
            </span>
          </p>
        )}
      </div>

      <form
        onChange={(event) => {
          const field = event.target;

          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement
          ) {
            if (field.name) {
              updateDraft(field.name, field.value);
            }
          }
        }}
        onSubmit={async (event) => {
          event.preventDefault();

          if (!canPublish || submitting.current) {
            return;
          }

          submitting.current = true;
          setPending(true);

          try {
            await onSubmit(new FormData(event.currentTarget));
          } finally {
            submitting.current = false;
            setPending(false);
          }
        }}
        className="vc-managed-publish-form grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="provider" value={provider} />

        <p className="text-xs text-bolt-elements-textSecondary">
          {effectiveMode === 'server' ? copy.publish.serverDescription : copy.publish.staticDescription}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field as="select" label={copy.publish.environment} name="environment" value={draft.environment ?? 'preview'}>
            <option value="preview">{copy.environments.preview}</option>
            <option value="staging">{copy.environments.staging}</option>
            <option value="production">{copy.environments.production}</option>
          </Field>
          <Field
            label={copy.publish.customDomain}
            name="customDomain"
            value={draft.customDomain ?? ''}
            placeholder={DEPLOYMENT_DOMAIN_PLACEHOLDER}
          />
        </div>

        {/*
         * Machine size (server mode) — rendered from the versioned rate card,
         * never hard-coded. Sizes the plan or current capacity cannot grant stay
         * visible but disabled, so the ladder is honest about what exists.
         */}
        {effectiveMode === 'server' && rateCard ? (
          <div className="grid gap-1.5">
            <Field
              as="select"
              label={copy.publish.machineSize}
              name="machineSize"
              value={draft.machineSize ?? rateCard.defaultMachineSize}
            >
              {rateCard.machineSizes.map((size) => (
                <option key={size.key} value={size.key} disabled={!size.available}>
                  {size.label} —{' '}
                  {interpolateProjectCopy(copy.publish.hourlyActive, {
                    amount: machineSizeHourlyDollars(rateCard, size, language),
                  })}
                  {size.available
                    ? ''
                    : ` ${size.reason === 'plan' ? copy.publish.upgradePlan : copy.publish.unavailable}`}
                </option>
              ))}
            </Field>
            <p className="text-[11px] text-bolt-elements-textTertiary">
              {interpolateProjectCopy(copy.publish.billing, { version: rateCard.version })}
            </p>
          </div>
        ) : null}

        <Field
          as="textarea"
          label={copy.publish.environmentVariables}
          name="envVars"
          value={draft.envVars ?? ''}
          placeholder={copy.publish.environmentPlaceholder}
        />

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary">
            {copy.publish.advanced}
          </summary>
          <div className="mt-2 grid gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
            {(
              [
                ['auto', copy.publish.modeAuto],
                ['server', copy.publish.modeServer],
                ['static', copy.publish.modeStatic],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-xs text-bolt-elements-textSecondary"
              >
                <input
                  className="h-3.5 w-3.5 accent-bolt-elements-focus"
                  type="radio"
                  name="deployModeOverride"
                  value={value}
                  checked={override === value}
                  onChange={() => updateDraft('deployModeOverride', value)}
                />
                {label}
              </label>
            ))}
          </div>
        </details>

        <Button type="submit" disabled={!canPublish} className="gap-2">
          <Rocket className="h-4 w-4" aria-hidden />
          {busy || building ? copy.publish.publishing : copy.publish.submit}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  value,
  as = 'input',
  children,
}: {
  label: string;
  name: string;
  placeholder?: string;
  value?: string;
  as?: 'input' | 'textarea' | 'select';
  children?: React.ReactNode;
}) {
  const className =
    'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors placeholder:text-bolt-elements-textTertiary focus:border-bolt-elements-focus';

  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
      {label}
      {as === 'textarea' ? (
        <textarea
          className={`${className} min-h-24 py-2 normal-case tracking-normal`}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={() => {
            /* The enclosing form records edits in the scoped session draft. */
          }}
        />
      ) : as === 'select' ? (
        <select
          className={`${className} h-10 normal-case tracking-normal`}
          name={name}
          value={value}
          onChange={() => {
            /* The enclosing form records edits in the scoped session draft. */
          }}
        >
          {children}
        </select>
      ) : (
        <input
          className={`${className} h-10 normal-case tracking-normal`}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={() => {
            /* The enclosing form records edits in the scoped session draft. */
          }}
        />
      )}
    </label>
  );
}
