import { Pause, Play, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CRON_PRESETS, validateCronExpression, type CronFieldName, type CronValidationResult } from './cron-expression';
import type { DeploymentTypeId } from './deployment-types';
import {
  formatComputeTierPreviewCopy,
  formatComputeTierPreviewNumber,
  getComputeTierPreviewCopy,
  resolveComputeTierPreviewLanguage,
  type ComputeTierPreviewCopy,
  type ComputeTierPreviewKey,
} from '~/lib/i18n/catalogs/compute-tier-preview';
import { classNames } from '~/utils/classNames';

const CRON_FIELD_KEYS: Record<CronFieldName, ComputeTierPreviewKey> = {
  minute: 'computeTierPreview.field.minute',
  hour: 'computeTierPreview.field.hour',
  'day-of-month': 'computeTierPreview.field.day-of-month',
  month: 'computeTierPreview.field.month',
  'day-of-week': 'computeTierPreview.field.day-of-week',
};

function cronValidationMessage(
  validation: CronValidationResult,
  copy: ComputeTierPreviewCopy,
  language: string,
): string {
  if (validation.valid) {
    return copy['computeTierPreview.schedule.valid'];
  }

  const field = validation.field ? copy[CRON_FIELD_KEYS[validation.field]] : '';

  const values = {
    field,
    token: validation.token ?? '',
    value: formatComputeTierPreviewNumber(validation.value ?? 0, language),
    min: formatComputeTierPreviewNumber(validation.min ?? 0, language),
    max: formatComputeTierPreviewNumber(validation.max ?? 0, language),
    expected: formatComputeTierPreviewNumber(validation.expected ?? 0, language),
    actual: formatComputeTierPreviewNumber(validation.actual ?? 0, language),
    start: validation.start ?? '',
    end: validation.end ?? '',
  };

  const keyByError = {
    required: 'computeTierPreview.cron.required',
    'field-count': 'computeTierPreview.cron.fieldCount',
    'not-number': 'computeTierPreview.cron.notNumber',
    'out-of-range': 'computeTierPreview.cron.outOfRange',
    'positive-step': 'computeTierPreview.cron.positiveStep',
    'malformed-step': 'computeTierPreview.cron.malformedStep',
    'malformed-range': 'computeTierPreview.cron.malformedRange',
    'range-order': 'computeTierPreview.cron.rangeOrder',
    'empty-list-value': 'computeTierPreview.cron.emptyList',
  } as const satisfies Record<typeof validation.errorCode, ComputeTierPreviewKey>;

  return formatComputeTierPreviewCopy(copy[keyByError[validation.errorCode]], values);
}

/**
 * Configuration scaffolding for the compute deployment tiers (Autoscale /
 * Reserved VM / Scheduled). The inputs and lifecycle controls are the real,
 * code-only UI for these tiers, but they are INACTIVE until the managed-compute
 * infrastructure is provisioned — nothing here submits a deployment. The
 * Scheduled cron field is genuinely validated client-side so the schedule a user
 * picks is well-formed by the time the runtime exists.
 */
export function ComputeTierPreview({ tier }: { tier: DeploymentTypeId }) {
  const { i18n } = useTranslation();
  const language = resolveComputeTierPreviewLanguage(i18n?.resolvedLanguage ?? i18n?.language);
  const copy = getComputeTierPreviewCopy(language);

  return (
    <div className="grid min-w-0 gap-4 overflow-x-hidden">
      <div
        role="note"
        className="break-words rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200"
      >
        {copy['computeTierPreview.note']}
      </div>

      {tier === 'scheduled' ? <ScheduleConfig copy={copy} language={language} /> : null}
      {tier === 'autoscale' ? <AutoscaleConfig copy={copy} /> : null}
      {tier === 'reserved-vm' ? <ReservedVmConfig copy={copy} /> : null}

      <LifecycleControls copy={copy} />
      <RunHistoryPlaceholder tier={tier} copy={copy} />
    </div>
  );
}

