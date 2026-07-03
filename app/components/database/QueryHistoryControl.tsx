import * as PopoverPrimitive from '@radix-ui/react-popover';
import { History, Trash2, X } from 'lucide-react';
import Popover from '~/components/ui/Popover';

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
          History
          {entries.length ? <span className="text-bolt-elements-textTertiary">({entries.length})</span> : null}
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="px-1.5 py-1 text-[12px] text-bolt-elements-textTertiary">
          No queries yet — successful runs land here.
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
                  aria-label={`Remove from history: ${statement}`}
                  onClick={() => onRemove(statement)}
                  className="rounded p-1 text-bolt-elements-textTertiary opacity-0 hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:opacity-100 group-hover:opacity-100"
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
              Clear all
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
