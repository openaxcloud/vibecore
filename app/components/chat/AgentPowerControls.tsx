import { Brain, Gauge, Sparkles, Zap } from 'lucide-react';

import { classNames } from '~/utils/classNames';

export type AgentBuildTier = 'lite' | 'economy' | 'power';

export interface AgentPowerControlsValue {
  highPowerModel: boolean;
  extendedThinking: boolean;
  turboMode: boolean;
  buildTier: AgentBuildTier;
}

export interface AgentPowerControlsProps {
  value: AgentPowerControlsValue;
  onChange: (next: AgentPowerControlsValue) => void;

  /** Optional live cost estimate in USD cents (proof-of-work preview). */
  estimatedCents?: number;
  disabled?: boolean;
  className?: string;
}

const BUILD_TIERS: Array<{ id: AgentBuildTier; label: string }> = [
  { id: 'lite', label: 'Lite' },
  { id: 'economy', label: 'Economy' },
  { id: 'power', label: 'Power' },
];

function formatCents(cents?: number): string {
  if (cents == null || !Number.isFinite(cents)) {
    return '—';
  }

  return `~$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/**
 * Per-request power controls for the agent composer (Replit parity): High power
 * model, Extended thinking, Turbo, and the build tier — each raises the
 * effort-based cost. Shows a live cost-preview pill (proof-of-work). Controlled.
 */
export function AgentPowerControls({ value, onChange, estimatedCents, disabled, className }: AgentPowerControlsProps) {
  const toggle = (key: 'highPowerModel' | 'extendedThinking' | 'turboMode') =>
    onChange({ ...value, [key]: !value[key] });

  const pill = (active: boolean) =>
    classNames(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
      'disabled:cursor-not-allowed disabled:opacity-50',
      active
        ? 'border-transparent text-white'
        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
    );

  const activeStyle = (active: boolean) => (active ? { background: 'var(--ecode-accent)' } : undefined);

  return (
    <div className={classNames('flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        aria-pressed={value.highPowerModel}
        disabled={disabled}
        onClick={() => toggle('highPowerModel')}
        className={pill(value.highPowerModel)}
        style={activeStyle(value.highPowerModel)}
        title="Use a more capable model (costs more credits)"
      >
        <Zap className="h-3.5 w-3.5" /> High power
      </button>

      <button
        type="button"
        aria-pressed={value.extendedThinking}
        disabled={disabled}
        onClick={() => toggle('extendedThinking')}
        className={pill(value.extendedThinking)}
        style={activeStyle(value.extendedThinking)}
        title="Let the agent reason longer (costs more credits)"
      >
        <Brain className="h-3.5 w-3.5" /> Extended thinking
      </button>

      <button
        type="button"
        aria-pressed={value.turboMode}
        disabled={disabled}
        onClick={() => toggle('turboMode')}
        className={pill(value.turboMode)}
        style={activeStyle(value.turboMode)}
        title="Faster responses, up to ~6× the cost"
      >
        <Gauge className="h-3.5 w-3.5" /> Turbo
      </button>

      <div
        role="radiogroup"
        aria-label="Build tier"
        className="inline-flex overflow-hidden rounded-full border border-bolt-elements-borderColor"
      >
        {BUILD_TIERS.map((tier) => {
          const active = value.buildTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ ...value, buildTier: tier.id })}
              className={classNames(
                'px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'text-white'
                  : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
              style={active ? { background: 'var(--ecode-accent)' } : undefined}
            >
              {tier.label}
            </button>
          );
        })}
      </div>

      <span
        className="ml-auto inline-flex items-center gap-1 rounded-full bg-bolt-elements-background-depth-2 px-2.5 py-1 text-xs font-semibold text-bolt-elements-textPrimary"
        title="Estimated cost for this request (proof-of-work)"
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--ecode-accent)' }} />
        {formatCents(estimatedCents)}
      </span>
    </div>
  );
}
