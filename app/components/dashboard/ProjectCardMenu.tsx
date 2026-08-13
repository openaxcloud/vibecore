import * as RadixDialog from '@radix-ui/react-dialog';
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useFetcher } from 'react-router';
import { toast } from 'react-toastify';
import type { ProjectCard } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/Dialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '~/components/ui/Dropdown';
import { Input } from '~/components/ui/Input';

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
  const fetcher = useFetcher<ProjectActionResult>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const lastIntentRef = useRef<ProjectActionIntent | null>(null);

  const submit = (intent: ProjectActionIntent) => {
    lastIntentRef.current = intent;

    const payload: Record<string, string> =
      intent === 'duplicate' ? { intent, name: `${project.name} Copy` } : { intent };

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
      toast.error(fetcher.data.error ?? 'Project action failed');
      return;
    }

    if (intent === 'archive') {
      /*
       * The Undo toast owns its own fetcher: it lives in the root
       * ToastContainer tree, so it survives this card unmounting when the
       * archived project leaves the list.
       */
      toast(({ closeToast }) => <UndoArchiveToast project={project} closeToast={closeToast} />, { autoClose: 5000 });
    } else if (intent === 'unarchive') {
      toast.success(`Restored “${project.name}”`);
    } else if (intent === 'duplicate') {
      toast.success(`Duplicated “${project.name}”`);
    } else if (intent === 'delete-permanent') {
      toast.success(`Deleted “${project.name}”`);
    }
  }, [fetcher.data, project]);

  const archived = project.lifecycle === 'archived';

  return (
    <>
      <Dropdown
        trigger={
          <button
            type="button"
            aria-label={`Project actions for ${project.name}`}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
            onClick={stopCardNavigation}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
      >
        <DropdownItem onSelect={onRename} className="min-h-[44px]">
          <Pencil className="h-4 w-4" aria-hidden />
          Rename
        </DropdownItem>
        <DropdownItem onSelect={() => submit('duplicate')} className="min-h-[44px]">
          <Copy className="h-4 w-4" aria-hidden />
          Duplicate
        </DropdownItem>
        {archived ? (
          <DropdownItem onSelect={() => submit('unarchive')} className="min-h-[44px]">
            <ArchiveRestore className="h-4 w-4" aria-hidden />
            Restore
          </DropdownItem>
        ) : (
          <DropdownItem onSelect={() => submit('archive')} className="min-h-[44px]">
            <Archive className="h-4 w-4" aria-hidden />
            Archive
          </DropdownItem>
        )}
        <DropdownSeparator />
        <DropdownItem onSelect={() => setConfirmingDelete(true)} className="min-h-[44px]">
          <span className="flex items-center gap-2" style={destructiveStyle}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </span>
        </DropdownItem>
      </Dropdown>
      <DeleteProjectDialog
        project={project}
        open={confirmingDelete}
        pending={fetcher.state !== 'idle'}
        onClose={() => setConfirmingDelete(false)}
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
function UndoArchiveToast({ project, closeToast }: { project: ProjectCard; closeToast?: () => void }) {
  const fetcher = useFetcher<ProjectActionResult>();

  useEffect(() => {
    if (!fetcher.data) {
      return;
    }

    if (fetcher.data.ok === false) {
      toast.error(fetcher.data.error ?? 'Could not restore the project');
    } else {
      toast.success(`Restored “${project.name}”`);
    }

    closeToast?.();
  }, [fetcher.data, project.name, closeToast]);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">Archived “{project.name}”</span>
      <button
        type="button"
        disabled={fetcher.state !== 'idle'}
        className="min-h-[44px] shrink-0 rounded-md border border-bolt-elements-borderColor px-3 py-1 text-xs font-medium text-[var(--vc-ide-accent-action)] hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
        onClick={() => fetcher.submit({ intent: 'unarchive' }, { method: 'post', action: projectActionPath(project) })}
      >
        Undo
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
}: {
  project: ProjectCard;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
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
          <div className="p-6">
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription className="mb-4">
              This permanently deletes “{project.name}” and all of its data. This cannot be undone.
              {requiresName ? ' This project has an active deployment — type its name below to confirm.' : ''}
            </DialogDescription>
            {requiresName ? (
              <Input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder={project.name}
                aria-label={`Type ${project.name} to confirm deletion`}
                autoFocus
                className="mb-4 min-h-[44px]"
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={pending} className="min-h-[44px]">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={onConfirm}
                disabled={!canConfirm}
                className="min-h-[44px] border-[color-mix(in_srgb,var(--status-error-text)_45%,transparent)] text-[var(--status-error-text)] hover:bg-[color-mix(in_srgb,var(--status-error-text)_10%,transparent)] hover:text-[var(--status-error-text)]"
              >
                Delete project
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
        toast.error(fetcher.data.error ?? 'Could not rename the project');
      }

      // Success: the route loaders revalidate and the card shows the new name.
      onDone();
    }
  }, [fetcher.state, fetcher.data, onDone]);

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
      aria-label={`Rename project ${project.name}`}
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
      className={className ?? 'h-[44px] text-sm font-semibold'}
    />
  );
}
