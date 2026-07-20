import {
  ArchiveX,
  BadgeCheck,
  Check,
  ExternalLink,
  Flag,
  ImageOff,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { classNames } from '~/utils/classNames';

export type ModerationQueueApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: { displayName: string; handle: string; avatarUrl?: string };
  artifactType: string;
  category: string;
  technologies: string[];
  thumbnailUrl: string;
  previewUrl?: string;
  previewStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  submittedAt?: string;
  reportCount: number;
};

export type ModeratedPublishedApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: { displayName: string; handle: string; avatarUrl?: string };
  artifactType: string;
  category: string;
  technologies: string[];
  thumbnailUrl: string;
  previewUrl?: string;
  featured: boolean;
  remixCount: number;
  reportCount: number;
  publishedAt?: string;
};

export type GalleryModerationReport = {
  id: string;
  galleryAppId: string;
  reporterUserId: string;
  reason: 'COPYRIGHT' | 'DECEPTIVE' | 'HARMFUL' | 'INAPPROPRIATE' | 'MALWARE' | 'PRIVACY' | 'SPAM' | 'OTHER';
  details?: string;
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  createdAt: string;
};

export type GalleryModerationCommand =
  | {
      kind: 'moderate';
      appId: string;
      action: 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'FEATURE' | 'UNFEATURE';
      reason?: string;
      functionalPreviewConfirmed?: true;
    }
  | {
      kind: 'resolve-report';
      reportId: string;
      resolution: 'DISMISSED' | 'ACTIONED';
      note: string;
    };

export type GalleryModerationFeedback = { ok?: boolean; status?: string; error?: string };

type ModerationTab = 'queue' | 'published' | 'reports';

type Decision =
  | { kind: 'approve'; app: ModerationQueueApp }
  | { kind: 'reject'; app: ModerationQueueApp }
  | { kind: 'feature'; app: ModeratedPublishedApp; action: 'FEATURE' | 'UNFEATURE' }
  | { kind: 'archive'; app: ModeratedPublishedApp }
  | { kind: 'resolve'; report: GalleryModerationReport; resolution: 'DISMISSED' | 'ACTIONED' };

type GalleryModerationPanelProps = {
  queue: readonly ModerationQueueApp[];
  publishedApps: readonly ModeratedPublishedApp[];
  reports: readonly GalleryModerationReport[];
  initialTab?: ModerationTab;
  busy?: boolean;
  feedback?: GalleryModerationFeedback;
  nextPageHrefs?: Partial<Record<ModerationTab, string>>;
  onCommand: (command: GalleryModerationCommand) => void;
};

const reportLabels: Record<GalleryModerationReport['reason'], string> = {
  COPYRIGHT: 'Copyright',
  DECEPTIVE: 'Deceptive content',
  HARMFUL: 'Harmful content',
  INAPPROPRIATE: 'Inappropriate content',
  MALWARE: 'Suspected malware',
  PRIVACY: 'Privacy concern',
  SPAM: 'Spam',
  OTHER: 'Other',
};

function appLabel(app: ModerationQueueApp | ModeratedPublishedApp | undefined, fallbackId: string) {
  return app ? app.name : `Application ${fallbackId}`;
}

function statusTone(tone: 'neutral' | 'warning' | 'success' | 'danger') {
  return classNames(
    'inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
    tone === 'success' &&
      'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
    tone === 'warning' &&
      'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    tone === 'danger' &&
      'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
    tone === 'neutral' &&
      'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
  );
}

