import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IdePanelHeader, PanelEmptyState } from '~/components/project-ide/PanelPrimitives';
import { Checkbox } from '~/components/ui/Checkbox';
import { toast } from '~/components/ui/use-toast';
import {
  formatLockManagerCopy,
  formatLockManagerPlural,
  getLockManagerCopy,
  resolveLockManagerLanguage,
} from '~/lib/i18n/catalogs/lock-manager';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export interface LockedItem {
  path: string;
  type: 'file' | 'folder';
}

type LockFilter = 'all' | 'files' | 'folders';

function displayLockedPath(path: string): string {
  return path.replace('/home/project/', '');
}

/**
 * Optimistically drop the given path(s) from the locked-items list. Used by both
 * the per-row Unlock button and the bulk "Unlock all" action so the just-unlocked
 * item disappears immediately instead of lingering until the 5s poll refreshes.
 */
export function removeLockedPaths(items: LockedItem[], paths: Set<string> | string): LockedItem[] {
  const toRemove = typeof paths === 'string' ? new Set([paths]) : paths;
  return items.filter((item) => !toRemove.has(item.path));
}

/**
 * Drop a single path from the selected-paths set, returning a new set (mirrors the
 * immutable update pattern used throughout the LockManager component).
 */
export function removeSelectedPath(selected: Set<string>, path: string): Set<string> {
  const next = new Set(selected);
  next.delete(path);

  return next;
}

