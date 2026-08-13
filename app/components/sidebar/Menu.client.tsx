import { useStore } from '@nanostores/react';
import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from '~/components/@settings/core/account-menu-links';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import {
  formatSidebarMenuDate,
  formatSidebarMenuNumber,
  formatSidebarMenuPlural,
  formatSidebarMenuTime,
  getSidebarMenuCopy,
  interpolateSidebarMenuCopy,
  resolveSidebarMenuLanguage,
} from '~/lib/i18n/catalogs/sidebar-menu';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { sidebarMenuStore } from '~/lib/stores/menu';
import { profileStore } from '~/lib/stores/profile';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-340px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent =
  | { type: 'delete'; item: ChatHistoryItem }
  | { type: 'bulkDelete'; items: ChatHistoryItem[] }
  | null;

type HistoryLoadState = 'idle' | 'loading' | 'ready' | 'error';

function CurrentDateTime({ language }: { language: string }) {
  const [dateTime, setDateTime] = useState(new Date());
  const copy = getSidebarMenuCopy(language).sidebarMenu.header;

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <time
      dateTime={dateTime.toISOString()}
      aria-label={copy.currentDateTime}
      className="flex min-w-0 items-center gap-2 border-b border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textSecondary"
    >
      <span className="h-4 w-4 shrink-0 i-ph:clock opacity-80" aria-hidden="true" />
      <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
        <span>{formatSidebarMenuDate(dateTime, language)}</span>
        <span>{formatSidebarMenuTime(dateTime, language)}</span>
      </span>
    </time>
  );
}

