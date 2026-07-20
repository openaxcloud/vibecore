import { isRouteErrorResponse, useFetcher, useLoaderData, useRouteError } from 'react-router';
import type { MetaFunction } from 'react-router';
import {
  GalleryModerationPanel,
  type GalleryModerationCommand,
  type GalleryModerationFeedback,
  type GalleryModerationReport,
  type ModeratedPublishedApp,
  type ModerationQueueApp,
} from '~/components/admin/GalleryModerationPanel';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type ModerationTab = 'queue' | 'published' | 'reports';

type QueueResponse = { apps?: ModerationQueueApp[]; nextCursor?: string };
type PublishedResponse = { apps?: ModeratedPublishedApp[]; nextCursor?: string };
type ReportsResponse = { reports?: GalleryModerationReport[]; nextCursor?: string };

const MODERATION_ACTIONS = new Set(['APPROVE', 'REJECT', 'ARCHIVE', 'FEATURE', 'UNFEATURE']);
const REPORT_RESOLUTIONS = new Set(['DISMISSED', 'ACTIONED']);

export const meta: MetaFunction = () => [{ title: 'Gallery moderation - E-Code' }];

function cursorFrom(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.trim();

  return value && value.length <= 256 ? value : undefined;
}

function moderationTab(value: string | null): ModerationTab {
  return value === 'published' || value === 'reports' ? value : 'queue';
}

function pageHref(tab: ModerationTab, cursor: string | undefined) {
  if (!cursor) {
    return undefined;
  }

  const params = new URLSearchParams({ tab });
  const cursorKey = tab === 'queue' ? 'queueCursor' : tab === 'published' ? 'publishedCursor' : 'reportCursor';
  params.set(cursorKey, cursor);

  return `/admin/gallery-moderation?${params.toString()}`;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const url = new URL(request.url);
  const queueCursor = cursorFrom(url.searchParams, 'queueCursor');
  const publishedCursor = cursorFrom(url.searchParams, 'publishedCursor');
  const reportCursor = cursorFrom(url.searchParams, 'reportCursor');

  const [queuePage, publishedPage, reportPage] = await Promise.all([
    apiRequest<QueueResponse>(
      request,
      `/admin/gallery/moderation?limit=100${queueCursor ? `&cursor=${encodeURIComponent(queueCursor)}` : ''}`,
      { redirectOn401: false },
    ),
    apiRequest<PublishedResponse>(
      request,
      `/gallery/apps?limit=50&sort=RECENT${publishedCursor ? `&cursor=${encodeURIComponent(publishedCursor)}` : ''}`,
      { redirectOn401: false },
    ),
    apiRequest<ReportsResponse>(
      request,
      `/admin/gallery/reports?status=OPEN&limit=100${reportCursor ? `&cursor=${encodeURIComponent(reportCursor)}` : ''}`,
      { redirectOn401: false },
    ),
  ]);

  return json({
    queue: queuePage.apps ?? [],
    publishedApps: publishedPage.apps ?? [],
    reports: reportPage.reports ?? [],
    initialTab: moderationTab(url.searchParams.get('tab')),
    nextPageHrefs: {
      queue: pageHref('queue', queuePage.nextCursor),
      published: pageHref('published', publishedPage.nextCursor),
      reports: pageHref('reports', reportPage.nextCursor),
    },
  });
}

