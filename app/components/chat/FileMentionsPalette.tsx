/**
 * Presentational @file-mention palette for the chat composer.
 *
 * Sprint 3 — given the current query (the text typed after the `@`) the
 * palette renders the top fuzzy matches from `useFileMentions` and lets
 * the user pick one with arrow keys + Enter, mouse click, or Escape to
 * dismiss. It does NOT own the composer's text input — the parent decides
 * where to anchor and how to splice the selected path into the prompt.
 */

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFileMentions, type FileMentionCandidate } from '~/lib/hooks/useFileMentions';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';

export interface FileMentionsPaletteProps {
  /** Free-text query, typically what the user typed after `@`. */
  query: string;

  /** Called when the user picks a candidate. Returns the selected file. */
  onSelect: (candidate: FileMentionCandidate) => void;

  /** Called when the user presses Escape or the palette wants to close. */
  onDismiss?: () => void;

  /** Optional max number of results; defaults to 12. */
  limit?: number;

  /**
   * MRU display paths the user has previously mentioned — boosts those
   * entries in the palette ranking so frequent files surface first.
   */
  recentMentionedFilePaths?: readonly string[];
}

export const FileMentionsPalette = memo(
  ({ query, onSelect, onDismiss, limit, recentMentionedFilePaths }: FileMentionsPaletteProps) => {
    const { i18n } = useTranslation();
    const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);
    const candidates = useFileMentions(query, { limit, recentMentionedFilePaths });
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);
    const listboxId = useId();

    /*
     * Clamp the active index when the candidate list shrinks (e.g. typing
     * narrows the matches). Also reset to the top whenever the query
     * changes — that's the standard palette UX.
     */
    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      if (activeIndex >= candidates.length) {
        setActiveIndex(Math.max(0, candidates.length - 1));
      }
    }, [activeIndex, candidates.length]);

    const select = useCallback(
      (candidate: FileMentionCandidate | undefined) => {
        if (!candidate) {
          return;
        }

        onSelect(candidate);
      },
      [onSelect],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            setActiveIndex((idx) => Math.min(idx + 1, candidates.length - 1));
            break;
          case 'ArrowUp':
            event.preventDefault();
            setActiveIndex((idx) => Math.max(idx - 1, 0));
            break;
          case 'Enter':
          case 'Tab':
            event.preventDefault();
            select(candidates[activeIndex]);
            break;
          case 'Escape':
            event.preventDefault();
            onDismiss?.();
            break;
          default:
            break;
        }
      },
      [activeIndex, candidates, onDismiss, select],
    );

    if (candidates.length === 0) {
      return (
        <div
          className="bolt-file-mentions-palette"
          role="listbox"
          aria-label={copy['chatResiduals.mentions.aria']}
          data-empty="true"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <p className="bolt-file-mentions-empty">{copy['chatResiduals.mentions.empty']}</p>
        </div>
      );
    }

    return (
      <div
        className="bolt-file-mentions-palette"
        role="listbox"
        aria-label={copy['chatResiduals.mentions.aria']}
        aria-activedescendant={`${listboxId}-${activeIndex}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <ul ref={listRef} className="bolt-file-mentions-list">
          {candidates.map((candidate, index) => {
            const isActive = index === activeIndex;

            return (
              <li
                key={candidate.absolutePath}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isActive}
                data-active={isActive ? 'true' : 'false'}
                className="bolt-file-mentions-item min-h-11"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(candidate)}
              >
                <span className="i-ph:file-code bolt-file-mentions-icon" aria-hidden />
                <span className="bolt-file-mentions-basename">{candidate.basename}</span>
                <span className="bolt-file-mentions-path">{candidate.displayPath}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
);

FileMentionsPalette.displayName = 'FileMentionsPalette';
