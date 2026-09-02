import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatChatControlsCopy, formatChatControlsCost, getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';
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

  /**
   * `full` keeps the three-part row (segmented + Advanced + cost) used by the
   * standalone composer. `compact` collapses the whole thing to ONE discreet
   * label in the composer's single control row; the segmented control, the
   * switches, the Plan-first toggle and the cost estimate all move inside the
   * popover. At 390 the full row wrapped onto three lines and, with the field
   * and the action row, ate ~40% of the panel.
   */
  variant?: 'full' | 'compact';

  /**
   * Plan-first toggle, hosted inside the popover in `compact` so it no longer
   * occupies a row of its own. Omitted entirely when the caller has no
   * plan-first pipeline wired.
   */
  planFirst?: {
    enabled: boolean;
    onChange: (next: boolean) => void;
    label: string;
    title: string;
  };
}

/*
 * The three MODES — the only choice a user ever makes. No model name appears
 * anywhere in this component, ever: a mode is a promise (speed/depth/cost),
 * the platform decides how to keep it.
 */
const BUILD_TIER_IDS: AgentBuildTier[] = ['lite', 'economy', 'power'];

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
  variant = 'full',
  planFirst,
}: AgentPowerControlsProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatControlsCopy(language);

  const buildTiers: Array<{ id: AgentBuildTier; label: string; hint: string }> = [
    {
      id: 'lite',
      label: copy['chatControls.power.tier.lite'],
      hint: copy['chatControls.power.tier.liteHint'],
    },
    {
      id: 'economy',
      label: copy['chatControls.power.tier.economy'],
      hint: copy['chatControls.power.tier.economyHint'],
    },
    {
      id: 'power',
      label: copy['chatControls.power.tier.power'],
      hint: copy['chatControls.power.tier.powerHint'],
    },
  ];

  const [advancedOpen, setAdvancedOpen] = useState(false);

  /*
   * La feuille NAVIGUE SUR PLACE, elle n'empile pas de fenêtres.
   *
   * Référence Replit, captures d'Avi : « Agent modes » liste les modes ; on en
   * choisit un et la feuille passe à ses réglages, avec un chevron de retour en
   * haut à gauche. Jamais deux surfaces superposées.
   */
  const [niveau, setNiveau] = useState<'modes' | 'reglages'>('modes');
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!advancedOpen) {
      /* Rouvrir doit toujours repartir de la liste des modes, jamais d'un sous-écran. */
      setNiveau('modes');
    }
  }, [advancedOpen]);

  const panelId = useId();
  const hintId = useId();

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

      const order = BUILD_TIER_IDS.filter((mode) => modeAvailable(mode));

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

  const activeTier = buildTiers.find((tier) => tier.id === value.buildTier) ?? buildTiers[1];
  const activeSwitches = (value.highEffort ? 1 : 0) + (value.turboMode ? 1 : 0);

  const compact = variant === 'compact';

  const segmentedControl = (
    <div
      role="radiogroup"
      aria-label={copy['chatControls.power.groupAria']}
      aria-describedby={hintId}
      title={value.buildTier === 'lite' ? copy['chatControls.power.liteGuardrail'] : activeTier.hint}
      data-testid="agent-mode-segmented"
      className="inline-grid max-w-full grid-cols-3 items-stretch rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-0.5"
    >
      {buildTiers.map((tier) => {
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
              available
                ? formatChatControlsCopy(copy['chatControls.power.availableTitle'], {
                    label: tier.label,
                    hint: tier.hint,
                  })
                : formatChatControlsCopy(copy['chatControls.power.unavailableTitle'], { label: tier.label })
            }
            data-testid={`agent-mode-${tier.id}`}
            className={classNames(
              'min-h-7 min-w-0 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight transition-colors sm:px-2 sm:text-xs',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'text-white' : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
            style={active ? { background: 'var(--vc-ide-accent-action)' } : undefined}
          >
            {tier.label}
            {!available ? <span className="i-ph:lock ml-1 inline-block align-middle text-xs" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );

  const advancedTrigger = (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={advancedOpen}
      aria-controls={panelId}
      onClick={() => setAdvancedOpen((prev) => !prev)}
      title={copy['chatControls.power.advancedTitle']}
      data-testid="agent-mode-advanced"
      className={classNames(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        advancedOpen || activeSwitches > 0
          ? 'border-transparent text-white'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
      )}
      style={advancedOpen || activeSwitches > 0 ? { background: 'var(--vc-ide-accent-action)' } : undefined}
    >
      <span className="i-ph:sliders-horizontal text-sm" aria-hidden />
      <span>{copy['chatControls.power.advanced']}</span>
      {activeSwitches > 0 ? (
        <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-semibold leading-4">+{activeSwitches}</span>
      ) : null}
      <span className="i-ph:caret-down text-xs" aria-hidden />
    </button>
  );

  const costChip = (
    <span
      className="inline-flex h-8 items-center gap-1 self-center rounded-lg bg-bolt-elements-background-depth-2 px-2.5 text-xs font-semibold text-bolt-elements-textPrimary"
      title={copy['chatControls.power.estimatedTitle']}
    >
      <span className="i-ph:sparkle text-sm" style={{ color: 'var(--vc-ide-accent-action)' }} aria-hidden />
      {formatChatControlsCost(estimatedCents, language)}
    </span>
  );

  const planFirstToggle = planFirst ? (
    <button
      type="button"
      className={classNames('bolt-chatbox-plan-toggle', { 'is-active': planFirst.enabled })}
      aria-pressed={planFirst.enabled}
      disabled={disabled}
      title={planFirst.title}
      onClick={() => planFirst.onChange(!planFirst.enabled)}
    >
      <span className="i-ph:list-checks bolt-chatbox-plan-toggle-icon" aria-hidden />
      <span className="bolt-chatbox-plan-toggle-label">{planFirst.label}</span>
    </button>
  ) : null;

  const compactTrigger = (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={advancedOpen}
      aria-controls={panelId}
      aria-describedby={hintId}
      onClick={() => setAdvancedOpen((prev) => !prev)}
      title={copy['chatControls.power.advancedTitle']}
      aria-label={formatChatControlsCopy(copy['chatControls.power.compactAria'], { mode: activeTier.label })}
      data-testid="agent-mode-advanced"
      className={classNames('bolt-composer-chip', { 'is-open': advancedOpen })}
    >
      <span className="bolt-composer-chip-label">{activeTier.label}</span>
      {activeSwitches > 0 ? <span className="bolt-composer-chip-badge">+{activeSwitches}</span> : null}
      <span className="i-ph:caret-up bolt-composer-chip-caret" aria-hidden />
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={classNames(
        'relative flex items-center',
        compact ? 'bolt-agent-power-compact' : 'flex-wrap gap-2',
        className,
      )}
    >
      {compact ? compactTrigger : segmentedControl}
      {compact ? null : advancedTrigger}
      {compact ? null : costChip}

      <p className="sr-only" data-testid="agent-mode-hint" id={hintId}>
        {value.buildTier === 'lite' ? copy['chatControls.power.liteGuardrail'] : activeTier.hint}
      </p>
      {advancedOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={copy['chatControls.power.dialogAria']}
          className="bolt-agent-power-popover absolute bottom-full left-0 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 shadow-xl"
        >
          {niveau === 'modes' ? (
            <div className="bolt-agent-sheet-modes" role="radiogroup" aria-label={copy['chatControls.power.groupAria']}>
              <p className="bolt-agent-sheet-title">{copy['chatControls.power.modesTitle']}</p>
              {buildTiers.map((tier) => {
                const actif = value.buildTier === tier.id;
                const disponible = modeAvailable(tier.id);

                return (
                  <button
                    key={tier.id}
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    data-selected={actif ? 'true' : 'false'}
                    data-verrouille={disponible ? 'false' : 'true'}
                    disabled={disabled}
                    onClick={() => {
                      if (disponible) {
                        selectMode(tier.id);
                      }

                      /*
                       * On avance MÊME si le mode est verrouillé : l'utilisateur
                       * doit pouvoir lire ce qu'il n'a pas, pas se heurter à un
                       * bouton mort. Le cadenas dit pourquoi.
                       */
                      setNiveau('reglages');
                    }}
                    className="bolt-agent-sheet-row"
                  >
                    <span className="bolt-agent-sheet-row-label">{tier.label}</span>
                    <span className="bolt-agent-sheet-row-hint">{tier.hint}</span>
                    {disponible ? null : (
                      <span
                        className="bolt-agent-sheet-lock i-ph:lock-simple"
                        aria-label={copy['chatControls.power.locked']}
                        title={copy['chatControls.power.locked']}
                      />
                    )}
                  </button>
                );
              })}
              {planFirstToggle}
            </div>
          ) : null}

          {niveau === 'reglages' ? (
            <>
              <div className="bolt-agent-sheet-head">
                <button
                  type="button"
                  className="bolt-agent-sheet-back"
                  aria-label={copy['chatControls.power.back']}
                  onClick={() => setNiveau('modes')}
                >
                  <span className="i-ph:caret-left" aria-hidden />
                </button>
                <p className="bolt-agent-sheet-title">{activeTier.label}</p>
              </div>
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                {copy['chatControls.power.dialogTitle']}
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
                      ? copy['chatControls.power.highEffortLite']
                      : highEffortAvailable
                        ? copy['chatControls.power.highEffortAvailable']
                        : copy['chatControls.power.highEffortPaid']
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
                      <span
                        className="i-ph:lightning text-sm"
                        style={value.highEffort ? { color: 'var(--vc-ide-accent-action)' } : undefined}
                        aria-hidden
                      />
                      {copy['chatControls.power.highEffort']}
                    </span>
                    <span className="pl-5 text-[10px] text-bolt-elements-textSecondary">
                      {copy['chatControls.power.highEffortDescription']}
                    </span>
                  </span>
                  {!highEffortAvailable && value.buildTier !== 'lite' ? (
                    <span className="rounded-full border border-bolt-elements-borderColor px-1.5 text-[9px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                      {copy['chatControls.power.proBadge']}
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
                      {value.highEffort && value.buildTier !== 'lite' ? (
                        <span className="i-ph:check-bold text-xs text-white" aria-hidden />
                      ) : null}
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
                      ? copy['chatControls.power.turboPower']
                      : turboAvailable
                        ? copy['chatControls.power.turboAvailable']
                        : copy['chatControls.power.turboOrganization']
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
                      <span
                        className="i-ph:gauge text-sm"
                        style={value.turboMode ? { color: 'var(--vc-ide-accent-action)' } : undefined}
                        aria-hidden
                      />
                      {copy['chatControls.power.turbo']}
                    </span>
                    <span className="pl-5 text-[10px] text-bolt-elements-textSecondary">
                      {copy['chatControls.power.turboDescription']}
                    </span>
                  </span>
                  {!turboAvailable && value.buildTier === 'power' ? (
                    <span className="rounded-full border border-bolt-elements-borderColor px-1.5 text-[9px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                      {copy['chatControls.power.organizationBadge']}
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
                      {value.turboMode && value.buildTier === 'power' ? (
                        <span className="i-ph:check-bold text-xs text-white" aria-hidden />
                      ) : null}
                    </span>
                  )}
                </button>
              </div>
            </>
          ) : null}

          {!highEffortAvailable || (!turboAvailable && value.buildTier === 'power') ? (
            <button
              type="button"
              onClick={() => onUpgrade?.()}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--ecode-accent)' }}
            >
              <span className="i-ph:lightning text-xs" aria-hidden />
              {copy['chatControls.power.upgrade']}
            </button>
          ) : null}

          <div className="mt-2 flex items-center justify-between border-t border-bolt-elements-borderColor px-1 pt-2 text-xs">
            <span className="text-bolt-elements-textSecondary">{copy['chatControls.power.estimated']}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-bolt-elements-textPrimary">
              <span className="i-ph:sparkle text-sm" style={{ color: 'var(--vc-ide-accent-action)' }} aria-hidden />
              {formatChatControlsCost(estimatedCents, language)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
