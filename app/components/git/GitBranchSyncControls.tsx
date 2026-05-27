import type { FormEventHandler } from 'react';
import { classNames } from '~/utils/classNames';

type GitSyncIntent = 'pull' | 'push';

interface GitBranchSyncControlsProps {
  branch: string;
  busy?: boolean;
  idPrefix: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

const syncActions: Array<{
  intent: GitSyncIntent;
  label: string;
  buttonLabel: string;
  description: string;
  inputTitle: string;
}> = [
  {
    intent: 'pull',
    label: 'Local branch',
    buttonLabel: 'Pull',
    description: 'Pull remote updates into this workspace branch.',
    inputTitle: 'Local branch that receives updates from the remote.',
  },
  {
    intent: 'push',
    label: 'Remote branch',
    buttonLabel: 'Push',
    description: 'Push local commits to this remote branch.',
    inputTitle: 'Remote branch that receives commits from this workspace.',
  },
];

export function GitBranchSyncControls({ branch, busy = false, idPrefix, onSubmit }: GitBranchSyncControlsProps) {
  return (
    <section
      className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
      aria-labelledby={`${idPrefix}-sync-heading`}
    >
      <div>
        <h3 id={`${idPrefix}-sync-heading`} className="text-sm font-semibold text-bolt-elements-textPrimary">
          Sync branches
        </h3>
        <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
          Pull updates into your local branch, or push commits to a remote branch.
        </p>
      </div>

      {syncActions.map((action) => {
        const inputId = `${idPrefix}-${action.intent}-branch`;
        const descriptionId = `${inputId}-description`;

        return (
          <form key={action.intent} onSubmit={onSubmit} className="grid gap-1.5">
            <input name="intent" value={action.intent} type="hidden" />
            <label className="grid gap-0.5 text-xs font-medium text-bolt-elements-textSecondary" htmlFor={inputId}>
              <span className="text-bolt-elements-textPrimary">{action.label}</span>
              <span id={descriptionId} className="font-normal leading-4 text-bolt-elements-textSecondary">
                {action.description}
              </span>
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id={inputId}
                name="branch"
                defaultValue={branch}
                aria-describedby={descriptionId}
                title={action.inputTitle}
                className="h-9 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              />
              <button
                type="submit"
                disabled={busy}
                className={classNames(
                  'inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60',
                  'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-2 focus:ring-offset-bolt-elements-background-depth-2',
                )}
              >
                {action.buttonLabel}
              </button>
            </div>
          </form>
        );
      })}
    </section>
  );
}
