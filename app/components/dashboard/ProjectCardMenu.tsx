import * as RadixDialog from '@radix-ui/react-dialog';
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { toast } from 'react-toastify';
import type { ProjectCard } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/Dialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '~/components/ui/Dropdown';
import { Input } from '~/components/ui/Input';
import {
  formatProjectCardMenuCopy,
  getProjectCardMenuCopy,
  type ProjectCardMenuCopy,
} from '~/lib/i18n/catalogs/project-card-menu';
import { classNames } from '~/utils/classNames';

/*
 * E16 — shared ⋯ menu for project cards (grid cards on /dashboard,
 * /recent-projects and /projects, plus the /projects list rows):
 * Rename (inline title swap via ProjectRenameForm), Duplicate, Archive
 * (soft-delete with a 5s Undo toast calling restore) and Delete (permanent,
 * confirm dialog; typing the project name is required when the project has
 * deployments). All intents hit the real project-action proxy route.
 */

type ProjectActionResult = { ok?: boolean; error?: string };

type ProjectActionIntent = 'archive' | 'unarchive' | 'duplicate' | 'delete-permanent';

function projectActionPath(project: ProjectCard) {
  return `/api/projects/${project.id}/project-action`;
}

/** Inline destructive color via the theme token — deterministic against the DropdownItem hover styles. */
const destructiveStyle = { color: 'var(--status-error-text)' } as const;

/** The ⋯ trigger sits on a clickable card surface — keep the card's link from firing. */
function stopCardNavigation(event: React.MouseEvent) {
  event.stopPropagation();
}

export function ProjectCardMenu({ project, onRename }: { project: ProjectCard; onRename: () => void }) {
  const { i18n } = useTranslation();
  const copy = getProjectCardMenuCopy(i18n.resolvedLanguage ?? i18n.language);
  const fetcher = useFetcher<ProjectActionResult>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const lastIntentRef = useRef<ProjectActionIntent | null>(null);

  const submit = (intent: ProjectActionIntent) => {
    lastIntentRef.current = intent;

    const payload: Record<string, string> =
      intent === 'duplicate'
        ? {
            intent,
            name: formatProjectCardMenuCopy(copy['projectCardMenu.duplicate.name'], { name: project.name }),
          }
        : { intent };

    fetcher.submit(payload, { method: 'post', action: projectActionPath(project) });
  };

  /*
   * Toast once per mutation, as soon as the action result lands (NOT waiting
   * for `state === 'idle'`): archive/delete revalidation removes this card and
   * unmounts the menu, so an idle-gated effect would never fire.
   */
  useEffect(() => {
    if (!fetcher.data || !lastIntentRef.current) {
      return;
    }

    const intent = lastIntentRef.current;
    lastIntentRef.current = null;

    if (fetcher.data.ok === false) {
      toast.error(copy['projectCardMenu.error.actionFailed']);
      return;
    }

    if (intent === 'archive') {
      /*
       * The Undo toast owns its own fetcher: it lives in the root
       * ToastContainer tree, so it survives this card unmounting when the
       * archived project leaves the list.
       */
      toast(({ closeToast }) => <UndoArchiveToast project={project} closeToast={closeToast} copy={copy} />, {
        autoClose: 5000,
      });
    } else if (intent === 'unarchive') {
      toast.success(formatProjectCardMenuCopy(copy['projectCardMenu.toast.restored'], { name: project.name }));
    } else if (intent === 'duplicate') {
      toast.success(formatProjectCardMenuCopy(copy['projectCardMenu.toast.duplicated'], { name: project.name }));
    } else if (intent === 'delete-permanent') {
      toast.success(formatProjectCardMenuCopy(copy['projectCardMenu.toast.deleted'], { name: project.name }));
    }
  }, [copy, fetcher.data, project]);

  const archived = project.lifecycle === 'archived';

  return (
    <>
      <Dropdown
        trigger={
          <button
            type="button"
            aria-label={formatProjectCardMenuCopy(copy['projectCardMenu.actions.ariaLabel'], {
              name: project.name,
            })}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            onClick={stopCardNavigation}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
      >
        <DropdownItem onSelect={onRename} className="min-h-[44px]">
          <Pencil className="h-4 w-4" aria-hidden />
          {copy['projectCardMenu.actions.rename']}
        </DropdownItem>
        <DropdownItem onSelect={() => submit('duplicate')} className="min-h-[44px]">
          <Copy className="h-4 w-4" aria-hidden />
          {copy['projectCardMenu.actions.duplicate']}
        </DropdownItem>
        {archived ? (
          <DropdownItem onSelect={() => submit('unarchive')} className="min-h-[44px]">
            <ArchiveRestore className="h-4 w-4" aria-hidden />
            {copy['projectCardMenu.actions.restore']}
          </DropdownItem>
        ) : (
          <DropdownItem onSelect={() => submit('archive')} className="min-h-[44px]">
            <Archive className="h-4 w-4" aria-hidden />
            {copy['projectCardMenu.actions.archive']}
          </DropdownItem>
        )}
        <DropdownSeparator />
        <DropdownItem onSelect={() => setConfirmingDelete(true)} className="min-h-[44px]">
          <span className="flex items-center gap-2" style={destructiveStyle}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {copy['projectCardMenu.actions.delete']}
          </span>
        </DropdownItem>
      </Dropdown>
      <DeleteProjectDialog
        project={project}
        open={confirmingDelete}
        pending={fetcher.state !== 'idle'}
        onClose={() => setConfirmingDelete(false)}
        copy={copy}
        onConfirm={() => {
          submit('delete-permanent');
          setConfirmingDelete(false);
        }}
      />
    </>
  );
}

/**
 * Rendered inside the global ToastContainer (root tree), so it keeps its
 * fetcher alive independently of the archived card. Kept open while the
 * restore is in flight; success/failure is reported via a follow-up toast.
 */
function UndoArchiveToast({
  project,
  closeToast,
  copy,
}: {
  project: ProjectCard;
  closeToast?: () => void;
  copy: ProjectCardMenuCopy;
}) {
  const fetcher = useFetcher<ProjectActionResult>();

  useEffect(() => {
    if (!fetcher.data) {
      return;
    }

    if (fetcher.data.ok === false) {
      toast.error(copy['projectCardMenu.error.restoreFailed']);
    } else {
      toast.success(formatProjectCardMenuCopy(copy['projectCardMenu.toast.restored'], { name: project.name }));
    }

    closeToast?.();
  }, [closeToast, copy, fetcher.data, project.name]);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 break-words">
        {formatProjectCardMenuCopy(copy['projectCardMenu.toast.archived'], { name: project.name })}
      </span>
      <button
        type="button"
        disabled={fetcher.state !== 'idle'}
        className="min-h-[44px] shrink-0 rounded-md border border-bolt-elements-borderColor px-3 py-1 text-xs font-medium text-[var(--vc-ide-accent-action)] hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
        onClick={() => fetcher.submit({ intent: 'unarchive' }, { method: 'post', action: projectActionPath(project) })}
      >
        {copy['projectCardMenu.toast.undo']}
      </button>
    </div>
  );
}

