import { Brain, Check, ChevronDown, Gauge, Sparkles, Zap } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

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

  /**
   * Whether the org's plan may use the premium modes (Turbo, high-power). When
   * false they render locked with a "Pro" badge + an upgrade CTA. Defaults to
   * true (no gating) so existing callers are unaffected; the server enforces the
   * gate authoritatively regardless of this prop.
   */
  premiumModesAllowed?: boolean;
  /** Invoked when the user clicks the upgrade CTA shown while premium is locked. */
  onUpgrade?: () => void;
  className?: string;
}

/** Boosts reserved for paid plans (Replit parity). Extended-thinking is NOT gated. */
const PREMIUM_BOOSTS = new Set<'highPowerModel' | 'extendedThinking' | 'turboMode'>(['highPowerModel', 'turboMode']);

const BUILD_TIERS: Array<{ id: AgentBuildTier; label: string; hint: string }> = [
  { id: 'lite', label: 'Lite', hint: 'Fastest, lowest cost' },
  { id: 'economy', label: 'Economy', hint: 'Balanced default' },
  { id: 'power', label: 'Power', hint: 'Maximum capability' },
];

const BOOSTS: Array<{
  key: 'highPowerModel' | 'extendedThinking' | 'turboMode';
  label: string;
  hint: string;
  icon: typeof Zap;
}> = [
  { key: 'highPowerModel', label: 'High power', hint: 'A more capable model (costs more credits)', icon: Zap },
  { key: 'extendedThinking', label: 'Extended thinking', hint: 'Let the agent reason longer', icon: Brain },
  { key: 'turboMode', label: 'Turbo', hint: 'Faster responses, up to ~6× the cost', icon: Gauge },
];

function formatCents(cents?: number): string {
  if (cents == null || !Number.isFinite(cents)) {
    return '—';
  }

  return `~$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/**
 * Per-request power controls for the agent composer (Replit-parity structure):
 * High-power model, Extended thinking, Turbo, and the build tier — each raises
 * the effort-based cost. Collapsed behind a single "Power" dropdown (Replit's
 * clean composer look) WITHOUT dropping any control: the popover keeps the build
 * tier (Power level), every boost toggle, and the live cost preview
 * (proof-of-work). Controlled component — same value/onChange API as before.
 */
export function AgentPowerControls({
  value,
  onChange,
  estimatedCents,
  disabled,
  premiumModesAllowed = true,
  onUpgrade,
  className,
}: AgentPowerControlsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isLocked = (key: 'highPowerModel' | 'extendedThinking' | 'turboMode') =>
    !premiumModesAllowed && PREMIUM_BOOSTS.has(key);

  const toggle = (key: 'highPowerModel' | 'extendedThinking' | 'turboMode') => {
    // A locked premium boost can't be turned on (the server would strip it anyway).
    if (isLocked(key)) {
      return;
    }

    onChange({ ...value, [key]: !value[key] });
  };

  // A locked boost never counts as active in the collapsed pill, even if a stale
  // value still says true (the server strips it before it takes effect).
  const activeBoosts = BOOSTS.filter((boost) => value[boost.key] && !isLocked(boost.key)).length;
  const tierLabel = BUILD_TIERS.find((tier) => tier.id === value.buildTier)?.label ?? 'Economy';

  return (
    <div ref={rootRef} className={classNames('relative inline-flex', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        title="Agent power: build tier, boosts and estimated cost"
        className={classNames(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open || activeBoosts > 0
            ? 'border-transparent text-white'
            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
        )}
        style={open || activeBoosts > 0 ? { background: 'var(--ecode-accent)' } : undefined}
      >
        <Zap className="h-3.5 w-3.5" />
        <span>Power</span>
        <span className={classNames('opacity-80', open || activeBoosts > 0 ? 'text-white' : '')}>· {tierLabel}</span>
        {activeBoosts > 0 ? (
          <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-semibold leading-4">+{activeBoosts}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      <span
        className="ml-2 inline-flex items-center gap-1 self-center rounded-full bg-bolt-elements-background-depth-2 px-2.5 py-1 text-xs font-semibold text-bolt-elements-textPrimary"
        title="Estimated cost for this request (proof-of-work)"
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--ecode-accent)' }} />
        {formatCents(estimatedCents)}
      </span>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Agent power settings"
          className="bolt-agent-power-popover absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 shadow-xl"
        >
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Power level
          </p>
          <div role="radiogroup" aria-label="Build tier" className="flex flex-col gap-0.5">
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
                    'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    'hover:bg-bolt-elements-background-depth-2',
                    active ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{tier.label}</span>
                    <span className="text-[10px] text-bolt-elements-textSecondary">{tier.hint}</span>
                  </span>
                  {active ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--ecode-accent)' }} /> : null}
                </button>
              );
            })}
          </div>

          <p className="mt-2 px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
            Boosts
          </p>
          <div className="flex flex-col gap-0.5">
            {BOOSTS.map((boost) => {
              const locked = isLocked(boost.key);
              const active = value[boost.key] && !locked;
              const BoostIcon = boost.icon;

              return (
                <button
                  key={boost.key}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  disabled={disabled || locked}
                  onClick={() => toggle(boost.key)}
                  title={locked ? `${boost.label} is available on paid plans` : boost.hint}
                  className={classNames(
                    'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed',
                    locked ? 'opacity-60' : 'hover:bg-bolt-elements-background-depth-2 disabled:opacity-50',
                    active ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <BoostIcon className="h-3.5 w-3.5" style={active ? { color: 'var(--ecode-accent)' } : undefined} />
                    {boost.label}
                  </span>
                  {locked ? (
                    <span className="rounded-full border border-bolt-elements-borderColor px-1.5 text-[9px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                      Pro
                    </span>
                  ) : (
                    <span
                      className={classNames(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        active ? 'border-transparent' : 'border-bolt-elements-borderColor',
                      )}
                      style={active ? { background: 'var(--ecode-accent)' } : undefined}
                    >
                      {active ? <Check className="h-3 w-3 text-white" /> : null}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!premiumModesAllowed ? (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--ecode-accent)' }}
            >
              <Zap className="h-3 w-3" />
              Upgrade to Pro to unlock Turbo &amp; High power
            </button>
          ) : null}

          <div className="mt-2 flex items-center justify-between border-t border-bolt-elements-borderColor px-1 pt-2 text-xs">
            <span className="text-bolt-elements-textSecondary">Est. cost</span>
            <span className="inline-flex items-center gap-1 font-semibold text-bolt-elements-textPrimary">
              <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--ecode-accent)' }} />
              {formatCents(estimatedCents)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
