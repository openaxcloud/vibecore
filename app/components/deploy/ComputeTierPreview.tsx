import { Pause, Play, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CRON_PRESETS, validateCronExpression } from './cron-expression';
import type { DeploymentTypeId } from './deployment-types';
import { classNames } from '~/utils/classNames';

/**
 * Configuration scaffolding for the compute deployment tiers (Autoscale /
 * Reserved VM / Scheduled). The inputs and lifecycle controls are the real,
 * code-only UI for these tiers, but they are INACTIVE until the managed-compute
 * infrastructure is provisioned — nothing here submits a deployment. The
 * Scheduled cron field is genuinely validated client-side so the schedule a user
 * picks is well-formed by the time the runtime exists.
 */
export function ComputeTierPreview({ tier }: { tier: DeploymentTypeId }) {
  return (
    <div className="grid gap-4">
      <div
        role="note"
        className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200"
      >
        Preview — these controls activate once managed compute is provisioned. Nothing is deployed yet.
      </div>

      {tier === 'scheduled' ? <ScheduleConfig /> : null}
      {tier === 'autoscale' ? <AutoscaleConfig /> : null}
      {tier === 'reserved-vm' ? <ReservedVmConfig /> : null}

      <LifecycleControls />
      <RunHistoryPlaceholder tier={tier} />
    </div>
  );
}

function ScheduleConfig() {
  const [expression, setExpression] = useState('0 2 * * *');
  const validation = useMemo(() => validateCronExpression(expression), [expression]);

  return (
    <section className="grid gap-2">
      <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
        Schedule (cron)
        <input
          className={classNames(
            'h-10 w-full rounded-md border bg-bolt-elements-background-depth-1 px-3 font-mono text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal',
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
        {validation.valid ? 'Valid schedule (minute hour day month weekday).' : validation.error}
      </p>
      <div className="flex flex-wrap gap-2">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.expression}
            type="button"
            onClick={() => setExpression(preset.expression)}
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function AutoscaleConfig() {
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(3);
  const invalid = max < Math.max(min, 1);

  return (
    <section className="grid gap-2 sm:grid-cols-2">
      <NumberField label="Min instances" value={min} onChange={setMin} min={0} max={10} testId="autoscale-min" />
      <NumberField label="Max instances" value={max} onChange={setMax} min={1} max={20} testId="autoscale-max" />
      {invalid ? (
        <p className="text-xs text-red-300 sm:col-span-2" role="alert">
          Max instances must be at least the minimum (and ≥ 1).
        </p>
      ) : null}
    </section>
  );
}

function ReservedVmConfig() {
  const sizes = [
    'Shared · 0.5 vCPU / 1 GB',
    'Small · 1 vCPU / 2 GB',
    'Medium · 2 vCPU / 4 GB',
    'Large · 4 vCPU / 8 GB',
  ];

  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
      Machine size
      <select
        className="h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal focus:border-bolt-elements-focus"
        name="machineSize"
        defaultValue={sizes[1]}
        data-testid="reserved-size"
      >
        {sizes.map((size) => (
          <option key={size} value={size}>
            {size}
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
        className="h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors normal-case tracking-normal focus:border-bolt-elements-focus"
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
function LifecycleControls() {
  const controls = [
    { label: 'Start', icon: Play },
    { label: 'Stop', icon: Pause },
    { label: 'Restart', icon: RotateCw },
  ];

  return (
    <section className="grid gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">Lifecycle</p>
      <div className="flex flex-wrap gap-2">
        {controls.map((control) => {
          const ControlIcon = control.icon;

          return (
            <button
              key={control.label}
              type="button"
              disabled
              aria-disabled
              title="Available once this tier is provisioned"
              className="inline-flex h-8 cursor-not-allowed items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textTertiary opacity-60"
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

function RunHistoryPlaceholder({ tier }: { tier: DeploymentTypeId }) {
  const noun = tier === 'scheduled' ? 'runs' : 'activity';

  return (
    <section className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-center">
      <p className="text-xs text-bolt-elements-textSecondary">No {noun} yet</p>
      <p className="mt-1 text-[11px] text-bolt-elements-textTertiary">
        {tier === 'scheduled' ? 'Run history' : 'Deployment activity'} appears here once the tier is active.
      </p>
    </section>
  );
}
