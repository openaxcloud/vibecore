import { useEffect, useId, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';

export type ComposerMode = 'agent' | 'plan' | 'assistant';

interface ChatBoxModeDropdownProps {
  agentMode: 'agent' | 'assistant';
  setAgentMode: (mode: 'agent' | 'assistant') => void;
  planFirstEnabled: boolean;
  onPlanFirstChange: (next: boolean) => void;
  disabled?: boolean;
}

interface ModeOption {
  id: ComposerMode;
  label: string;
  description: string;
  icon: string;
}

/*
 * Single combined control that merges the former Agent/Assistant segmented
 * control and the standalone Plan toggle into one dropdown — modelled on
 * Replit's three-tab agent-mode popup. Three mutually-exclusive modes, default
 * Agent. No option is lost: Plan and Assistant are both still reachable.
 *
 *   Agent     → autonomous execution, build mode, no plan-first.
 *   Plan      → agent execution but must propose a reviewable plan first.
 *   Assistant → answers and proposes scoped edits, waits for your go.
 */
const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: 'agent',
    label: 'Agent',
    description: 'Runs the task end to end, autonomously.',
    icon: 'i-ph:robot',
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Proposes a reviewable plan before any edits or commands.',
    icon: 'i-ph:list-checks',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    description: 'Answers and suggests scoped edits, waits for your go.',
    icon: 'i-ph:chat-circle-text',
  },
];

function resolveMode(agentMode: 'agent' | 'assistant', planFirstEnabled: boolean): ComposerMode {
  if (planFirstEnabled) {
    return 'plan';
  }

  return agentMode === 'assistant' ? 'assistant' : 'agent';
}

export function ChatBoxModeDropdown({
  agentMode,
  setAgentMode,
  planFirstEnabled,
  onPlanFirstChange,
  disabled,
}: ChatBoxModeDropdownProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const current = resolveMode(agentMode, planFirstEnabled);
  const currentOption = MODE_OPTIONS.find((option) => option.id === current) ?? MODE_OPTIONS[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectMode = (mode: ComposerMode) => {
    switch (mode) {
      case 'plan': {
        setAgentMode('agent');
        onPlanFirstChange(true);
        break;
      }
      case 'assistant': {
        setAgentMode('assistant');
        onPlanFirstChange(false);
        break;
      }
      default: {
        setAgentMode('agent');
        onPlanFirstChange(false);
      }
    }

    setOpen(false);
  };

  return (
    <div ref={anchorRef} className="bolt-chatbox-mode-dropdown">
      <button
        type="button"
        className="bolt-chatbox-mode-trigger"
        data-mode={current}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title={`Mode: ${currentOption.label} — ${currentOption.description}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={classNames(currentOption.icon, 'bolt-chatbox-mode-trigger-icon')} aria-hidden />
        <span className="bolt-chatbox-mode-trigger-label">{currentOption.label}</span>
        <span className="i-ph:caret-up text-xs" aria-hidden />
      </button>

      {open ? (
        <div id={menuId} className="bolt-chatbox-mode-menu" role="menu" aria-label="Agent mode">
          {MODE_OPTIONS.map((option) => {
            const active = option.id === current;

            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="bolt-chatbox-mode-menu-item"
                data-active={active ? 'true' : 'false'}
                onClick={() => selectMode(option.id)}
              >
                <span className={classNames(option.icon, 'bolt-chatbox-mode-menu-item-icon')} aria-hidden />
                <span className="bolt-chatbox-mode-menu-item-body">
                  <span className="bolt-chatbox-mode-menu-item-label">{option.label}</span>
                  <span className="bolt-chatbox-mode-menu-item-desc">{option.description}</span>
                </span>
                {active ? <span className="i-ph:check bolt-chatbox-mode-menu-item-check" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
