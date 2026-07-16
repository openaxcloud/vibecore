import { Check, ChevronDown, Gauge, Lock, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { classNames } from '~/utils/classNames';

export type AgentBuildTier = 'lite' | 'economy' | 'power';

export interface AgentPowerControlsValue {
  /** High effort: escalate genuinely hard tasks to a more capable model. */
  highEffort: boolean;

  /** Legacy wire name kept in sync with highEffort (server accepts both). */
  highPowerModel: boolean;

  /** Legacy field — no longer surfaced in the UI, always sent as-is. */
  extendedThinking: boolean;
  turboMode: boolean;
  buildTier: AgentBuildTier;
}

/** Plan/org availability of modes + switches (from /api/agent-routing). */
export interface AgentModeAvailability {
  modes?: Array<{ mode: AgentBuildTier; available: boolean; reason?: string }>;
  highEffort?: { available: boolean };
  turbo?: { available: boolean; planAllowed?: boolean; orgEnabled?: boolean };
}

export interface AgentPowerControlsProps {
  value: AgentPowerControlsValue;
  onChange: (next: AgentPowerControlsValue) => void;

  /** Optional live cost estimate in USD cents (proof-of-work preview). */
  estimatedCents?: number;
  disabled?: boolean;

  /**
   * Mode/switch availability for the caller's plan+org. The server enforces
   * the gate authoritatively regardless; this only drives the locked UI.
   */
  availability?: AgentModeAvailability;

  /** Invoked when the user clicks the upgrade CTA shown while premium is locked. */
  onUpgrade?: () => void;
  className?: string;
}

/*
 * The three MODES — the only choice a user ever makes. No model name appears
 * anywhere in this component, ever: a mode is a promise (speed/depth/cost),
 * the platform decides how to keep it.
 */
const BUILD_TIERS: Array<{ id: AgentBuildTier; label: string; hint: string }> = [
  { id: 'lite', label: 'Lite', hint: 'Fast and economical. Visual tweaks, bug fixes, targeted changes.' },
  { id: 'economy', label: 'Economy', hint: 'The right balance.' },
  { id: 'power', label: 'Power', hint: 'For complex tasks.' },
];

const LITE_GUARDRAIL =
  'Lite is a good fit for existing apps when you know what you want to change. Starting from scratch, a big ' +
  'architecture change, a new integration or a database schema change? Switch to Economy or Power.';

function formatCents(cents?: number): string {
  if (cents == null || !Number.isFinite(cents)) {
    return '—';
  }

  return `~$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/**
 * Agent mode controls (AGM): a segmented Lite / Economy / Power control —
 * always visible in the IDE composer, never before project creation — plus an
 * "Advanced" popover with the two switches (High effort, Turbo). ⌘⇧I cycles
 * through the available modes. Controlled component; the parent persists the
 * value per USER (never per project).
 */
export function AgentPowerControls({
  value,
  onChange,
  estimatedCents,
  disabled,
  availability,
  onUpgrade,
  className,
}: AgentPowerControlsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const modeAvailable = (mode: AgentBuildTier): boolean => {
    if (!availability?.modes) {
      return true;
    }

    return availability.modes.find((entry) => entry.mode === mode)?.available ?? true;
  };

  const highEffortAvailable = availability?.highEffort ? availability.highEffort.available : true;
  const turboAvailable = availability?.turbo ? availability.turbo.available : true;

  const selectMode = (mode: AgentBuildTier) => {
    if (disabled || !modeAvailable(mode)) {
      return;
    }

    onChange({
      ...value,
      buildTier: mode,

      // High effort never survives into Lite; Turbo only exists in Power.
      highEffort: mode === 'lite' ? false : value.highEffort,
      highPowerModel: mode === 'lite' ? false : value.highEffort,
      turboMode: mode === 'power' ? value.turboMode : false,
    });
  };

  const setHighEffort = (next: boolean) => {
    if (disabled || value.buildTier === 'lite' || !highEffortAvailable) {
      return;
    }

    onChange({ ...value, highEffort: next, highPowerModel: next });
  };

  const setTurbo = (next: boolean) => {
    if (disabled || value.buildTier !== 'power' || !turboAvailable) {
      return;
    }

    onChange({ ...value, turboMode: next });
  };

  // ⌘⇧I (Ctrl+Shift+I outside macOS) cycles through the available modes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'i') {
        return;
      }

      event.preventDefault();

      const order = BUILD_TIERS.map((tier) => tier.id).filter((mode) => modeAvailable(mode));

      if (order.length === 0) {
        return;
      }

      const currentIndex = order.indexOf(value.buildTier);
      selectMode(order[(currentIndex + 1) % order.length]);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  });

  // Close the Advanced popover on outside pointer / Escape.
  useEffect(() => {
    if (!advancedOpen) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setAdvancedOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAdvancedOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [advancedOpen]);

  const activeTier = BUILD_TIERS.find((tier) => tier.id === value.buildTier) ?? BUILD_TIERS[1];
  const activeSwitches = (value.highEffort ? 1 : 0) + (value.turboMode ? 1 : 0);

  return (
    <div ref={rootRef} className={classNames('relative flex flex-wrap items-center gap-2', className)}>
      <div
        role="radiogroup"
        aria-label="Agent mode (⌘⇧I to cycle)"
        data-testid="agent-mode-segmented"
        className="inline-flex items-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-0.5"
      >
        {BUILD_TIERS.map((tier) => {
          const active = value.buildTier === tier.id;
          const available = modeAvailable(tier.id);

          return (
            <button
              key={tier.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || !available}
              onClick={() => selectMode(tier.id)}
              title={
                available ? `${tier.label} — ${tier.hint} (⌘⇧I cycles)` : `${tier.label} is not available on your plan`
              }
              data-testid={`agent-mode-${tier.id}`}
              className={classNames(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active ? 'text-white' : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
              style={active ? { background: 'var(--vc-ide-accent-action)' } : undefined}
            >
              {tier.label}
              {!available ? <Lock className="ml-1 inline h-3 w-3" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={advancedOpen}
        aria-controls={panelId}
        onClick={() => setAdvancedOpen((prev) => !prev)}
        title="Advanced settings: High effort and Turbo"
        data-testid="agent-mode-advanced"
        className={classNames(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          advancedOpen || activeSwitches > 0
            ? 'border-transparent text-white'
            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
        )}
        style={advancedOpen || activeSwitches > 0 ? { background: 'var(--vc-ide-accent-action)' } : undefined}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Advanced</span>
        {activeSwitches > 0 ? (
          <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-semibold leading-4">+{activeSwitches}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      <span
        className="inline-flex items-center gap-1 self-center rounded-full bg-bolt-elements-background-depth-2 px-2.5 py-1 text-xs font-semibold text-bolt-elements-textPrimary"
        title="Estimated cost for this request"
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--vc-ide-accent-action)' }} />
        {formatCents(estimatedCents)}
      </span>

      <p className="w-full text-[11px] leading-snug text-bolt-elements-textSecondary" data-testid="agent-mode-hint">
        {value.buildTier === 'lite' ? LITE_GUARDRAIL : activeTier.hint}
      </p>

      {advancedOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Advanced agent settings"
          className="bolt-agent-power-popover absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 shadow-xl"
        >
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Advanced settings
          </p>

          <div className="flex flex-col gap-0.5">
            {/* High effort — Economy and Power only, never Lite. */}
            <button
              type="button"
              role="switch"
              aria-checked={value.highEffort && value.buildTier !== 'lite'}
              disabled={disabled || value.buildTier === 'lite' || !highEffortAvailable}
              onClick={() => setHighEffort(!value.highEffort)}
              data-testid="agent-switch-high-effort"
              title={
                value.buildTier === 'lite'
                  ? 'High effort is not available in Lite'
                  : highEffortAvailable
                    ? 'Escalates only genuinely hard tasks to a more capable model. When a task doesn’t need it, you pay +0 credit.'
                    : 'High effort is available on paid plans'
              }
              className={classNames(
                'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed',
                value.buildTier === 'lite' || !highEffortAvailable
                  ? 'opacity-60'
                  : 'hover:bg-bolt-elements-background-depth-2 disabled:opacity-50',
                value.highEffort ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
              )}
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  <Zap
                    className="h-3.5 w-3.5"
                    style={value.highEffort ? { color: 'var(--vc-ide-accent-action)' } : undefined}
                  />
                  High effort
                </span>
                <span className="pl-5 text-[10px] text-bolt-elements-textSecondary">
                  Escalates only genuinely hard tasks — no systematic surcharge.
                </span>
              </span>
              {!highEffortAvailable && value.buildTier !== 'lite' ? (
                <span className="rounded-full border border-bolt-elements-borderColor px-1.5 text-[9px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                  Pro
                </span>
              ) : (
                <span
                  className={classNames(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    value.highEffort && value.buildTier !== 'lite'
                      ? 'border-transparent'
                      : 'border-bolt-elements-borderColor',
                  )}
                  style={
                    value.highEffort && value.buildTier !== 'lite'
                      ? { background: 'var(--vc-ide-accent-action)' }
                      : undefined
                  }
                >
                  {value.highEffort && value.buildTier !== 'lite' ? <Check className="h-3 w-3 text-white" /> : null}
                </span>
              )}
            </button>

            {/* Turbo — Power only, OFF by default, enabled per-org by an admin. */}
            <button
              type="button"
              role="switch"
              aria-checked={value.turboMode && value.buildTier === 'power'}
              disabled={disabled || value.buildTier !== 'power' || !turboAvailable}
              onClick={() => setTurbo(!value.turboMode)}
              data-testid="agent-switch-turbo"
              title={
                value.buildTier !== 'power'
                  ? 'Turbo is only available in Power mode'
                  : turboAvailable
                    ? 'Fastest responses, billed at the advertised multiplier.'
                    : 'Turbo is enabled by your organization admin'
              }
              className={classNames(
                'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed',
                value.buildTier !== 'power' || !turboAvailable
                  ? 'opacity-60'
                  : 'hover:bg-bolt-elements-background-depth-2 disabled:opacity-50',
                value.turboMode ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
              )}
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  <Gauge
                    className="h-3.5 w-3.5"
                    style={value.turboMode ? { color: 'var(--vc-ide-accent-action)' } : undefined}
                  />
                  Turbo
                </span>
                <span className="pl-5 text-[10px] text-bolt-elements-textSecondary">
                  Power only. Off by default; an org admin enables it.
                </span>
              </span>
              {!turboAvailable && value.buildTier === 'power' ? (
                <span className="rounded-full border border-bolt-elements-borderColor px-1.5 text-[9px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                  Org
                </span>
              ) : (
                <span
                  className={classNames(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    value.turboMode && value.buildTier === 'power'
                      ? 'border-transparent'
                      : 'border-bolt-elements-borderColor',
                  )}
                  style={
                    value.turboMode && value.buildTier === 'power'
                      ? { background: 'var(--vc-ide-accent-action)' }
                      : undefined
                  }
                >
                  {value.turboMode && value.buildTier === 'power' ? <Check className="h-3 w-3 text-white" /> : null}
                </span>
              )}
            </button>
          </div>

          {!highEffortAvailable || (!turboAvailable && value.buildTier === 'power') ? (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--ecode-accent)' }}
            >
              <Zap className="h-3 w-3" />
              Upgrade to unlock advanced settings
            </button>
          ) : null}

          <div className="mt-2 flex items-center justify-between border-t border-bolt-elements-borderColor px-1 pt-2 text-xs">
            <span className="text-bolt-elements-textSecondary">Est. cost</span>
            <span className="inline-flex items-center gap-1 font-semibold text-bolt-elements-textPrimary">
              <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--vc-ide-accent-action)' }} />
              {formatCents(estimatedCents)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