async function moderationMutationError(error: unknown) {
  if (error instanceof Response) {
    const payload = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

    if (payload.code === 'GALLERY_MODERATION_STATE_CONFLICT') {
      return 'This application changed while you were reviewing it. Refresh the queue and review its current state.';
    }

    if (payload.code === 'GALLERY_REPORT_STATE_CONFLICT') {
      return 'This report has already been resolved. Refresh to see its current state.';
    }

    if (payload.code === 'GALLERY_MODERATION_FORBIDDEN' || error.status === 403) {
      return 'This action requires a platform administrator account.';
    }

    return payload.error ?? 'The moderation decision could not be applied.';
  }

  return 'The moderation service is not reachable. Try again in a moment.';
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent;

  if (intent === 'moderate') {
    const appId = body.appId?.trim();
    const moderationAction = body.moderationAction?.trim();
    const reason = body.reason?.trim();
    const functionalPreviewConfirmed = body.functionalPreviewConfirmed === 'true';

    if (!appId || !moderationAction || !MODERATION_ACTIONS.has(moderationAction)) {
      return json({ ok: false, error: 'Choose a valid application moderation action.' }, { status: 400 });
    }

    if ((moderationAction === 'REJECT' || moderationAction === 'ARCHIVE') && !reason) {
      return json(
        { ok: false, error: 'Enter an audit reason before rejecting or archiving an application.' },
        { status: 400 },
      );
    }

    if (moderationAction === 'APPROVE' && !functionalPreviewConfirmed) {
      return json(
        {
          ok: false,
          error: 'Confirm the real-browser Preview, basic interactions, and thumbnail before approval.',
        },
        { status: 400 },
      );
    }

    try {
      await apiRequest(request, `/admin/gallery/apps/${encodeURIComponent(appId)}/moderate`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({
          action: moderationAction,
          ...(reason ? { reason } : {}),
          ...(moderationAction === 'APPROVE' ? { functionalPreviewConfirmed: true } : {}),
        }),
      });

      const status =
        moderationAction === 'APPROVE'
          ? 'Application approved and published.'
          : moderationAction === 'REJECT'
            ? 'Application rejected with an audit reason.'
            : moderationAction === 'ARCHIVE'
              ? 'Application archived and removed from the public Gallery.'
              : moderationAction === 'FEATURE'
                ? 'Application added to the featured Gallery.'
                : 'Application removed from featured placement.';

      return json({ ok: true, status });
    } catch (error) {
      const status = error instanceof Response && error.status >= 400 && error.status <= 499 ? error.status : 502;

      return json({ ok: false, error: await moderationMutationError(error) }, { status });
    }
  }

  if (intent === 'resolve-report') {
    const reportId = body.reportId?.trim();
    const resolution = body.resolution?.trim();
    const note = body.note?.trim();

    if (!reportId || !resolution || !REPORT_RESOLUTIONS.has(resolution)) {
      return json({ ok: false, error: 'Choose a valid report resolution.' }, { status: 400 });
    }

    if (!note) {
      return json({ ok: false, error: 'Enter a resolution note before closing the report.' }, { status: 400 });
    }

    try {
      await apiRequest(request, `/admin/gallery/reports/${encodeURIComponent(reportId)}/resolve`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ resolution, note }),
      });

      return json({
        ok: true,
        status: resolution === 'ACTIONED' ? 'Report resolved with moderation action recorded.' : 'Report dismissed.',
      });
    } catch (error) {
      const status = error instanceof Response && error.status >= 400 && error.status <= 499 ? error.status : 502;

      return json({ ok: false, error: await moderationMutationError(error) }, { status });
    }
  }

  return json({ ok: false, error: 'Unknown Gallery moderation action.' }, { status: 400 });
}

export function moderationForm(command: GalleryModerationCommand) {
  const data = new FormData();
  data.set('intent', command.kind);

  if (command.kind === 'moderate') {
    data.set('appId', command.appId);
    data.set('moderationAction', command.action);

    if (command.reason) {
      data.set('reason', command.reason);
    }

    if (command.functionalPreviewConfirmed) {
      data.set('functionalPreviewConfirmed', 'true');
    }
  } else {
    data.set('reportId', command.reportId);
    data.set('resolution', command.resolution);
    data.set('note', command.note);
  }

  return data;
}

export function HydrateFallback() {
  return (
    <AppShell
      title="Gallery moderation"
      description="Reviewing community applications, publication previews and reports."
    >
      <AsyncPanelSkeleton label="Loading Gallery moderation" rows={6} />
    </AppShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const forbidden = isRouteErrorResponse(error) && (error.status === 401 || error.status === 403);

  return (
    <AppShell
      title="Gallery moderation"
      description={forbidden ? 'Platform administrator access is required.' : 'The moderation queue is unavailable.'}
      actions={<LinkButton to="/admin/overview">Admin overview</LinkButton>}
    >
      <AsyncPanelError
        title={forbidden ? 'Access restricted' : 'Could not load Gallery moderation'}
        description={
          forbidden
            ? 'Sign in with a platform administrator account to review community applications and reports.'
            : 'The page could not retrieve the moderation queue safely. No moderation decision was applied.'
        }
        onRetry={() => window.location.reload()}
        retryLabel={forbidden ? 'Retry access check' : 'Reload moderation'}
      />
    </AppShell>
  );
}

export default function AdminGalleryModerationPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const feedback = (busy ? undefined : fetcher.data) as GalleryModerationFeedback | undefined;

  const submitCommand = (command: GalleryModerationCommand) => {
    fetcher.submit(moderationForm(command), { method: 'POST' });
  };

  return (
    <AppShell
      title="Gallery moderation"
      description="Review immutable app snapshots and verified previews, curate featured applications, and resolve community reports with an auditable decision."
      actions={
        <>
          <LinkButton to="/admin/overview">Admin overview</LinkButton>
          <LinkButton to="/dashboard/templates">Open Gallery</LinkButton>
        </>
      }
    >
      <GalleryModerationPanel
        queue={data.queue}
        publishedApps={data.publishedApps}
        reports={data.reports}
        initialTab={data.initialTab}
        nextPageHrefs={data.nextPageHrefs}
        busy={busy}
        feedback={feedback}
        onCommand={submitCommand}
      />
    </AppShell>
  );
}