export function LockManager() {
  const { i18n } = useTranslation();
  const language = resolveLockManagerLanguage(i18n?.resolvedLanguage ?? i18n?.language);
  const copy = getLockManagerCopy(language);
  const [lockedItems, setLockedItems] = useState<LockedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<LockFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load locked items
  useEffect(() => {
    const loadLockedItems = () => {
      // We don't need to filter by chat ID here as we want to show all locked files
      const items: LockedItem[] = [];

      // Get all files and folders from the workbench store
      const allFiles = workbenchStore.files.get();

      // Check each file/folder for locks
      Object.entries(allFiles).forEach(([path, item]) => {
        if (!item) {
          return;
        }

        if (item.type === 'file' && item.isLocked) {
          items.push({
            path,
            type: 'file',
          });
        } else if (item.type === 'folder' && item.isLocked) {
          items.push({
            path,
            type: 'folder',
          });
        }
      });

      /*
       * Only update state when the locked set actually changed, otherwise the
       * 5s interval forces a full re-render every tick for no reason.
       */
      setLockedItems((prev) => {
        const prevKey = prev
          .map((i) => `${i.type}:${i.path}`)
          .sort()
          .join('|');
        const nextKey = items
          .map((i) => `${i.type}:${i.path}`)
          .sort()
          .join('|');

        return prevKey === nextKey ? prev : items;
      });
    };

    loadLockedItems();

    // Set up an interval to refresh the list periodically
    const intervalId = setInterval(loadLockedItems, 5000);

    return () => clearInterval(intervalId);
  }, []);

  // Filter and sort the locked items
  const filteredAndSortedItems = lockedItems
    .filter((item) => {
      // Apply type filter
      if (filter === 'files' && item.type !== 'file') {
        return false;
      }

      if (filter === 'folders' && item.type !== 'folder') {
        return false;
      }

      // Apply search filter
      if (searchTerm && !item.path.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      return a.path.localeCompare(b.path);
    });

  // Handle selecting/deselecting a single item
  const handleSelectItem = (path: string) => {
    const newSelectedItems = new Set(selectedItems);

    if (newSelectedItems.has(path)) {
      newSelectedItems.delete(path);
    } else {
      newSelectedItems.add(path);
    }

    setSelectedItems(newSelectedItems);
  };

  // Handle selecting/deselecting all visible items
  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      // Select all filtered items
      const allVisiblePaths = new Set(filteredAndSortedItems.map((item) => item.path));
      setSelectedItems(allVisiblePaths);
    } else {
      // Deselect all (clear selection)
      setSelectedItems(new Set());
    }
  };

  // Handle unlocking selected items
  const handleUnlockSelected = () => {
    if (selectedItems.size === 0) {
      toast.error(copy['lockManager.toast.noneSelected']);
      return;
    }

    let unlockedCount = 0;
    selectedItems.forEach((path) => {
      const item = lockedItems.find((i) => i.path === path);

      if (item) {
        if (item.type === 'file') {
          workbenchStore.unlockFile(path);
        } else {
          workbenchStore.unlockFolder(path);
        }

        unlockedCount++;
      }
    });

    if (unlockedCount > 0) {
      toast.success(
        formatLockManagerPlural(language, unlockedCount, {
          one: copy['lockManager.toast.selected_one'],
          other: copy['lockManager.toast.selected_other'],
        }),
      );

      /*
       * Optimistically drop the unlocked paths from the list immediately. The
       * list otherwise only refreshes on the 5s poll, leaving just-unlocked items
       * visibly (and confusingly) still "locked" for up to 5 seconds.
       */
      setLockedItems((prev) => removeLockedPaths(prev, selectedItems));
      setSelectedItems(new Set()); // Clear selection after unlocking
    }
  };

  const itemCount = formatLockManagerPlural(language, filteredAndSortedItems.length, {
    one: copy['lockManager.count.items_one'],
    other: copy['lockManager.count.items_other'],
  });
  const selectedCount = formatLockManagerPlural(language, selectedItems.size, {
    one: copy['lockManager.count.selected_one'],
    other: copy['lockManager.count.selected_other'],
  });

  // Determine the state of the "Select All" checkbox
  const isAllSelected = filteredAndSortedItems.length > 0 && selectedItems.size === filteredAndSortedItems.length;
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < filteredAndSortedItems.length;

  const selectAllCheckedState: boolean | 'indeterminate' = isAllSelected
    ? true
    : isSomeSelected
      ? 'indeterminate'
      : false;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* UNIF-06 (audit H1) : Locks n'avait AUCUNE tête de panneau — il adopte
          l'en-tête commun (même icône que l'onglet/rail, mêmes paddings). */}
      <IdePanelHeader icon="i-ph:lock" title={copy['lockManager.panel.title']} />
      {/* Controls */}
      <div className="flex min-w-0 flex-col gap-2 border-b border-bolt-elements-borderColor px-2 py-2 sm:flex-row sm:items-center">
        {/* Search Input */}
        <div className="relative min-w-0 flex-1">
          <span
            className="i-ph:magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-bolt-elements-textTertiary"
            aria-hidden
          />
          <input
            type="text"
            placeholder={copy['lockManager.search.placeholder']}
            aria-label={copy['lockManager.search.ariaLabel']}
            className="h-11 w-full rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-2 pl-7 pr-2 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ minWidth: 0 }}
          />
        </div>
        {/* Filter Select */}
        <select
          aria-label={copy['lockManager.filter.ariaLabel']}
          className="h-11 min-w-0 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-2 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus sm:max-w-40"
          value={filter}
          onChange={(event) => {
            const nextFilter = event.target.value;

            if (nextFilter === 'all' || nextFilter === 'files' || nextFilter === 'folders') {
              setFilter(nextFilter);
            }
          }}
        >
          <option value="all">{copy['lockManager.filter.all']}</option>
          <option value="files">{copy['lockManager.filter.files']}</option>
          <option value="folders">{copy['lockManager.filter.folders']}</option>
        </select>
      </div>

      {/* Header Row with Select All */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-2 py-2 text-xs text-bolt-elements-textSecondary">
        <div className="flex min-h-11 items-center">
          <Checkbox
            checked={selectAllCheckedState}
            onCheckedChange={handleSelectAll}
            className="mr-2 h-4 w-4 rounded border-bolt-elements-borderColor"
            aria-label={copy['lockManager.selectAll.ariaLabel']}
            disabled={filteredAndSortedItems.length === 0} // Disable if no items to select
          />
          <span>{copy['lockManager.selectAll.label']}</span>
        </div>
        {selectedItems.size > 0 && (
          <button
            type="button"
            className="ml-auto flex min-h-11 min-w-0 items-center gap-1 whitespace-normal rounded bg-bolt-elements-button-secondary-background px-3 py-2 text-center text-xs text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover"
            onClick={handleUnlockSelected}
            title={copy['lockManager.unlockSelected.title']}
          >
            {copy['lockManager.unlockSelected']}
          </button>
        )}
      </div>

      {/* List of locked items */}
      <div className="flex-1 overflow-auto modern-scrollbar px-1 py-1">
        {/* UNIF lot 4 (audit E1) — état vide canonique partagé. */}
        {filteredAndSortedItems.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2">
            <PanelEmptyState icon="i-ph:lock-open" title={copy['lockManager.empty']} className="w-full" />
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredAndSortedItems.map((item) => (
              <li
                key={item.path}
                className={classNames(
                  'group flex min-w-0 items-center gap-2 rounded px-2 py-1 text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-2',
                  selectedItems.has(item.path) ? 'bg-bolt-elements-background-depth-2' : '',
                )}
              >
                <Checkbox
                  checked={selectedItems.has(item.path)}
                  onCheckedChange={() => handleSelectItem(item.path)}
                  className="h-4 w-4 rounded border-bolt-elements-borderColor"
                  aria-labelledby={`item-label-${item.path}`} // For accessibility
                />
                <span
                  className={classNames(
                    'shrink-0 text-bolt-elements-textTertiary text-xs',
                    item.type === 'file' ? 'i-ph:file-text-duotone' : 'i-ph:folder-duotone',
                  )}
                  aria-hidden
                />
                <span id={`item-label-${item.path}`} className="min-w-0 flex-1 truncate text-xs" title={item.path}>
                  {displayLockedPath(item.path)}
                </span>
                <button
                  type="button"
                  aria-label={formatLockManagerCopy(copy['lockManager.unlockItem.ariaLabel'], {
                    path: displayLockedPath(item.path),
                  })}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded bg-transparent px-2 py-2 text-xs hover:bg-bolt-elements-background-depth-3"
                  onClick={() => {
                    if (item.type === 'file') {
                      workbenchStore.unlockFile(item.path);
                    } else {
                      workbenchStore.unlockFolder(item.path);
                    }

                    /*
                     * Optimistically drop the just-unlocked item from the list and
                     * selection so it disappears immediately, instead of lingering
                     * (still showing the lock affordance) until the 5s poll, which
                     * would contradict the success toast below. Mirrors the bulk
                     * "Unlock all" path in handleUnlockSelected.
                     */
                    setLockedItems((prev) => removeLockedPaths(prev, item.path));
                    setSelectedItems((prev) => removeSelectedPath(prev, item.path));

                    toast.success(
                      formatLockManagerCopy(copy['lockManager.toast.item'], {
                        path: displayLockedPath(item.path),
                      }),
                    );
                  }}
                  title={copy['lockManager.unlockItem.title']}
                >
                  <span className="i-ph:lock-open text-xs" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="flex min-w-0 flex-wrap items-center justify-between border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-2 text-xs text-bolt-elements-textTertiary">
        <div className="break-words">
          {formatLockManagerCopy(copy['lockManager.footer'], { items: itemCount, selected: selectedCount })}
        </div>
      </div>
    </div>
  );
}
