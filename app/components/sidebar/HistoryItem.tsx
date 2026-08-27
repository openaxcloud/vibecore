import { forwardRef, type ForwardedRef, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Checkbox } from '~/components/ui/Checkbox';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { getSidebarMenuCopy, interpolateSidebarMenuCopy } from '~/lib/i18n/catalogs/sidebar-menu';
import { type ChatHistoryItem } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';

/**
 * Media query used to detect touch / pen primary-input devices.
 *
 * `(pointer: coarse)` matches phones, tablets and other devices whose primary
 * pointing mechanism has limited accuracy and — crucially — no hover state.
 * Hover-only affordances (e.g. `group-hover:opacity-100`) are unreachable on
 * such devices.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Resolve whether the current device uses a coarse (touch) primary pointer.
 *
 * Returns `false` during SSR or when `matchMedia` is unavailable so that the
 * default (hover-capable) rendering is used until the client hydrates.
 */
export function resolveCoarsePointer(win: Pick<typeof globalThis, 'matchMedia'> | undefined): boolean {
  if (!win || typeof win.matchMedia !== 'function') {
    return false;
  }

  try {
    return win.matchMedia(COARSE_POINTER_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * React hook returning `true` when the device's primary pointer is coarse
 * (touch), updating live if the capability changes (e.g. external mouse
 * attached/detached, browser devtools device emulation).
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState<boolean>(() =>
    resolveCoarsePointer(typeof window === 'undefined' ? undefined : window),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsCoarse(event.matches);

    /*
     * Sync once on mount in case the value changed between the initial render
     * and the effect running.
     */
    setIsCoarse(mql.matches);
    mql.addEventListener('change', onChange);

    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isCoarse;
}

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onDuplicate?: (id: string) => void;
  exportChat: (id?: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
}

export function HistoryItem({
  item,
  onDelete,
  onDuplicate,
  exportChat,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
}: HistoryItemProps) {
  const { i18n } = useTranslation();
  const copy = getSidebarMenuCopy(i18n.resolvedLanguage ?? i18n.language).sidebarMenu;
  const { id: urlId } = useParams();
  const isActiveChat = urlId === item.urlId;

  /**
   * Touch devices have no hover state, so the hover-only action buttons
   * (Export / Duplicate / Rename / Delete) are otherwise permanently invisible
   * and there is no way to rename, duplicate, export or delete an individual
   * chat from a phone/tablet. Surface them always-on when the primary pointer
   * is coarse.
   */
  const isCoarsePointer = useCoarsePointer();

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription: item.description,
      customChatId: item.id,
      syncWithGlobalStore: isActiveChat,
    });

  const handleItemClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectionMode) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelection?.(item.id);
      }
    },
    [selectionMode, item.id, onToggleSelection],
  );

  const handleCheckboxChange = useCallback(() => {
    onToggleSelection?.(item.id);
  }, [item.id, onToggleSelection]);

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      event.preventDefault();
      event.stopPropagation();

      if (onDelete) {
        onDelete(event as unknown as React.UIEvent);
      }
    },
    [onDelete, item.id],
  );

  return (
    <div
      className={classNames(
        'group min-h-11 rounded-lg text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 overflow-hidden flex justify-between items-center px-3 py-2 transition-colors',
        { 'text-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundAccent': isActiveChat },
        { 'cursor-pointer': selectionMode },
      )}
      onClick={selectionMode ? handleItemClick : undefined}
    >
      {selectionMode && (
        <div className="flex items-center [margin-inline-end:0.5rem]" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            id={`select-${item.id}`}
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            aria-label={interpolateSidebarMenuCopy(copy.aria.selectConversation, {
              name: currentDescription,
            })}
            className="h-5 w-5"
          />
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary rounded-md px-3 py-1.5 text-sm border border-bolt-elements-borderColor focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus"
            aria-label={interpolateSidebarMenuCopy(copy.aria.renameConversation, {
              name: currentDescription,
            })}
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            aria-label={copy.history.actions.saveName}
            title={copy.history.actions.saveName}
            className="vc-focus-ring i-ph:check inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-bolt-elements-textTertiary hover:text-[var(--vc-ide-accent-action)] transition-colors"
            onMouseDown={handleSubmit}
          />
        </form>
      ) : (
        <a
          href={`/chat/${item.urlId}`}
          className="flex w-full relative truncate block"
          onClick={selectionMode ? handleItemClick : undefined}
          aria-current={isActiveChat ? 'page' : undefined}
        >
          <WithTooltip tooltip={currentDescription}>
            <span
              className={classNames(
                'truncate',
                isCoarsePointer ? '[padding-inline-end:14rem]' : '[padding-inline-end:10rem]',
              )}
            >
              {currentDescription}
            </span>
          </WithTooltip>
          <div
            className={classNames(
              'absolute [inset-inline-end:0] top-0 bottom-0 flex items-center bg-transparent px-2 transition-colors',
            )}
          >
            <div
              className={classNames(
                'flex items-center gap-2.5 text-bolt-elements-textTertiary transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                isCoarsePointer ? 'opacity-100' : 'opacity-0',
              )}
            >
              <ChatActionButton
                toolTipContent={copy.history.actions.export}
                icon="i-ph:download-simple h-4 w-4"
                coarsePointer={isCoarsePointer}
                onClick={(event) => {
                  event.preventDefault();
                  exportChat(item.id);
                }}
              />
              {onDuplicate && (
                <ChatActionButton
                  toolTipContent={copy.history.actions.duplicate}
                  icon="i-ph:copy h-4 w-4"
                  coarsePointer={isCoarsePointer}
                  onClick={(event) => {
                    event.preventDefault();
                    onDuplicate?.(item.id);
                  }}
                />
              )}
              <ChatActionButton
                toolTipContent={copy.history.actions.rename}
                icon="i-ph:pencil-fill h-4 w-4"
                coarsePointer={isCoarsePointer}
                onClick={(event) => {
                  event.preventDefault();
                  toggleEditMode();
                }}
              />
              <ChatActionButton
                toolTipContent={copy.history.actions.delete}
                icon="i-ph:trash h-4 w-4"
                className="hover:text-[var(--status-error-text)]"
                coarsePointer={isCoarsePointer}
                onClick={handleDeleteClick}
              />
            </div>
          </div>
        </a>
      )}
    </div>
  );
}

const ChatActionButton = forwardRef(
  (
    {
      toolTipContent,
      icon,
      className,
      coarsePointer,
      onClick,
    }: {
      toolTipContent: string;
      icon: string;
      className?: string;
      coarsePointer?: boolean;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <WithTooltip tooltip={toolTipContent} position="bottom" sideOffset={4}>
        <button
          ref={ref}
          type="button"
          aria-label={toolTipContent}
          title={toolTipContent}
          className={classNames(
            'vc-focus-ring inline-flex shrink-0 items-center justify-center rounded-md text-bolt-elements-textTertiary hover:text-[var(--vc-ide-accent-action)] transition-colors',
            coarsePointer ? 'h-11 w-11' : 'h-7 w-7',
            icon,
            className,
          )}
          onClick={onClick}
        />
      </WithTooltip>
    );
  },
);
