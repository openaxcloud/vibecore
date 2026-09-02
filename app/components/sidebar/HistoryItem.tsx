import { forwardRef, type ForwardedRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Checkbox } from '~/components/ui/Checkbox';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { useCoarsePointer } from '~/lib/hooks/useCoarsePointer';
import { getSidebarMenuCopy, interpolateSidebarMenuCopy } from '~/lib/i18n/catalogs/sidebar-menu';
import { type ChatHistoryItem } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';

/*
 * Ré-export temporaire : la primitive vit désormais dans `~/lib/hooks`. Cet
 * alias évite de casser les imports existants le temps qu'ils migrent, et sera
 * retiré une fois les consommateurs déplacés.
 */
export { COARSE_POINTER_QUERY, resolveCoarsePointer, useCoarsePointer } from '~/lib/hooks/useCoarsePointer';

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
