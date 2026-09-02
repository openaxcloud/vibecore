import * as PopoverPrimitive from '@radix-ui/react-popover';
import { History, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Popover from '~/components/ui/Popover';
import { useCoarsePointer } from '~/lib/hooks/useCoarsePointer';
import {
  formatDatabaseStudioCopy,
  formatDatabaseStudioNumber,
  getDatabaseStudioCopy,
} from '~/lib/i18n/catalogs/database-studio';
import { classNames } from '~/utils/classNames';

/*
 * G14 — Database Studio query history control. Pure presentation: the MRU
 * itself lives in query-history.ts and is owned by DatabaseStudio state.
 * Blue = app/IDE action accent (design accent policy), via token only.
 */
interface QueryHistoryControlProps {
  entries: string[];
  onClear: () => void;
  onPick: (statement: string) => void;
  onRemove: (statement: string) => void;
}

export function QueryHistoryControl({ entries, onClear, onPick, onRemove }: QueryHistoryControlProps) {
  const coarse = useCoarsePointer();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDatabaseStudioCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatDatabaseStudioCopy(template, values);

  return (
    <Popover
      side="bottom"
      align="start"
      testId="db-query-history"
      contentClassName="w-80 p-1.5"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[12px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
        >
          <History className="h-3.5 w-3.5" style={{ color: 'var(--vc-ide-accent-action)' }} aria-hidden />
          {copy['databaseStudio.history.title']}
          {entries.length ? (
            <span className="text-bolt-elements-textTertiary">
              {text(copy['databaseStudio.history.count'], {
                count: formatDatabaseStudioNumber(entries.length, language),
              })}
            </span>
          ) : null}
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="px-1.5 py-1 text-[12px] text-bolt-elements-textTertiary">
          {copy['databaseStudio.history.empty']}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <ul className="flex max-h-64 flex-col gap-0.5 overflow-auto">
            {entries.map((statement) => (
              <li key={statement} className="group flex items-center gap-1">
                <PopoverPrimitive.Close asChild>
                  <button
                    type="button"
                    title={statement}
                    onClick={() => onPick(statement)}
                    className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left font-mono text-[12px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 hover:text-[color:var(--vc-ide-accent-action)]"
                  >
                    {statement}
                  </button>
                </PopoverPrimitive.Close>
                <button
                  type="button"
                  aria-label={text(copy['databaseStudio.history.remove'], { statement })}
                  onClick={() => onRemove(statement)}
                  className={classNames(
                    'rounded p-1 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:opacity-100',
                    /*
                     * Au doigt, ce bouton SUPPRIMER etait invisible : pas de
                     * survol, et le `focus-visible:` n'arrive qu'apres le
                     * toucher. Penser au clavier ne couvre pas le tactile.
                     */
                    coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-bolt-elements-borderColor pt-1">
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              {copy['databaseStudio.history.clear']}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
