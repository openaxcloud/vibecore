import {
  formatProjectIdeCopy,
  formatProjectIdeCount,
  formatProjectIdeDateTime,
  getProjectIdeCopy,
} from '~/lib/i18n/catalogs/project-ide';
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
  source: 'backend' | 'runtime' | 'preview';
  kind: IdeNotificationKind;
  href: string;
  action?: IdeNotificationAction;
};

export type RuntimeState = 'building' | 'crashed' | 'running' | 'stopped';

export function buildIdeNotifications({
  projectUrl,
  backendEvents,
  runtimeState,
  runtimeError,
  previewPorts,
  language,
}: {
  projectUrl: string;
  backendEvents: ProjectLoaderData['notifications'];
  runtimeState: RuntimeState;
  runtimeError?: string | null;
  previewPorts: number[];
  language?: string | null;
}): IdeNotification[] {
  const copy = getProjectIdeCopy(language);
  const runtimeStatusKey = `projectIde.status.${runtimeState}` as const;

  const runtimeNotification: IdeNotification = {
    id: `runtime-${runtimeState}`,
    title: formatProjectIdeCopy(copy['projectIde.notifications.workspaceTitle'], {
      status: copy[runtimeStatusKey].toLocaleLowerCase(language?.startsWith('fr') ? 'fr-FR' : 'en-US'),
    }),
    detail:
      runtimeState === 'crashed'
        ? language?.toLowerCase().startsWith('fr')
          ? copy['projectIde.notifications.runtime.crashed']
          : runtimeError || copy['projectIde.notifications.runtime.crashed']
        : runtimeState === 'running'
          ? copy['projectIde.notifications.runtime.running']
          : runtimeState === 'building'
            ? copy['projectIde.notifications.runtime.building']
            : copy['projectIde.notifications.runtime.stopped'],
    timeLabel: copy['projectIde.notifications.live'],
    source: 'runtime',
    kind: runtimeState === 'crashed' ? 'error' : runtimeState === 'building' ? 'warning' : 'info',
    href: withProjectSearch(projectUrl, { panel: 'logs' }),

    /*
     * A crashed runtime is the most common production failure (pod GC'd / boot
     * 502). Surface a real re-provision affordance, not just a link to logs.
     */
    action:
      runtimeState === 'crashed'
        ? { kind: 'restart-workspace', label: copy['projectIde.notifications.restart'] }
        : undefined,
  };

  const previewNotification: IdeNotification | null = previewPorts.length
    ? {
        id: `preview-${previewPorts.join('-')}`,
        title: copy['projectIde.notifications.previewTitle'],
        detail: formatProjectIdeCount(
          copy,
          'projectIde.notifications.previewPort_one',
          'projectIde.notifications.previewPort_other',
          previewPorts.length,
        ).replace('{ports}', previewPorts.join(', ')),
        timeLabel: copy['projectIde.notifications.live'],
        source: 'preview',
        kind: 'success',
        href: withProjectSearch(projectUrl, { panel: 'preview' }),
      }
    : null;

  const backendNotifications = backendEvents.map((event, index) => {
    const createdAt = event.createdAt ? new Date(event.createdAt) : null;

    return {
      id: event.id ?? `activity-${event.action}-${event.createdAt ?? index}`,
      title: formatActivityTitle(event.action, language),
      detail: activityDetail(event.action, event.metadata, language),
      timeLabel: createdAt
        ? formatProjectIdeDateTime(createdAt, language)
        : copy['projectIde.notifications.recordedByApi'],
      source: 'backend' as const,
      kind: classifyActivityKind(event.action),
      href: withProjectSearch(projectUrl, { panel: 'activity' }),
    };
  });

  return [runtimeNotification, ...(previewNotification ? [previewNotification] : []), ...backendNotifications].slice(
    0,
    12,
  );
}

export function formatActivityTitle(_action: string, language?: string | null) {
  return getProjectIdeCopy(language)['projectIde.notifications.activityTitle'];
}

export function activityDetail(action: string, metadata: unknown, language?: string | null) {
  const copy = getProjectIdeCopy(language);

  if (metadata && typeof metadata === 'object' && 'message' in metadata && typeof metadata.message === 'string') {
    return metadata.message;
  }

  if (action.includes('deploy')) {
    return copy['projectIde.notifications.activity.deployment'];
  }

  if (action.includes('collaborator') || action.includes('member')) {
    return copy['projectIde.notifications.activity.collaboration'];
  }

  if (action.includes('snapshot')) {
    return copy['projectIde.notifications.activity.snapshot'];
  }

  if (action.includes('settings')) {
    return copy['projectIde.notifications.activity.settings'];
  }

  if (action.includes('ai.tool')) {
    return copy['projectIde.notifications.activity.aiTool'];
  }

  return copy['projectIde.notifications.activity.default'];
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
