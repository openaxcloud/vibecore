/**
 * Header dropdown that lets the user browse and switch between
 * conversation branches archived in `projectIdeMemory.chat.conversations`
 * (Sprint 6 wiring).
 *
 * The button shows "Branches · N" with the current count. Clicking opens
 * a small popover with the full branch tree — each entry switches the
 * active thread on click (via useProjectChatBranches.switchTo) and lets
 * the user rename or delete via secondary buttons.
 *
 * Auto-apply does not affect this surface — branch navigation is a
 * user-initiated read/write of persisted state. Bolt standalone has no
 * projectId so this component renders null by design (mount guarded by
 * the parent passing projectId).
 */

import { forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ForwardedRef, MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { ConfirmationDialog } from '~/components/ui/Dialog';
import { InputDialog } from '~/components/ui/InputDialog';
import type { BranchedConversation, BranchNode } from '~/lib/chat/chat-branches';
import { useProjectChatBranches } from '~/lib/hooks/useProjectChatBranches';

export interface ConversationBranchesMenuProps {
  projectId: string;
  className?: string;
}

interface BranchRowProps {
  node: BranchNode;
  depth: number;
  activeId: string | undefined;
  onSwitch: (conversationId: string) => Promise<void> | void;
  onRename: (conversationId: string, currentTitle: string | undefined) => Promise<void> | void;
  onRemove: (conversationId: string) => Promise<void> | void;
}

const BranchRow = memo(({ node, depth, activeId, onSwitch, onRename, onRemove }: BranchRowProps) => {
  const { t } = useTranslation();
  const isActive = node.conversation.id === activeId;
  const messageCount = node.conversation.messages.length;
  const label = node.conversation.title?.trim() || node.conversation.id;

  return (
    <>
      <li
        className="bolt-branches-row"
        data-active={isActive ? 'true' : 'false'}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <button
          type="button"
          className="bolt-branches-row-switch"
          onClick={() => onSwitch(node.conversation.id)}
          title={t('branches.row.switch', { label })}
        >
          <span className="bolt-branches-row-icon i-ph:git-branch" aria-hidden />
          <span className="bolt-branches-row-label">{label}</span>
          <span className="bolt-branches-row-count">{messageCount}</span>
        </button>
        <span className="bolt-branches-row-actions">
          <button
            type="button"
            className="bolt-branches-row-action"
            aria-label={t('branches.row.rename', { label })}
            title={t('branches.row.renameTitle')}
            onClick={() => onRename(node.conversation.id, node.conversation.title)}
          >
            <span className="i-ph:pencil-simple" aria-hidden />
          </button>
          <button
            type="button"
            className="bolt-branches-row-action"
            aria-label={t('branches.row.delete', { label })}
            title={t('branches.row.deleteTitle')}
            onClick={() => onRemove(node.conversation.id)}
          >
            <span className="i-ph:trash" aria-hidden />
          </button>
        </span>
      </li>
      {node.children.map((child) => (
        <BranchRow
          key={child.conversation.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          onSwitch={onSwitch}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
    </>
  );
});

BranchRow.displayName = 'ConversationBranchesMenu.BranchRow';

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

export const ConversationBranchesMenu = memo(
  forwardRef<HTMLDivElement, ConversationBranchesMenuProps>(({ projectId, className }, forwardedRef) => {
    const { t } = useTranslation();
    const { conversations, tree, switchTo, rename, remove } = useProjectChatBranches(projectId);
    const [isOpen, setIsOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<{ id: string; title?: string } | null>(null);
    const [removeTarget, setRemoveTarget] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const setContainerRef = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        assignForwardedRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    useEffect(() => {
      if (!isOpen) {
        return undefined;
      }

      const handleDocumentClick = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleDocumentClick);
      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('mousedown', handleDocumentClick);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isOpen]);

    /*
     * "Active" branch detection — we don't have an explicit current-branch
     * field, but the convention for the live thread is conversation id
     * `project:${projectId}`. Anything else is an archived branch.
     */
    const activeId = `project:${projectId}`;

    const handleSwitch = useCallback(
      async (conversationId: string) => {
        const ok = await switchTo(conversationId);

        if (ok) {
          toast.success(t('branches.switchedToast'));
          setIsOpen(false);
        } else {
          toast.error(t('branches.switchFailedToast'));
        }
      },
      [switchTo, t],
    );

    const handleRename = useCallback((conversationId: string, currentTitle: string | undefined) => {
      setRenameTarget({ id: conversationId, title: currentTitle });
    }, []);

    const performRename = useCallback(
      async (value: string) => {
        const target = renameTarget;
        setRenameTarget(null);

        if (!target) {
          return;
        }

        try {
          await rename(target.id, value.trim());
        } catch {
          /*
           * Surface the failure: the rename was optimistic, so without this the
           * user thinks it saved when it didn't.
           */
          toast.error(t('branches.renameFailedToast'));
        }
      },
      [rename, renameTarget, t],
    );

    const handleRemove = useCallback((conversationId: string) => {
      setRemoveTarget(conversationId);
    }, []);

    const performRemove = useCallback(async () => {
      const target = removeTarget;
      setRemoveTarget(null);

      if (!target) {
        return;
      }

      try {
        await remove(target);
        toast.success(t('branches.deletedToast'));
      } catch {
        toast.error(t('branches.deleteFailedToast'));
      }
    }, [remove, removeTarget, t]);

    if (conversations.length === 0) {
      return null;
    }

    return (
      <div ref={setContainerRef} className={className ? `${className} bolt-branches-menu` : 'bolt-branches-menu'}>
        <button
          type="button"
          className="bolt-branches-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t('branches.ariaLabel', { count: conversations.length })}
          title={t('branches.trigger.title')}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="i-ph:git-branch" aria-hidden />
          <span className="bolt-branches-menu-count">{conversations.length}</span>
        </button>
        {isOpen ? (
          <div className="bolt-branches-menu-popover" role="menu">
            <ol className="bolt-branches-list">
              {tree.map((node) => (
                <BranchRow
                  key={node.conversation.id}
                  node={node}
                  depth={0}
                  activeId={activeId}
                  onSwitch={handleSwitch}
                  onRename={handleRename}
                  onRemove={handleRemove}
                />
              ))}
            </ol>
          </div>
        ) : null}
        <InputDialog
          isOpen={renameTarget !== null}
          onClose={() => setRenameTarget(null)}
          onSubmit={(value) => void performRename(value)}
          title={t('branches.renamePrompt')}
          label={t('branches.renameLabel')}
          initialValue={renameTarget?.title ?? ''}
          confirmLabel={t('branches.renameAction')}
          validate={(value) => (value.trim() ? undefined : t('branches.emptyTitleToast'))}
        />
        <ConfirmationDialog
          isOpen={removeTarget !== null}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void performRemove()}
          title={t('branches.deleteConfirm')}
          description={t('branches.deleteDescription')}
          confirmLabel={t('branches.deleteAction')}
          variant="destructive"
        />
      </div>
    );
  }),
);

ConversationBranchesMenu.displayName = 'ConversationBranchesMenu';

// Re-export the underlying types so consumers know what they're rendering.
export type { BranchedConversation };
