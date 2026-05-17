/**
 * Slash-command palette for the chat composer (Sprint 4).
 *
 * Stateless presentational counterpart to `searchSlashCommands` — the
 * composer is the one that detects the leading `/`, holds the query
 * substring, and decides where to anchor the palette. The component
 * itself only handles the keyboard nav (ArrowDown/Up, Enter, Escape)
 * and emits `onSelect` when the user picks a command.
 */

import { memo, useCallback, useEffect, useState } from 'react';

import { searchSlashCommands, type SlashCommand } from '~/lib/chat/slash-commands';
import { t } from '~/lib/i18n/dictionary';

export interface SlashCommandsPaletteProps {
  /** Text typed after the leading `/` (no slash, no argument). */
  query: string;

  /** Fired with the chosen command. The composer runs `execute`. */
  onSelect: (command: SlashCommand) => void;

  /** Fired on Escape or when no matches remain. */
  onDismiss?: () => void;

  /**
   * Optional argument hint shown in the empty state when the command
   * takes a free-form argument and the user hasn't typed one yet.
   */
  pendingArgument?: string;

  /**
   * MRU command ids the user has executed recently — boosts those
   * entries in the palette ranking so frequent commands surface
   * first.
   */
  recentSlashCommandIds?: readonly string[];
}

export const SlashCommandsPalette = memo(
  ({ query, onSelect, onDismiss, pendingArgument, recentSlashCommandIds }: SlashCommandsPaletteProps) => {
    const commands = searchSlashCommands(query, { recentSlashCommandIds });
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      if (activeIndex >= commands.length) {
        setActiveIndex(Math.max(0, commands.length - 1));
      }
    }, [activeIndex, commands.length]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            setActiveIndex((idx) => Math.min(idx + 1, commands.length - 1));
            break;
          case 'ArrowUp':
            event.preventDefault();
            setActiveIndex((idx) => Math.max(idx - 1, 0));
            break;
          case 'Enter':
          case 'Tab': {
            const command = commands[activeIndex];

            if (command) {
              event.preventDefault();
              onSelect(command);
            }

            break;
          }
          case 'Escape':
            event.preventDefault();
            onDismiss?.();
            break;
          default:
            break;
        }
      },
      [activeIndex, commands, onDismiss, onSelect],
    );

    if (commands.length === 0) {
      return (
        <div
          className="bolt-slash-commands-palette"
          role="listbox"
          aria-label="Slash commands"
          data-empty="true"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <p className="bolt-slash-commands-empty">{t('slashCommands.empty')}</p>
        </div>
      );
    }

    return (
      <div
        className="bolt-slash-commands-palette"
        role="listbox"
        aria-label="Slash commands"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <ul className="bolt-slash-commands-list">
          {commands.map((command, index) => {
            const isActive = index === activeIndex;

            return (
              <li
                key={command.id}
                role="option"
                aria-selected={isActive}
                data-active={isActive ? 'true' : 'false'}
                className="bolt-slash-commands-item"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelect(command)}
              >
                <span className="bolt-slash-commands-keyword">/{command.id}</span>
                <span className="bolt-slash-commands-label">{command.label}</span>
                <span className="bolt-slash-commands-description">{command.description}</span>
                {command.shortcut ? (
                  <span className="bolt-slash-commands-shortcut" aria-label={`Shortcut ${command.shortcut}`}>
                    {command.shortcut}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {pendingArgument ? (
          <footer className="bolt-slash-commands-footer">
            <span>Argument: </span>
            <code>{pendingArgument}</code>
          </footer>
        ) : null}
      </div>
    );
  },
);

SlashCommandsPalette.displayName = 'SlashCommandsPalette';