function ScheduleConfig({ copy, language }: { copy: ComputeTierPreviewCopy; language: string }) {
  const [expression, setExpression] = useState('0 2 * * *');
  const validation = useMemo(() => validateCronExpression(expression), [expression]);

  return (
    <section className="grid gap-2">
      <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
        {copy['computeTierPreview.schedule.label']}
        <input
          className={classNames(
            'h-11 min-w-0 w-full rounded-md border bg-bolt-elements-background-depth-1 px-3 font-mono text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal',
            validation.valid
              ? 'border-bolt-elements-borderColor focus:border-bolt-elements-focus'
              : 'border-red-500/50',
          )}
          name="cronExpression"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          aria-invalid={!validation.valid}
          spellCheck={false}
          data-testid="cron-input"
        />
      </label>
      <p
        className={classNames('text-xs', validation.valid ? 'text-bolt-elements-textTertiary' : 'text-red-300')}
        role={validation.valid ? undefined : 'alert'}
        data-testid="cron-feedback"
      >
        {cronValidationMessage(validation, copy, language)}
      </p>
      <div className="flex flex-wrap gap-2">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setExpression(preset.expression)}
            className="min-h-11 whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3"
          >
            {copy[`computeTierPreview.preset.${preset.id}`]}
          </button>
        ))}
      </div>
    </section>
  );
}

function AutoscaleConfig({ copy }: { copy: ComputeTierPreviewCopy }) {
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(3);
  const invalid = max < Math.max(min, 1);

  return (
    <section className="grid gap-2 sm:grid-cols-2">
      <NumberField
        label={copy['computeTierPreview.autoscale.min']}
        value={min}
        onChange={setMin}
        min={0}
        max={10}
        testId="autoscale-min"
      />
      <NumberField
        label={copy['computeTierPreview.autoscale.max']}
        value={max}
        onChange={setMax}
        min={1}
        max={20}
        testId="autoscale-max"
      />
      {invalid ? (
        <p className="text-xs text-red-300 sm:col-span-2" role="alert">
          {copy['computeTierPreview.autoscale.invalid']}
        </p>
      ) : null}
    </section>
  );
}

function ReservedVmConfig({ copy }: { copy: ComputeTierPreviewCopy }) {
  const sizes = [
    { id: 'shared', key: 'computeTierPreview.machine.shared' },
    { id: 'small', key: 'computeTierPreview.machine.small' },
    { id: 'medium', key: 'computeTierPreview.machine.medium' },
    { id: 'large', key: 'computeTierPreview.machine.large' },
  ] as const satisfies ReadonlyArray<{ id: string; key: ComputeTierPreviewKey }>;

  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
      {copy['computeTierPreview.machine.label']}
      <select
        className="h-11 min-w-0 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal focus:border-bolt-elements-focus"
        name="machineSize"
        defaultValue="small"
        data-testid="reserved-size"
      >
        {sizes.map((size) => (
          <option key={size.id} value={size.id}>
            {copy[size.key]}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  testId: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
      {label}
      <input
        type="number"
        className="h-11 min-w-0 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal focus:border-bolt-elements-focus"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        data-testid={testId}
      />
    </label>
  );
}

/** Start/stop/restart controls — disabled until the tier has a running service. */
function LifecycleControls({ copy }: { copy: ComputeTierPreviewCopy }) {
  const controls = [
    { id: 'start', label: copy['computeTierPreview.lifecycle.start'], icon: Play },
    { id: 'stop', label: copy['computeTierPreview.lifecycle.stop'], icon: Pause },
    { id: 'restart', label: copy['computeTierPreview.lifecycle.restart'], icon: RotateCw },
  ] as const;

  return (
    <section className="grid gap-2">
      <p className="break-words text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
        {copy['computeTierPreview.lifecycle.title']}
      </p>
      <div className="flex flex-wrap gap-2">
        {controls.map((control) => {
          const ControlIcon = control.icon;

          return (
            <button
              key={control.id}
              type="button"
              disabled
              aria-disabled
              title={copy['computeTierPreview.lifecycle.unavailable']}
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary opacity-60"
            >
              <ControlIcon className="h-3.5 w-3.5" aria-hidden />
              {control.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RunHistoryPlaceholder({ tier, copy }: { tier: DeploymentTypeId; copy: ComputeTierPreviewCopy }) {
  const scheduled = tier === 'scheduled';

  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-center">
      <p className="break-words text-xs text-bolt-elements-textSecondary">
        {copy[scheduled ? 'computeTierPreview.history.noRuns' : 'computeTierPreview.history.noActivity']}
      </p>
      <p className="mt-1 break-words text-[11px] text-bolt-elements-textTertiary">
        {copy[scheduled ? 'computeTierPreview.history.runHistory' : 'computeTierPreview.history.deploymentActivity']}
      </p>
    </section>
  );
}