export const Menu = () => {
  const { i18n } = useTranslation();
  const language = resolveSidebarMenuLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getSidebarMenuCopy(language).sidebarMenu;
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [historyLoadState, setHistoryLoadState] = useState<HistoryLoadState>('idle');

  // Drawer open state lives in a shared store so the header toggle stays in sync.
  const open = useStore(sidebarMenuStore);
  const setOpen = useCallback((value: boolean) => sidebarMenuStore.set(value), []);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const profile = useStore(profileStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(async () => {
    setHistoryLoadState('loading');

    if (!db) {
      setList([]);
      setHistoryLoadState('ready');

      return;
    }

    try {
      const entries = await getAll(db);
      setList(entries.filter((item) => item.urlId && item.description));
      setHistoryLoadState('ready');
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setHistoryLoadState('error');
      toast.error(copy.toasts.loadFailed);
    }
  }, [copy.toasts.loadFailed]);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error(copy.errors.databaseUnavailable);
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
    },
    [copy.errors.databaseUnavailable],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      deleteChat(item.id)
        .then(() => {
          toast.success(copy.toasts.deleteSuccess, {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Always refresh the list
          void loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          console.error('Failed to delete chat:', error);
          toast.error(copy.toasts.deleteFailed, {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Still try to reload entries in case data has changed
          void loadEntries();
        });
    },
    [copy.toasts.deleteFailed, copy.toasts.deleteSuccess, loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        return;
      }

      let deletedCount = 0;

      const errors: string[] = [];
      const currentChatId = chatId.get();

      let shouldNavigate = false;

      // Process deletions sequentially using the shared deleteChat logic
      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          console.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      // Show appropriate toast message
      if (errors.length === 0) {
        toast.success(formatSidebarMenuPlural(language, deletedCount, copy.toasts.bulkDeleteSuccess));
      } else {
        toast.warning(
          interpolateSidebarMenuCopy(copy.toasts.bulkDeletePartial, {
            deleted: formatSidebarMenuNumber(deletedCount, language),
            total: formatSidebarMenuNumber(itemsToDeleteIds.length, language),
            failed: formatSidebarMenuNumber(errors.length, language),
          }),
          {
            autoClose: 5000,
          },
        );
      }

      // Reload the list after all deletions
      await loadEntries();

      // Clear selection state
      setSelectedItems([]);
      setSelectionMode(false);

      // Navigate if needed
      if (shouldNavigate) {
        window.location.pathname = '/';
      }
    },
    [copy.toasts.bulkDeletePartial, copy.toasts.bulkDeleteSuccess, deleteChat, language, loadEntries],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);

    if (selectionMode) {
      // If turning selection mode OFF, clear selection
      setSelectedItems([]);
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  }, []); // No dependencies needed

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info(copy.toasts.selectionRequired);
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error(copy.toasts.selectionNotFound);
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [copy.toasts.selectionNotFound, copy.toasts.selectionRequired, selectedItems, list]); // Keep list dependency

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        // Deselect only the filtered items
        return prev.filter((id) => !allFilteredIds.includes(id));
      } else {
        // Select all filtered items, adding them to any existing selections
        return [...new Set([...prev, ...allFilteredIds])];
      }
    });
  }, [filteredList]); // Depends only on filteredList

  useEffect(() => {
    if (open) {
      void loadEntries();
    }
  }, [open, loadEntries]);

  /*
   * Selection state is intentionally NOT cleared when the sidebar closes so it
   * persists when the sidebar is reopened.
   */

  useEffect(() => {
    const enterThreshold = 20;
    const exitThreshold = 20;

    function onMouseMove(event: MouseEvent) {
      /*
       * Don't fight modal surfaces: while settings or a confirmation dialog is open,
       * the cursor-edge open/close heuristic must not toggle the sidebar underneath them.
       */
      if (isSettingsOpen || dialogContent !== null) {
        return;
      }

      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [isSettingsOpen, dialogContent]);

  // Esc closes the drawer (keyboard accessibility) when no modal owns the Esc.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSettingsOpen && dialogContent === null) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSettingsOpen, dialogContent]);

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateCurrentChat(id);
      await loadEntries(); // Reload the list after duplication
    } catch (error) {
      console.error('Failed to duplicate chat:', error);
      toast.error(copy.toasts.duplicateFailed);
    }
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
    setOpen(false);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  const allFilteredAreSelected =
    filteredList.length > 0 && filteredList.every((item) => selectedItems.includes(item.id));

  return (
    <>
      {/*
       * Touch/click entry point. The cursor-edge `mousemove` heuristic below is a
       * desktop-only enhancement and never fires on touch devices, so without this
       * button the entire sidebar (chat history, settings, theme) was unreachable
       * on phones/tablets. Shown only while the drawer is closed.
       */}
      {/*
       * Mobile/touch entry point only (lg:hidden below). On desktop the classic
       * header renders its brand logo at the same top-left spot, so a fixed
       * floating button there overlapped the logo — and the desktop cursor-edge
       * hover heuristic already opens the drawer.
       */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={copy.aria.openMenu}
          title={copy.aria.openMenu}
          aria-expanded={open}
          aria-controls="chat-history-sidebar"
          className="vc-focus-ring fixed top-3 [inset-inline-start:0.75rem] z-sidebar flex lg:hidden items-center justify-center w-11 h-11 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor shadow-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 transition-colors"
        >
          <span className="i-ph:list text-xl" aria-hidden="true" />
        </button>
      )}

      {/* Tap-dismiss backdrop on small screens (rendered below the drawer). */}
      {open && (
        <div
          className="fixed inset-0 z-sidebar bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <motion.div
        id="chat-history-sidebar"
        ref={menuRef}
        role="navigation"
        aria-label={copy.aria.navigation}
        aria-hidden={!open}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        style={{ width: '340px', maxWidth: '90vw' }}
        className={classNames(
          'flex selection-accent flex-col side-menu fixed top-0 h-dvh max-h-dvh overflow-hidden rounded-r-2xl',
          'bg-bolt-elements-background-depth-1 border-r border-bolt-elements-borderColor',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
        )}
      >
        <div className="min-h-14 flex min-w-0 items-center justify-between gap-2 px-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-tr-2xl">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <IconButton
              icon="i-ph:question"
              size="xl"
              title={copy.header.help}
              data-testid="help-button"
              className="h-11 w-11 shrink-0 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
              onClick={() =>
                window.open(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.helpDocs), '_blank', 'noopener,noreferrer')
              }
            />
            <span className="min-w-0 flex-1 font-medium text-sm text-bolt-elements-textPrimary truncate">
              {profile?.username || copy.header.guestUser}
            </span>
            <div className="flex items-center justify-center w-[32px] h-[32px] overflow-hidden bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary rounded-full shrink-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={interpolateSidebarMenuCopy(copy.aria.userAvatar, {
                    name: profile?.username || copy.header.fallbackUser,
                  })}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="i-ph:user-fill text-lg" aria-hidden="true" />
              )}
            </div>
            <IconButton
              icon="i-ph:x"
              size="xl"
              title={copy.aria.closeMenu}
              className="h-11 w-11 shrink-0 lg:hidden"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
        <CurrentDateTime language={language} />
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <a
                href="/"
                className="vc-focus-ring min-h-11 min-w-0 flex-1 flex gap-2 items-center bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-backgroundActive rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:plus-circle h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 whitespace-normal text-sm font-medium">{copy.history.startNewChat}</span>
              </a>
              <button
                type="button"
                onClick={toggleSelectionMode}
                className={classNames(
                  'vc-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-3 py-2 transition-colors',
                  selectionMode
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border border-[var(--vc-ide-accent-action)]'
                    : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                )}
                aria-label={selectionMode ? copy.aria.exitSelectionMode : copy.aria.enterSelectionMode}
                title={selectionMode ? copy.aria.exitSelectionMode : copy.aria.enterSelectionMode}
                aria-pressed={selectionMode}
              >
                <span className={selectionMode ? 'i-ph:x h-4 w-4' : 'i-ph:check-square h-4 w-4'} aria-hidden="true" />
              </button>
            </div>
            <div className="relative w-full">
              <div className="absolute [inset-inline-start:0.75rem] top-1/2 -translate-y-1/2">
                <span className="i-ph:magnifying-glass h-4 w-4 text-bolt-elements-textTertiary" aria-hidden="true" />
              </div>
              <input
                className="min-h-11 w-full bg-bolt-elements-background-depth-2 relative [padding-inline-start:2.25rem] [padding-inline-end:0.75rem] py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus text-sm text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary border border-bolt-elements-borderColor"
                type="search"
                placeholder={copy.history.searchPlaceholder}
                onChange={handleSearchChange}
                aria-label={copy.aria.searchChats}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <div className="min-w-0 font-medium text-bolt-elements-textSecondary">{copy.history.title}</div>
            {selectionMode && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <span className="w-full text-end text-xs text-bolt-elements-textTertiary" aria-live="polite">
                  {formatSidebarMenuPlural(language, selectedItems.length, copy.history.selectedCount)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="min-h-11 whitespace-normal text-center"
                >
                  {allFilteredAreSelected ? copy.history.deselectAll : copy.history.selectAll}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedItems.length === 0}
                  className="min-h-11 whitespace-normal text-center"
                >
                  {copy.history.deleteSelected}
                </Button>
              </div>
            )}
          </div>
          {/* BD-29: standalone chats live in this device's IndexedDB only, never synced across devices. Say so. */}
          <p className="px-4 pb-2 text-xs text-bolt-elements-textTertiary">{copy.history.localOnlyNote}</p>
          <div
            className="min-h-0 flex-1 overflow-auto px-3 pb-3"
            aria-busy={historyLoadState === 'loading'}
            aria-live="polite"
          >
            {historyLoadState === 'loading' && (
              <div role="status" className="space-y-2 px-1 py-2">
                <span className="sr-only">{copy.history.loading}</span>
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-11 animate-pulse rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
            {historyLoadState === 'error' && (
              <div
                role="alert"
                className="mx-1 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)]"
              >
                <p>{copy.history.loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-11 whitespace-normal"
                  onClick={() => void loadEntries()}
                >
                  {copy.history.retry}
                </Button>
              </div>
            )}
            {historyLoadState === 'ready' && filteredList.length === 0 && (
              <div role="status" className="px-4 py-3 text-bolt-elements-textTertiary text-sm">
                {list.length === 0 ? copy.history.empty : copy.history.noMatches}
              </div>
            )}
            <DialogRoot open={dialogContent !== null}>
              {historyLoadState === 'ready' &&
                binDates(filteredList, language).map(({ category, items }) => (
                  <div key={category} className="mt-2 first:mt-0 space-y-1">
                    <div className="text-xs font-medium text-bolt-elements-textTertiary sticky top-0 z-1 bg-bolt-elements-background-depth-1 px-4 py-1">
                      {category}
                    </div>
                    <div className="space-y-0.5 pr-1">
                      {items.map((item) => (
                        <HistoryItem
                          key={item.id}
                          item={item}
                          exportChat={exportChat}
                          onDelete={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDialogContent({ type: 'delete', item });
                          }}
                          onDuplicate={() => handleDuplicate(item.id)}
                          selectionMode={selectionMode}
                          isSelected={selectedItems.includes(item.id)}
                          onToggleSelection={toggleItemSelection}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {dialogContent?.type === 'delete' && (
                  <>
                    <div className="p-6 bg-bolt-elements-background-depth-1">
                      <DialogTitle className="text-bolt-elements-textPrimary">{copy.dialogs.singleTitle}</DialogTitle>
                      <DialogDescription asChild className="mt-2 text-bolt-elements-textSecondary">
                        <div>
                          <p>
                            {copy.dialogs.singleLead}{' '}
                            <span className="break-words font-medium text-bolt-elements-textPrimary">
                              {dialogContent.item.description}
                            </span>
                          </p>
                          <p className="mt-2">{copy.dialogs.singleQuestion}</p>
                        </div>
                      </DialogDescription>
                    </div>
                    <div className="flex flex-wrap justify-end gap-3 px-6 py-4 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        <span className="inline-flex min-h-7 items-center">{copy.dialogs.cancel}</span>
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          deleteItem(event, dialogContent.item);
                          closeDialog();
                        }}
                      >
                        <span className="inline-flex min-h-7 items-center">{copy.dialogs.delete}</span>
                      </DialogButton>
                    </div>
                  </>
                )}
                {dialogContent?.type === 'bulkDelete' && (
                  <>
                    <div className="p-6 bg-bolt-elements-background-depth-1">
                      <DialogTitle className="text-bolt-elements-textPrimary">{copy.dialogs.bulkTitle}</DialogTitle>
                      <DialogDescription asChild className="mt-2 text-bolt-elements-textSecondary">
                        <div>
                          <p>{formatSidebarMenuPlural(language, dialogContent.items.length, copy.dialogs.bulkLead)}</p>
                          <div className="mt-2 max-h-32 overflow-auto border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 p-2">
                            <ul className="list-disc pl-5 space-y-1">
                              {dialogContent.items.map((item) => (
                                <li key={item.id} className="break-words text-sm">
                                  <span className="font-medium text-bolt-elements-textPrimary">{item.description}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <p className="mt-3">{copy.dialogs.bulkQuestion}</p>
                        </div>
                      </DialogDescription>
                    </div>
                    <div className="flex flex-wrap justify-end gap-3 px-6 py-4 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        <span className="inline-flex min-h-7 items-center">{copy.dialogs.cancel}</span>
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={() => {
                          /*
                           * Pass the current selectedItems to the delete function.
                           * This captures the state at the moment the user confirms.
                           */
                          const itemsToDeleteNow = [...selectedItems];
                          deleteSelectedItems(itemsToDeleteNow);
                          closeDialog();
                        }}
                      >
                        <span className="inline-flex min-h-7 items-center">{copy.dialogs.delete}</span>
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>
          <div className="flex items-center justify-between border-t border-bolt-elements-borderColor px-4 py-3">
            <div className="flex items-center gap-3">
              <IconButton
                onClick={handleSettingsClick}
                icon="i-ph:gear"
                size="xl"
                title={copy.header.settings}
                data-testid="settings-button"
                className="h-11 w-11 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
              />
            </div>
            <ThemeSwitch title={copy.header.toggleTheme} className="h-11 w-11" />
          </div>
        </div>
      </motion.div>

      <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
};
