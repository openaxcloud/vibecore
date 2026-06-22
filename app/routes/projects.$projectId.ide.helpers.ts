import type { ProjectLoaderData } from '~/lib/project-ide-loader.server';
import { withProjectSearch } from '~/utils/project-url';

export type IdeNotificationKind = 'success' | 'warning' | 'error' | 'info';

/*
 * A notification can offer a recovery action in addition to (or instead of) a
 * navigation href. The crashed-runtime notification uses 'restart-workspace' so
 * a user whose pod was GC'd / crashed has a one-click path back instead of a
 * dead-end link to the logs panel.
 */
export type IdeNotificationAction = { kind: 'restart-workspace'; label: string };

export type IdeNotification = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  source: 'Backend activity' | 'Runtime' | 'Preview';
  kind: IdeNotificationKind;
  href: string;
  action?: IdeNotificationAction;
};

export type RuntimeState = 'building' | 'crashed' | 'running' | 'stopped';

export function buildIdeNotifications({
  projectUrl,
  backendEvents,
  runtimeState,
  runtimeStatusLabel,
  runtimeError,
  previewPorts,
}: {
  projectUrl: string;
  backendEvents: ProjectLoaderData['notifications'];
  runtimeState: RuntimeState;
  runtimeStatusLabel: string;
  runtimeError?: string | null;
  previewPorts: number[];
}): IdeNotification[] {
  const runtimeNotification: IdeNotification = {
    id: `runtime-${runtimeState}`,
    title: `Workspace ${runtimeStatusLabel.toLowerCase()}`,
    detail:
      runtimeState === 'crashed'
        ? runtimeError || 'The workspace runtime reported an error.'
        : runtimeState === 'running'
          ? 'The IDE runtime is connected and ready for commands.'
          : runtimeState === 'building'
            ? 'The workspace is starting and preparing project services.'
            : 'The workspace runtime is currently idle.',
    timeLabel: 'Live',
    source: 'Runtime',
    kind: runtimeState === 'crashed' ? 'error' : runtimeState === 'building' ? 'warning' : 'info',
    href: withProjectSearch(projectUrl, { panel: 'logs' }),

    /*
     * A crashed runtime is the most common production failure (pod GC'd / boot
     * 502). Surface a real re-provision affordance, not just a link to logs.
     */
    action: runtimeState === 'crashed' ? { kind: 'restart-workspace', label: 'Restart workspace' } : undefined,
  };

  const previewNotification: IdeNotification | null = previewPorts.length
    ? {
        id: `preview-${previewPorts.join('-')}`,
        title: 'Preview server available',
        detail: `Live preview ${previewPorts.length === 1 ? 'port' : 'ports'}: ${previewPorts.join(', ')}`,
        timeLabel: 'Live',
        source: 'Preview',
        kind: 'success',
        href: withProjectSearch(projectUrl, { panel: 'preview' }),
      }
    : null;

  const backendNotifications = backendEvents.map((event, index) => {
    const createdAt = event.createdAt ? new Date(event.createdAt) : null;

    return {
      id: event.id ?? `activity-${event.action}-${event.createdAt ?? index}`,
      title: formatActivityTitle(event.action),
      detail: activityDetail(event.action, event.metadata),
      timeLabel: createdAt ? createdAt.toLocaleString() : 'Recorded by API',
      source: 'Backend activity' as const,
      kind: classifyActivityKind(event.action),
      href: withProjectSearch(projectUrl, { panel: 'activity' }),
    };
  });

  return [runtimeNotification, ...(previewNotification ? [previewNotification] : []), ...backendNotifications].slice(
    0,
    12,
  );
}

export function formatActivityTitle(action: string) {
  return action
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function activityDetail(action: string, metadata: unknown) {
  if (metadata && typeof metadata === 'object' && 'message' in metadata && typeof metadata.message === 'string') {
    return metadata.message;
  }

  if (action.includes('deploy')) {
    return 'Deployment activity was recorded by the project API.';
  }

  if (action.includes('collaborator') || action.includes('member')) {
    return 'Team or collaborator access changed.';
  }

  if (action.includes('snapshot')) {
    return 'A project snapshot event was recorded.';
  }

  if (action.includes('settings')) {
    return 'Project configuration changed.';
  }

  if (action.includes('ai.tool')) {
    return 'An AI tool action changed the workspace.';
  }

  return 'Project activity recorded by the backend.';
}

/*
 * Re-provision a crashed/GC'd workspace. The provisioning lifecycle lives in
 * ProjectWorkspaceProvider's effect (boot + startWorkspace + seed), which the
 * crash recovery cannot call directly. Reloading the route remounts the
 * provider: its cleanup tears down the stale session id (configureProject) and
 * the fresh mount re-runs startWorkspace(), so this is a genuine re-provision,
 * not a no-op. The reload is injectable so it can be unit-tested.
 */
export function restartWorkspace(reload: () => void = defaultReload) {
  reload();
}

function defaultReload() {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export function classifyActivityKind(action: string): IdeNotificationKind {
  const normalized = action.toLowerCase();

  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('delete')) {
    return 'error';
  }

  if (normalized.includes('warning') || normalized.includes('quota') || normalized.includes('security')) {
    return 'warning';
  }

  if (normalized.includes('create') || normalized.includes('deploy') || normalized.includes('snapshot')) {
    return 'success';
  }

  return 'info';
}