function ApplicationThumbnail({ app }: { app: ModerationQueueApp | ModeratedPublishedApp }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
      {failed ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-bolt-elements-textTertiary">
          <ImageOff className="h-4 w-4" aria-hidden />
          Preview image unavailable
        </div>
      ) : (
        <img
          src={app.thumbnailUrl}
          alt={`Preview of ${app.name}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-[1.02]"
        />
      )}
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-5 py-12 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-bolt-elements-textTertiary" aria-hidden />
      <h3 className="mt-4 text-base font-semibold text-bolt-elements-textPrimary">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
    </div>
  );
}

function QueueCard({
  app,
  busy,
  onDecision,
}: {
  app: ModerationQueueApp;
  busy: boolean;
  onDecision: (decision: Decision) => void;
}) {
  return (
    <article className="group grid gap-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm md:grid-cols-[minmax(220px,320px)_1fr] md:p-5">
      <ApplicationThumbnail app={app} />
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-bolt-elements-textPrimary">{app.name}</h3>
              <span className={statusTone(app.previewStatus === 'VERIFIED' ? 'success' : 'warning')}>
                {app.previewStatus === 'VERIFIED' ? 'Preview verified' : `Preview ${app.previewStatus.toLowerCase()}`}
              </span>
            </div>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              by {app.author.displayName} <span className="text-bolt-elements-textTertiary">@{app.author.handle}</span>
            </p>
          </div>
          {app.submittedAt ? (
            <RelativeTime
              value={app.submittedAt}
              prefix="Submitted"
              className="text-xs text-bolt-elements-textTertiary"
            />
          ) : null}
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-bolt-elements-textSecondary">{app.description}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={statusTone('neutral')}>{app.artifactType}</span>
          <span className={statusTone('neutral')}>{app.category}</span>
          {app.technologies.slice(0, 4).map((technology) => (
            <span key={technology} className={statusTone('neutral')}>
              {technology}
            </span>
          ))}
          {app.reportCount > 0 ? <span className={statusTone('danger')}>{app.reportCount} reports</span> : null}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row sm:flex-wrap">
          {app.previewUrl ? (
            <Button variant="outline" className="min-h-11 gap-2" _asChild>
              <a href={app.previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open live preview
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className="min-h-11 gap-2"
            disabled={busy || app.previewStatus !== 'VERIFIED'}
            onClick={() => onDecision({ kind: 'approve', app })}
          >
            <Check className="h-4 w-4" aria-hidden />
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2 border-[var(--status-error-border)] text-[var(--status-error-text)]"
            disabled={busy}
            onClick={() => onDecision({ kind: 'reject', app })}
          >
            <X className="h-4 w-4" aria-hidden />
            Reject
          </Button>
        </div>
      </div>
    </article>
  );
}

function PublishedCard({
  app,
  busy,
  onDecision,
}: {
  app: ModeratedPublishedApp;
  busy: boolean;
  onDecision: (decision: Decision) => void;
}) {
  const builtInDemo = app.id.startsWith('demo:');

  return (
    <article className="group flex min-w-0 flex-col rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <ApplicationThumbnail app={app} />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-bolt-elements-textPrimary">{app.name}</h3>
          <p className="mt-1 truncate text-xs text-bolt-elements-textTertiary">@{app.author.handle}</p>
        </div>
        {builtInDemo ? (
          <span className={statusTone('neutral')}>Built-in demo</span>
        ) : app.featured ? (
          <span className={statusTone('success')}>Featured</span>
        ) : (
          <span className={statusTone('neutral')}>Published</span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-bolt-elements-textSecondary">{app.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-bolt-elements-textTertiary">
        <span>{app.remixCount} remixes</span>
        <span aria-hidden>·</span>
        <span>{app.reportCount} reports</span>
        {app.publishedAt ? (
          <>
            <span aria-hidden>·</span>
            <RelativeTime value={app.publishedAt} />
          </>
        ) : null}
      </div>
      <div className="mt-auto grid grid-cols-1 gap-2 pt-5 sm:grid-cols-2">
        {app.previewUrl ? (
          <Button variant="outline" className="min-h-11 gap-2" _asChild>
            <a href={app.previewUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden />
              Preview
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant={app.featured ? 'outline' : 'primary'}
          className="min-h-11 gap-2"
          disabled={busy || builtInDemo}
          title={builtInDemo ? 'Built-in demonstration applications are managed in the code catalog.' : undefined}
          onClick={() => onDecision({ kind: 'feature', app, action: app.featured ? 'UNFEATURE' : 'FEATURE' })}
        >
          <Star className={classNames('h-4 w-4', app.featured && 'fill-current')} aria-hidden />
          {builtInDemo ? 'Catalog managed' : app.featured ? 'Remove feature' : 'Feature'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 border-[var(--status-error-border)] text-[var(--status-error-text)] sm:col-span-2"
          disabled={busy || builtInDemo}
          title={builtInDemo ? 'Built-in demonstration applications are managed in the code catalog.' : undefined}
          onClick={() => onDecision({ kind: 'archive', app })}
        >
          <ArchiveX className="h-4 w-4" aria-hidden />
          {builtInDemo ? 'Code takedown required' : 'Archive application'}
        </Button>
      </div>
    </article>
  );
}

function ReportCard({
  report,
  app,
  busy,
  onDecision,
}: {
  report: GalleryModerationReport;
  app?: ModerationQueueApp | ModeratedPublishedApp;
  busy: boolean;
  onDecision: (decision: Decision) => void;
}) {
  return (
    <article className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={statusTone(report.reason === 'MALWARE' || report.reason === 'HARMFUL' ? 'danger' : 'warning')}
            >
              {reportLabels[report.reason]}
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">
              <RelativeTime value={report.createdAt} prefix="Reported" />
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-bolt-elements-textPrimary">
            {appLabel(app, report.galleryAppId)}
          </h3>
          <p className="mt-1 break-all font-mono text-xs text-bolt-elements-textTertiary">
            App {report.galleryAppId} · Reporter {report.reporterUserId}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-bolt-elements-textSecondary">
            {report.details ?? 'No additional details were supplied.'}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[280px]">
          <Button
            type="button"
            variant="primary"
            className="min-h-11 gap-2"
            disabled={busy}
            onClick={() => onDecision({ kind: 'resolve', report, resolution: 'ACTIONED' })}
          >
            <BadgeCheck className="h-4 w-4" aria-hidden />
            Action taken
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => onDecision({ kind: 'resolve', report, resolution: 'DISMISSED' })}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </article>
  );
}

function decisionCopy(decision: Decision) {
  if (decision.kind === 'approve') {
    return {
      title: `Approve ${decision.app.name}?`,
      description: 'The application will become visible in the public Gallery and available for remix immediately.',
      confirm: 'Approve application',
      requiresNote: false,
      noteLabel: '',
    };
  }

  if (decision.kind === 'reject') {
    return {
      title: `Reject ${decision.app.name}?`,
      description: 'The author will need a clear reason before they can correct and resubmit this application.',
      confirm: 'Reject application',
      requiresNote: true,
      noteLabel: 'Reason for rejection',
    };
  }

  if (decision.kind === 'feature') {
    return {
      title:
        decision.action === 'FEATURE' ? `Feature ${decision.app.name}?` : `Remove ${decision.app.name} from featured?`,
      description:
        decision.action === 'FEATURE'
          ? 'The application will receive prominent placement in the public Gallery.'
          : 'The application remains published and remixable, but loses featured placement.',
      confirm: decision.action === 'FEATURE' ? 'Feature application' : 'Remove feature',
      requiresNote: false,
      noteLabel: '',
    };
  }

  if (decision.kind === 'archive') {
    return {
      title: `Archive ${decision.app.name}?`,
      description:
        'The application will be removed from Gallery discovery immediately. Existing remixes keep their isolated copies.',
      confirm: 'Archive application',
      requiresNote: true,
      noteLabel: 'Reason for archival',
    };
  }

  return {
    title: decision.resolution === 'ACTIONED' ? 'Resolve as actioned?' : 'Dismiss this report?',
    description:
      decision.resolution === 'ACTIONED'
        ? 'Record the moderation action taken. This closes the report and preserves the review note in the audit trail.'
        : 'Dismiss the report only after confirming that no moderation action is required.',
    confirm: decision.resolution === 'ACTIONED' ? 'Resolve report' : 'Dismiss report',
    requiresNote: true,
    noteLabel: 'Resolution note',
  };
}

function DecisionDialog({
  decision,
  busy,
  onClose,
  onConfirm,
}: {
  decision: Decision | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (decision: Decision, note: string, functionalPreviewConfirmed: boolean) => void;
}) {
  const [note, setNote] = useState('');
  const [functionalPreviewConfirmed, setFunctionalPreviewConfirmed] = useState(false);

  useEffect(() => {
    setNote('');
    setFunctionalPreviewConfirmed(false);
  }, [decision]);

  if (!decision) {
    return null;
  }

  const copy = decisionCopy(decision);
  const noteMissing = copy.requiresNote && note.trim().length === 0;
  const previewConfirmationMissing = decision.kind === 'approve' && !functionalPreviewConfirmed;

  return (
    <DialogRoot open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog className="w-[min(560px,calc(100vw-24px))]" onClose={onClose} onBackdrop={onClose}>
        <div className="p-5 pr-12 sm:p-6 sm:pr-12">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription className="mt-2 leading-6">{copy.description}</DialogDescription>
          {decision.kind === 'approve' ? (
            <div className="mt-5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              {decision.app.previewUrl ? (
                <a
                  href={decision.app.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-bolt-elements-item-contentAccent underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
                >
                  Open Preview in a real browser
                </a>
              ) : null}
              <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-bolt-elements-textPrimary">
                <input
                  type="checkbox"
                  required
                  checked={functionalPreviewConfirmed}
                  onChange={(event) => setFunctionalPreviewConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--vc-action-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
                />
                <span>
                  I opened the Preview in a real browser and verified that it renders, basic interactions work, and the
                  thumbnail is correct.
                </span>
              </label>
            </div>
          ) : null}
          {copy.requiresNote ? (
            <div className="mt-5">
              <label htmlFor="gallery-moderation-note" className="text-sm font-medium text-bolt-elements-textPrimary">
                {copy.noteLabel}
              </label>
              <textarea
                id="gallery-moderation-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                maxLength={1_000}
                required
                autoFocus
                placeholder="Describe the evidence and decision…"
                className="mt-2 w-full resize-y rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm leading-6 text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
              />
              <p className="mt-1 text-xs text-bolt-elements-textTertiary">{note.length}/1000 characters</p>
            </div>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={decision.kind === 'reject' || decision.kind === 'archive' ? 'destructive' : 'primary'}
              className="min-h-11 gap-2"
              disabled={busy || noteMissing || previewConfirmationMissing}
              aria-busy={busy}
              onClick={() => onConfirm(decision, note.trim(), functionalPreviewConfirmed)}
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {busy ? 'Applying…' : copy.confirm}
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

export function GalleryModerationPanel({
  queue,
  publishedApps,
  reports,
  initialTab = 'queue',
  busy = false,
  feedback,
  nextPageHrefs,
  onCommand,
}: GalleryModerationPanelProps) {
  const [activeTab, setActiveTab] = useState<ModerationTab>(initialTab);
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const appsById = useMemo(
    () =>
      new Map<string, ModerationQueueApp | ModeratedPublishedApp>(
        [...queue, ...publishedApps].map((app) => [app.id, app]),
      ),
    [publishedApps, queue],
  );

  const featuredCount = publishedApps.filter((app) => app.featured).length;

  const confirmDecision = (current: Decision, note: string, functionalPreviewConfirmed: boolean) => {
    if (current.kind === 'approve') {
      if (!functionalPreviewConfirmed) {
        return;
      }

      onCommand({
        kind: 'moderate',
        appId: current.app.id,
        action: 'APPROVE',
        functionalPreviewConfirmed: true,
      });
    } else if (current.kind === 'reject') {
      onCommand({ kind: 'moderate', appId: current.app.id, action: 'REJECT', reason: note });
    } else if (current.kind === 'feature') {
      onCommand({ kind: 'moderate', appId: current.app.id, action: current.action });
    } else if (current.kind === 'archive') {
      onCommand({ kind: 'moderate', appId: current.app.id, action: 'ARCHIVE', reason: note });
    } else {
      onCommand({ kind: 'resolve-report', reportId: current.report.id, resolution: current.resolution, note });
    }

    setDecision(null);
  };

  const tabs: Array<{ id: ModerationTab; label: string; count: number }> = [
    { id: 'queue', label: 'Review queue', count: queue.length },
    { id: 'published', label: 'Published', count: publishedApps.length },
    { id: 'reports', label: 'Open reports', count: reports.length },
  ];

  return (
    <section aria-label="Gallery moderation" aria-busy={busy || undefined} className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
            Awaiting review
          </p>
          <p className="mt-2 text-3xl font-semibold text-bolt-elements-textPrimary">{queue.length}</p>
        </div>
        <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">Open reports</p>
          <p className="mt-2 text-3xl font-semibold text-bolt-elements-textPrimary">{reports.length}</p>
        </div>
        <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">Featured now</p>
          <p className="mt-2 text-3xl font-semibold text-bolt-elements-textPrimary">{featuredCount}</p>
        </div>
      </div>

      {feedback?.error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-text)]"
        >
          {feedback.error}
        </div>
      ) : feedback?.status ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)]"
        >
          {feedback.status}
        </div>
      ) : null}

      {busy ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary"
        >
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Applying moderation decision…
        </div>
      ) : null}

      <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1">
        <div role="tablist" aria-label="Gallery moderation views" className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`gallery-moderation-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`gallery-moderation-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={classNames(
                'flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]',
                activeTab === tab.id
                  ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary shadow-sm'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
              )}
            >
              {tab.id === 'queue' ? <ShieldCheck className="h-4 w-4" aria-hidden /> : null}
              {tab.id === 'published' ? <Sparkles className="h-4 w-4" aria-hidden /> : null}
              {tab.id === 'reports' ? <Flag className="h-4 w-4" aria-hidden /> : null}
              {tab.label}
              <span className="rounded-full bg-bolt-elements-background-depth-1 px-2 py-0.5 text-xs">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        id={`gallery-moderation-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`gallery-moderation-tab-${activeTab}`}
        tabIndex={0}
        className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
      >
        {activeTab === 'queue' ? (
          queue.length > 0 ? (
            <div className="grid gap-4">
              {queue.map((app) => (
                <QueueCard key={app.id} app={app} busy={busy} onDecision={setDecision} />
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="Review queue is clear"
              description="New community applications will appear here only after their immutable snapshot and live preview have both passed submission checks."
            />
          )
        ) : null}

        {activeTab === 'published' ? (
          publishedApps.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {publishedApps.map((app) => (
                <PublishedCard key={app.id} app={app} busy={busy} onDecision={setDecision} />
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No published applications"
              description="Approved applications appear here after their preview is verified and publication is complete."
            />
          )
        ) : null}

        {activeTab === 'reports' ? (
          reports.length > 0 ? (
            <div className="grid gap-4">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  app={appsById.get(report.galleryAppId)}
                  busy={busy}
                  onDecision={setDecision}
                />
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No open reports"
              description="Community reports will appear here with their reason, evidence and source application. Resolved reports remain in the audit trail."
            />
          )
        ) : null}

        {nextPageHrefs?.[activeTab] ? (
          <div className="mt-5 flex justify-center">
            <Button variant="outline" className="min-h-11" _asChild>
              <a href={nextPageHrefs[activeTab]}>Load the next page</a>
            </Button>
          </div>
        ) : null}
      </div>

      <DecisionDialog decision={decision} busy={busy} onClose={() => setDecision(null)} onConfirm={confirmDecision} />
    </section>
  );
}