function DeleteProjectDialog({
  project,
  open,
  pending,
  onClose,
  onConfirm,
  copy,
}: {
  project: ProjectCard;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  copy: ProjectCardMenuCopy;
}) {
  /*
   * Projects with deployments are the highest-blast-radius case: require typing
   * the exact name before the confirm button unlocks.
   */
  const requiresName = (project.deploymentCount ?? 0) > 0;
  const [typedName, setTypedName] = useState('');
  const canConfirm = !pending && (!requiresName || typedName === project.name);

  useEffect(() => {
    if (!open) {
      setTypedName('');
    }
  }, [open]);

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      {open ? (
        <Dialog showCloseButton={false} onBackdrop={onClose}>
          <div className="min-w-0 p-4 sm:p-6">
            <DialogTitle>{copy['projectCardMenu.delete.title']}</DialogTitle>
            <DialogDescription className="mb-4 break-words">
              {formatProjectCardMenuCopy(copy['projectCardMenu.delete.description'], { name: project.name })}
              {requiresName ? ` ${copy['projectCardMenu.delete.deploymentWarning']}` : ''}
            </DialogDescription>
            {requiresName ? (
              <Input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder={project.name}
                aria-label={formatProjectCardMenuCopy(copy['projectCardMenu.delete.typeName'], {
                  name: project.name,
                })}
                autoFocus
                className="mb-4 min-h-[44px]"
              />
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={pending} className="min-h-[44px] whitespace-normal">
                {copy['projectCardMenu.delete.cancel']}
              </Button>
              <Button
                variant="outline"
                onClick={onConfirm}
                disabled={!canConfirm}
                className="min-h-[44px] whitespace-normal border-[color-mix(in_srgb,var(--status-error-text)_45%,transparent)] text-[var(--status-error-text)] hover:bg-[color-mix(in_srgb,var(--status-error-text)_10%,transparent)] hover:text-[var(--status-error-text)]"
              >
                {copy['projectCardMenu.delete.confirm']}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </RadixDialog.Root>
  );
}

export function ProjectRenameForm({
  project,
  onDone,
  className,
}: {
  project: ProjectCard;
  onDone: () => void;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const copy = getProjectCardMenuCopy(i18n.resolvedLanguage ?? i18n.language);
  const fetcher = useFetcher<ProjectActionResult>();
  const [name, setName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = fetcher.state !== 'idle';

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.ok === false) {
        toast.error(copy['projectCardMenu.error.renameFailed']);
      }

      // Success: the route loaders revalidate and the card shows the new name.
      onDone();
    }
  }, [copy, fetcher.state, fetcher.data, onDone]);

  const commit = () => {
    const trimmed = name.trim();

    if (!trimmed || trimmed === project.name) {
      onDone();
      return;
    }

    fetcher.submit({ intent: 'rename', name: trimmed }, { method: 'post', action: projectActionPath(project) });
  };

  return (
    <Input
      ref={inputRef}
      value={name}
      disabled={pending}
      aria-label={formatProjectCardMenuCopy(copy['projectCardMenu.rename.ariaLabel'], {
        name: project.name,
      })}
      onChange={(event) => setName(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onDone();
        }
      }}
      onBlur={commit}
      className={classNames('h-[44px] text-sm font-semibold', className)}
    />
  );
}
