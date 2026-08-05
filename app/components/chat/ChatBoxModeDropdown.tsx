import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChatBoxChildrenCopy, getChatBoxChildrenCopy } from '~/lib/i18n/catalogs/chat-box-children';
import { classNames } from '~/utils/classNames';

export type ComposerMode = 'agent' | 'assistant';

interface ChatBoxModeDropdownProps {
  agentMode: 'agent' | 'assistant';
  setAgentMode: (mode: 'agent' | 'assistant') => void;
  disabled?: boolean;
}

interface ModeOption {
  id: ComposerMode;
  label: string;
  description: string;
  icon: string;
}

/*
 * Agent/Assistant mode selector. Plan-first is a SEPARATE standalone toggle next
 * to this control (Replit parity — see ChatBox's Plan toggle), so it is not a
 * mode here; the two are orthogonal (plan-first applies before either mode runs).
 *
 *   Agent     → runs the task end to end, autonomously.
 *   Assistant → answers and proposes scoped edits, waits for your go.
 */
export function ChatBoxModeDropdown({ agentMode, setAgentMode, disabled }: ChatBoxModeDropdownProps) {
  const { i18n } = useTranslation();
  const copy = getChatBoxChildrenCopy(i18n.resolvedLanguage ?? i18n.language);

  const modeOptions: readonly ModeOption[] = [
    {
      id: 'agent',
      label: copy['chatBoxChildren.mode.agent.label'],
      description: copy['chatBoxChildren.mode.agent.description'],
      icon: 'i-ph:robot',
    },
    {
      id: 'assistant',
      label: copy['chatBoxChildren.mode.assistant.label'],
      description: copy['chatBoxChildren.mode.assistant.description'],
      icon: 'i-ph:chat-circle-text',
    },
  ];

  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const current: ComposerMode = agentMode === 'assistant' ? 'assistant' : 'agent';
  const currentOption = modeOptions.find((option) => option.id === current) ?? modeOptions[0];

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
    setAgentMode(mode);
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
        title={formatChatBoxChildrenCopy(copy['chatBoxChildren.mode.triggerTitle'], {
          label: currentOption.label,
          description: currentOption.description,
        })}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={classNames(currentOption.icon, 'bolt-chatbox-mode-trigger-icon')} aria-hidden />
        <span className="bolt-chatbox-mode-trigger-label min-w-0 break-words">{currentOption.label}</span>
        <span className="i-ph:caret-up text-xs" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          className="bolt-chatbox-mode-menu overflow-x-hidden"
          role="menu"
          aria-label={copy['chatBoxChildren.mode.menuAria']}
        >
          {modeOptions.map((option) => {
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
                <span className="bolt-chatbox-mode-menu-item-body break-words">
                  <span className="bolt-chatbox-mode-menu-item-label break-words">{option.label}</span>
                  <span className="bolt-chatbox-mode-menu-item-desc break-words">{option.description}</span>
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
