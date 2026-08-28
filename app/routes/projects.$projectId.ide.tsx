import { useStore } from '@nanostores/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  Files,
  GitBranch,
  Home,
  MoreHorizontal,
  PenLine,
  Play,
  Rocket,
  Search,
  Settings,
  Share2,
  Square,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { Link } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { buildIdeNotifications, restartWorkspace, type IdeNotificationKind } from './projects.$projectId.ide.helpers';
import { shouldRevalidateProjectIde } from './projects.$projectId.ide.revalidate';
import { BaseChat } from '~/components/chat/BaseChat';
import { ProjectBreadcrumbSeparator } from '~/components/project-ide/ProjectBreadcrumbSeparator';
import {
  ConfirmationDialog,
  Dialog,
  DialogButton,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '~/components/ui/Dialog';
import { InputDialog } from '~/components/ui/InputDialog';
import { ZoneErrorBoundary } from '~/components/ui/PanelBoundary';
import { configuredToast } from '~/components/ui/use-toast';
import { ProjectResourcesPanel } from '~/components/workbench/ProjectResourcesPanel';
import { formatProjectIdeCopy, formatProjectIdeCount, getProjectIdeCopy } from '~/lib/i18n/catalogs/project-ide';
import { friendlyLabel, pickFriendlyLabel } from '~/lib/labels/friendly-id';
import { loadProjectIdeData, type ProjectLoaderData } from '~/lib/project-ide-loader.server';
import { CurrentWorkspaceProvider } from '~/lib/runtime/CurrentWorkspaceContext';
import { ProjectWorkspaceProvider } from '~/lib/runtime/ProjectWorkspaceProvider';
import { isWorkspaceReallyRunning, workspaceUiState } from '~/lib/runtime/workspace-status';
import { workbenchStore } from '~/lib/stores/workbench';
import { projectIdePath, withProjectSearch } from '~/utils/project-url';

const ProjectIdeChat = lazy(() => import('~/components/chat/Chat.client').then((module) => ({ default: module.Chat })));

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getProjectIdeCopy(rootData?.language);

  // Prefer the human project name over the raw id for the browser tab title.
  const projectName = data?.project?.name?.trim() || data?.projectId;

  return [
    {
      title: projectName
        ? formatProjectIdeCopy(copy['projectIde.meta.title'], { project: projectName })
        : copy['projectIde.meta.fallbackTitle'],
    },
    { name: 'description', content: copy['projectIde.meta.description'] },
  ];
};

/*
 * Revalidation policy extracted to projects.$projectId.ide.revalidate.ts (pure,
 * unit-tested). BUG-IDE-PANEL-RECLICK-REPROVISION-001: it now also skips the
 * loader on a SAME-URL navigation (re-click of the already-active panel), which
 * React Router otherwise treats as a refresh and revalidates.
 */
export const shouldRevalidate = shouldRevalidateProjectIde;

export const loader = async ({ request, params }: LoaderFunctionArgs) =>
  loadProjectIdeData(request, params.projectId ?? '');

export default function ProjectIdeRoute() {
  const { i18n } = useTranslation();
  const copy = getProjectIdeCopy(i18n.resolvedLanguage ?? i18n.language);

  const {
    projectId,
    project,
    workspace,
    organization,
    git,
    collaborators,
    notifications,
    initialIdePanels,
    projectApiError,
    workspaces,
    currentWorkspaceId,
    primaryWorkspaceId,
  } = useLoaderData<typeof loader>();

  const projectUrl = projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization?.slug });

  const optimisticShell = (
    <BaseChat
      chatStarted
      projectIdeMode
      projectId={projectId}
      projectUrl={projectUrl}
      initialIdePanels={initialIdePanels}
    />
  );

  return (
    <CurrentWorkspaceProvider
      currentWorkspaceId={currentWorkspaceId}
      primaryWorkspaceId={primaryWorkspaceId}
      workspaces={workspaces}
    >
      <ProjectWorkspaceProvider projectId={projectId} workspaceId={currentWorkspaceId} initialError={projectApiError}>
        <div className="bolt-project-ide-shell h-dvh w-screen overflow-hidden">
          <IdeProjectTopBar
            projectId={projectId}
            project={project}
            workspace={workspace}
            organization={organization}
            git={git}
            collaborators={collaborators}
            notifications={notifications}
            projectApiError={projectApiError}
            projectUrl={projectUrl}
          />
          <main className="h-dvh pt-9">
            <ClientOnly fallback={optimisticShell}>
              {() => (
                <ZoneErrorBoundary
                  zone="editor"
                  title={copy['projectIde.boundaryTitle']}
                  boundaryId={`project:${projectId}:ide`}
                >
                  <Suspense fallback={optimisticShell}>
                    <ProjectIdeChat
                      forceWorkbench
                      projectIdeMode
                      projectId={projectId}
                      projectUrl={projectUrl}
                      initialIdePanels={initialIdePanels}
                    />
                  </Suspense>
                </ZoneErrorBoundary>
              )}
            </ClientOnly>
          </main>
        </div>
      </ProjectWorkspaceProvider>
    </CurrentWorkspaceProvider>
  );
}

function IdeProjectTopBar({
  projectId,
  project,
  workspace,
  organization,
  git,
  collaborators,
  notifications,
  projectApiError,
  projectUrl,
}: {
  projectId: string;
  project: ProjectLoaderData['project'];
  workspace: ProjectLoaderData['workspace'];
  organization: ProjectLoaderData['organization'];
  git: ProjectLoaderData['git'];
  collaborators: ProjectLoaderData['collaborators'];
  notifications: ProjectLoaderData['notifications'];
  projectApiError?: string;
  projectUrl: string;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectIdeCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatProjectIdeCopy(template, values);

  const loading = useStore(workbenchStore.workspaceLoading);
  const error = useStore(workbenchStore.workspaceError);
  const previews = useStore(workbenchStore.previews);
  const runtimeWorkspaceStatus = useStore(workbenchStore.workspaceStatus);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [displayProjectName, setDisplayProjectName] = useState(project.name);
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const filesPanelOpen = useStore(workbenchStore.projectFilesPanelOpen);
  const effectiveWorkspace = runtimeWorkspaceStatus ?? workspace;

  /**
   * RPL-IDE-001.8 — hand Spotlight to the workspace shell, which owns the
   * palette engine it is built on. Same window-event channel the topbar already
   * uses to open tool panels.
   */
  const openProjectSpotlight = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('vibecore:open-project-spotlight', { detail: { projectName: displayProjectName } }),
    );
  }, [displayProjectName]);

  const isReallyRunning = isWorkspaceReallyRunning(effectiveWorkspace, previews);
  const previewRunning = isReallyRunning;
  const workspaceState = workspaceUiState(effectiveWorkspace, { ports: previews, loading, error });

  const state =
    workspaceState === 'starting'
      ? 'building'
      : workspaceState === 'error'
        ? 'crashed'
        : workspaceState === 'running'
          ? 'running'
          : 'stopped';

  const notificationItems = useMemo(
    () =>
      buildIdeNotifications({
        projectUrl,
        backendEvents: notifications,
        runtimeState: state,
        runtimeError: projectApiError ?? error,
        previewPorts: previews.map((preview) => preview.port),
        language,
      }),
    [error, language, notifications, previews, projectApiError, projectUrl, state],
  );
  const actionableNotificationCount = notificationItems.filter(
    (item) => item.kind === 'warning' || item.kind === 'error',
  ).length;

  const visibleCollaborators = collaborators.length ? collaborators : [{ userId: 'you', roleKey: 'owner' }];

  const workspaceLabel = pickFriendlyLabel(
    [organization?.name, organization?.slug, workspace?.name, workspace?.id, project.organizationId],
    copy['projectIde.workspace.fallback'],
  );

  const projectLabel = friendlyLabel(displayProjectName, copy['projectIde.project.fallback']);

  const projectTooltip =
    projectLabel.isFallback && projectLabel.full !== projectLabel.display
      ? `${projectLabel.display} (${projectLabel.full})`
      : projectLabel.display;
  const workspaceIdentifier =
    workspaceLabel.isFallback && workspaceLabel.full !== workspaceLabel.display
      ? text(copy['projectIde.identifier'], { identifier: workspaceLabel.full })
      : '';
  const projectIdentifier =
    projectLabel.isFallback && projectLabel.full !== projectLabel.display
      ? text(copy['projectIde.identifier'], { identifier: projectLabel.full })
      : '';

  const branchLabel = pickFriendlyLabel([git.branch, project.gitDefaultBranch], 'main');

  useEffect(() => {
    setDisplayProjectName(project.name);
    setRenameValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (renamingProject) {
      window.requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingProject]);

  useEffect(() => {
    if (!overflowMenuOpen) {
      return undefined;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && overflowMenuRef.current?.contains(target)) {
        return;
      }

      setOverflowMenuOpen(false);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOverflowMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [overflowMenuOpen]);

  const startInlineRename = () => {
    setProjectMenuOpen(false);
    setRenameError(null);
    setRenameValue(displayProjectName);
    setRenamingProject(true);
  };

  const cancelInlineRename = () => {
    setRenameError(null);
    setRenameValue(displayProjectName);
    setRenamingProject(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineRename();
    }
  };

  const submitInlineRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = renameValue.trim();

    if (!nextName || nextName === displayProjectName) {
      cancelInlineRename();
      return;
    }

    setRenameSaving(true);
    setRenameError(null);

    try {
      const form = new FormData();
      form.set('intent', 'rename');
      form.set('projectName', displayProjectName);
      form.set('name', nextName);

      const response = await fetch(`/api/projects/${projectId}/project-action`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        console.error('Project rename failed', result.error);
        throw new Error(copy['projectIde.project.renameFailed']);
      }

      setDisplayProjectName(nextName);
      setRenameValue(nextName);
      setRenamingProject(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : copy['projectIde.project.renameFailed']);
    } finally {
      setRenameSaving(false);
    }
  };

  const toggleFilesPanel = (open: boolean) => {
    const detail = { open };

    workbenchStore.projectFilesPanelOpen.set(open);
    workbenchStore.requestProjectFilesPanel(open);
    window.dispatchEvent(new CustomEvent('vibecore:toggle-project-files-panel', { detail }));
  };

  const filesPanelToggleLabel = filesPanelOpen ? copy['projectIde.files.close'] : copy['projectIde.files.open'];

  return (
    <header className="bolt-project-topbar fixed left-0 top-0 z-50 flex w-screen items-center justify-between border-b text-[12px]">
      <div className="bolt-project-topbar-left">
        <Link to="/dashboard" className="bolt-project-topbar-icon-button" aria-label={copy['projectIde.dashboard']}>
          <Home className="h-4 w-4" aria-hidden />
        </Link>
        <nav className="bolt-project-breadcrumb" aria-label={copy['projectIde.breadcrumb']}>
          <Link
            to="/projects"
            className="bolt-project-breadcrumb-segment bolt-project-breadcrumb-workspace"
            aria-label={text(copy['projectIde.workspace.aria'], {
              workspace: workspaceLabel.display,
              identifier: workspaceIdentifier,
            })}
            title={text(copy['projectIde.workspace.title'], {
              workspace: workspaceLabel.display,
              identifier: workspaceIdentifier,
            })}
          >
            <span className="bolt-project-breadcrumb-kicker">{copy['projectIde.workspace.kicker']}</span>
            <span className="bolt-project-breadcrumb-value truncate">{workspaceLabel.display}</span>
          </Link>
          <ProjectBreadcrumbSeparator />
          {renamingProject ? (
            <form className="bolt-project-rename-form" onSubmit={submitInlineRename}>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={handleRenameKeyDown}
                className="bolt-project-rename-input"
                aria-label={copy['projectIde.project.name']}
                aria-invalid={renameError ? true : undefined}
                aria-describedby={renameError ? 'project-rename-error' : undefined}
                title={renameError || copy['projectIde.project.renameHelp']}
                disabled={renameSaving}
              />
              <button type="submit" className="bolt-project-rename-save" disabled={renameSaving || !renameValue.trim()}>
                {renameSaving ? copy['projectIde.project.saving'] : copy['projectIde.project.save']}
              </button>
              {renameError ? (
                <p id="project-rename-error" role="alert" className="bolt-project-rename-error">
                  {renameError}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="bolt-project-name-shell">
              <details
                className="relative min-w-0"
                open={projectMenuOpen}
                onToggle={(event) => setProjectMenuOpen(event.currentTarget.open)}
              >
                <summary
                  className="bolt-project-name-trigger"
                  title={projectTooltip}
                  data-vc-tooltip={projectTooltip}
                  data-vc-tooltip-locked="true"
                  aria-label={text(copy['projectIde.project.menu'], {
                    project: projectLabel.display,
                    identifier: projectIdentifier,
                  })}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    startInlineRename();
                  }}
                >
                  <span className="bolt-project-breadcrumb-kicker">{copy['projectIde.project.kicker']}</span>
                  {/*
                   * SCR-006 — « le clic sur le NOM du projet ouvre la recherche ».
                   *
                   * Le nom vit dans le `<summary>` d'un `<details>` dont le rôle est
                   * d'ouvrir le menu projet (Paramètres, renommage). Remplacer le
                   * `<summary>` en entier aurait supprimé ces accès. On sépare donc
                   * les deux gestes : le NOM ouvre la recherche, le chevron garde le
                   * menu. `preventDefault` empêche le `<details>` de basculer sous le
                   * clic, `stopPropagation` empêche le `<summary>` de le récupérer.
                   */}
                  <button
                    type="button"
                    className="bolt-project-breadcrumb-value truncate"
                    title={projectTooltip}
                    aria-label={copy['projectIde.project.search']}
                    data-testid="button-project-name-search"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('vibecore:open-command-palette', { detail: { mode: 'all' } }),
                      );
                    }}
                  >
                    {projectLabel.display}
                  </button>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </summary>
                {projectMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--vc-ide-border-visible)] bg-[var(--vc-ide-bg-card)] p-1.5 shadow-[var(--vc-ui-shadow-xl)]">
                    <ProjectMenuItem
                      to={withProjectSearch(projectUrl, { panel: 'settings' })}
                      icon={<Settings className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setProjectMenuOpen(false);
                        window.dispatchEvent(
                          new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'settings' } }),
                        );
                      }}
                    >
                      {copy['projectIde.menu.settings']}
                    </ProjectMenuItem>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="fork"
                      projectName={displayProjectName}
                      icon={<Copy className="h-3.5 w-3.5" />}
                    >
                      {copy['projectIde.menu.fork']}
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="rename"
                      projectName={displayProjectName}
                      icon={<PenLine className="h-3.5 w-3.5" />}
                    >
                      {copy['projectIde.menu.rename']}
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="delete"
                      projectName={displayProjectName}
                      icon={<Trash2 className="h-3.5 w-3.5 text-[#F85149]" />}
                    >
                      {copy['projectIde.menu.delete']}
                    </ProjectMenuAction>
                    <ProjectMenuAction
                      action={`/api/projects/${projectId}/project-action`}
                      intent="duplicate"
                      projectName={displayProjectName}
                      icon={<Copy className="h-3.5 w-3.5" />}
                    >
                      {copy['projectIde.menu.duplicate']}
                    </ProjectMenuAction>
                    <ProjectMenuItem
                      to={`/api/projects/${projectId}/project-action?intent=export`}
                      icon={<Download className="h-3.5 w-3.5" />}
                      download
                    >
                      {copy['projectIde.menu.export']}
                    </ProjectMenuItem>
                  </div>
                )}
              </details>
              <button
                type="button"
                className="bolt-project-inline-rename-button"
                aria-label={text(copy['projectIde.project.renameAria'], { project: displayProjectName })}
                title={text(copy['projectIde.project.renameAria'], { project: displayProjectName })}
                onClick={startInlineRename}
              >
                <PenLine className="h-3 w-3" aria-hidden />
              </button>
            </div>
          )}
          <ProjectBreadcrumbSeparator />
          <Link
            to={withProjectSearch(projectUrl, { panel: 'git' })}
            className="bolt-project-breadcrumb-segment bolt-project-breadcrumb-branch"
            aria-label={text(copy['projectIde.branch.aria'], { branch: branchLabel.display })}
            title={text(copy['projectIde.branch.title'], { branch: branchLabel.display })}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'git' } }));
            }}
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            <span className="bolt-project-breadcrumb-kicker">{copy['projectIde.branch.kicker']}</span>
            <span className="bolt-project-breadcrumb-value truncate">{branchLabel.display}</span>
          </Link>
        </nav>
        {/*
          RPL-IDE-001.7 — Resources sits beside the app name, as in Replit, so
          RAM/CPU/Storage pressure is visible from wherever you are in the IDE
          rather than being buried in a tool tab.
        */}
        <ProjectResourcesPanel projectId={projectId} workspaceId={effectiveWorkspace?.id} />
      </div>
      <div className="bolt-project-topbar-actions">
        <div
          ref={overflowMenuRef}
          className="bolt-project-action-group bolt-project-action-group--overflow"
          data-priority="overflow"
          aria-label={copy['projectIde.actions.more']}
        >
          {/*
            RPL-IDE-001.8 — le déclencheur de Spotlight. Le rappel, les
            traductions et l'écouteur côté coque existaient déjà ; seul ce
            bouton manquait, si bien que la palette n'était joignable depuis
            aucun endroit de l'IDE.
          */}
          <button
            type="button"
            data-testid="ide-spotlight-trigger"
            className="bolt-project-topbar-icon-button"
            aria-label={text(copy['projectIde.project.spotlightAria'], { project: displayProjectName })}
            title={copy['projectIde.project.spotlight']}
            data-vc-tooltip={copy['projectIde.project.spotlight']}
            onClick={openProjectSpotlight}
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            data-testid="ide-files-panel-toggle"
            className={filesPanelOpen ? 'bolt-project-topbar-icon-button is-active' : 'bolt-project-topbar-icon-button'}
            aria-label={filesPanelToggleLabel}
            aria-pressed={filesPanelOpen}
            title={filesPanelToggleLabel}
            data-vc-tooltip={filesPanelToggleLabel}
            onClick={() => toggleFilesPanel(!filesPanelOpen)}
          >
            <Files className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className="bolt-project-topbar-icon-button"
            aria-label={copy['projectIde.actions.moreTopbar']}
            aria-haspopup="menu"
            aria-expanded={overflowMenuOpen}
            title={copy['projectIde.actions.more']}
            onClick={() => setOverflowMenuOpen((value) => !value)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            {notificationItems.length > 0 && (
              <span
                className="bolt-project-notification-dot"
                data-urgent={actionableNotificationCount > 0 ? 'true' : 'false'}
                aria-hidden
              />
            )}
          </button>
          {overflowMenuOpen && (
            <div
              role="dialog"
              aria-label={copy['projectIde.actions.dialog']}
              className="bolt-project-overflow-popover absolute right-0 top-full z-50 mt-1 w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-xl border p-2"
            >
              <div className="bolt-project-overflow-section">
                <div className="bolt-project-notification-header">
                  <div>
                    <strong>{copy['projectIde.notifications.title']}</strong>
                    <span>{copy['projectIde.notifications.description']}</span>
                  </div>
                  <span className="bolt-project-notification-count">
                    {formatProjectIdeCount(
                      copy,
                      'projectIde.notifications.event_one',
                      'projectIde.notifications.event_other',
                      notificationItems.length,
                    )}
                  </span>
                </div>
                {notificationItems.length ? (
                  <div className="bolt-project-notification-list">
                    {notificationItems.slice(0, 5).map((notification) => {
                      const Icon = notificationIcon(notification.kind);
                      const sourceKey = `projectIde.notifications.source.${notification.source}` as const;

                      return (
                        <div key={notification.id} className="bolt-project-notification-row">
                          <Link
                            to={notification.href}
                            className="bolt-project-notification-item"
                            data-kind={notification.kind}
                            onClick={() => setOverflowMenuOpen(false)}
                          >
                            <span className="bolt-project-notification-icon" aria-hidden>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="bolt-project-notification-title">{notification.title}</span>
                              <span className="bolt-project-notification-detail">{notification.detail}</span>
                              <span className="bolt-project-notification-meta">
                                <span>{copy[sourceKey]}</span>
                                <span aria-hidden>•</span>
                                <span>{notification.timeLabel}</span>
                              </span>
                            </span>
                          </Link>
                          {notification.action?.kind === 'restart-workspace' ? (
                            <button
                              type="button"
                              data-testid="ide-notification-restart-workspace"
                              className="bolt-project-notification-action"
                              onClick={() => {
                                setOverflowMenuOpen(false);
                                restartWorkspace();
                              }}
                            >
                              <Play className="h-3 w-3 fill-current" aria-hidden />
                              <span>{notification.action.label}</span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bolt-project-notification-empty">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    <span>{copy['projectIde.notifications.empty']}</span>
                    <small>{copy['projectIde.notifications.emptyDetail']}</small>
                  </div>
                )}
              </div>
              <div className="bolt-project-overflow-section bolt-project-overflow-section--grid">
                <Link to="/support" className="bolt-project-overflow-item" onClick={() => setOverflowMenuOpen(false)}>
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                  <span>{copy['projectIde.help']}</span>
                </Link>
                <Link
                  to={withProjectSearch(projectUrl, { panel: 'collaborators' })}
                  className="bolt-project-overflow-item"
                  onClick={() => setOverflowMenuOpen(false)}
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  <span>
                    {formatProjectIdeCount(
                      copy,
                      'projectIde.collaborators.one',
                      'projectIde.collaborators.other',
                      visibleCollaborators.length,
                    )}
                  </span>
                </Link>
                <Link
                  to="/account-settings"
                  className="bolt-project-overflow-item"
                  onClick={() => setOverflowMenuOpen(false)}
                >
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span>{copy['projectIde.account']}</span>
                </Link>
              </div>
              <form method="post" action="/logout">
                <button type="submit" className="bolt-project-overflow-item bolt-project-overflow-item--danger">
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span>{copy['projectIde.signOut']}</span>
                </button>
              </form>
            </div>
          )}
        </div>
        <div className="bolt-project-action-group bolt-project-action-group--collaborate" data-priority="high">
          {/* Replit parity: a visible Invite button (not an icon-only menu). The
              collaborators panel it opens already hosts both invite-by-email and
              the expirable share link (F14), so one button covers share + invite. */}
          <Link
            to={withProjectSearch(projectUrl, { panel: 'collaborators' })}
            className="bolt-project-topbar-outline-button"
            aria-label={copy['projectIde.invite.aria']}
            title={copy['projectIde.invite.title']}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            <span>{copy['projectIde.invite.label']}</span>
          </Link>
        </div>
        <div
          className="bolt-project-action-group bolt-project-action-group--primary"
          data-priority="high"
          aria-label={copy['projectIde.runPublish']}
        >
          {state === 'crashed' ? (
            <button
              type="button"
              data-testid="button-restart-workspace"
              className="bolt-project-run-button is-crashed"
              title={copy['projectIde.restart.title']}
              data-vc-tooltip={copy['projectIde.restart.tooltip']}
              onClick={() => restartWorkspace()}
            >
              <Play className="h-3 w-3 fill-current" aria-hidden />
              <span>{copy['projectIde.restart.label']}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="button-run-stop"
              className={previewRunning ? 'bolt-project-run-button is-running' : 'bolt-project-run-button'}
              onClick={() => {
                if (previewRunning) {
                  void workbenchStore.stopPreviewServer().catch(() => undefined);

                  return;
                }

                window.dispatchEvent(
                  new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'preview' } }),
                );
              }}
            >
              {previewRunning ? (
                <>
                  <Square className="h-3 w-3 fill-current" aria-hidden />
                  <span>{copy['projectIde.stop']}</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" aria-hidden />
                  <span>{copy['projectIde.run']}</span>
                </>
              )}
            </button>
          )}
          {/*
           * Unify publish on ONE path (Replit-parity: a single publish flow).
           * The most-visible Publish button MUST reach our auto-detecting deploy
           * pipeline (server/static, provider='server' included) — NOT the
           * external-provider wizard (Vercel/Netlify/…). That wizard used to be
           * the default here (panel=deployments -> ProjectDeploymentsPanel), so a
           * user clicking the top Publish never touched our server-deploy. Point
           * it at the project Deployments PAGE, whose DeployPublishCard detects
           * "express -> server deployment" and runs the snapshot->image->run
           * pipeline; the external providers live under that page's Manage tab as
           * an advanced option, no longer the default.
           */}
          <Link
            to={`/projects/${projectId}/deployments`}
            className="bolt-project-publish-button"
            title={
              (project.deploymentCount ?? 0) > 0 ? copy['projectIde.republish.title'] : copy['projectIde.publish.title']
            }
          >
            <Rocket className="h-3 w-3" aria-hidden />
            {(project.deploymentCount ?? 0) > 0 ? copy['projectIde.republish'] : copy['projectIde.publish']}
          </Link>
        </div>
      </div>
    </header>
  );
}

function notificationIcon(kind: IdeNotificationKind) {
  switch (kind) {
    case 'success':
      return CheckCircle2;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertTriangle;
    default:
      return kind === 'info' ? Activity : Clock3;
  }
}

function ProjectMenuItem({
  to,
  icon,
  children,
  onClick,
  download,
}: {
  to: string;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;

  /*
   * When the target is a binary/download endpoint (e.g. the project export zip)
   * a React Router <Link> performs an in-app SPA fetch, which never turns the
   * response into a file download and honours Content-Disposition. Render a
   * native anchor with `download` so the browser does a real document
   * navigation instead.
   */
  download?: boolean;
}) {
  const className =
    'flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)]';

  if (download) {
    return (
      <a href={to} download className={className} onClick={onClick}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }

  return (
    <Link to={to} className={className} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function ProjectMenuAction({
  action,
  intent,
  projectName,
  icon,
  children,
}: {
  action: string;
  intent: string;
  projectName: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  const copy = getProjectIdeCopy(i18n.resolvedLanguage ?? i18n.language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatProjectIdeCopy(template, values);

  type RemixPolicy = 'DETACH' | 'CLONE' | 'SHARE_WITH_CONSENT';
  type RemixContract = { policies: RemixPolicy[]; storageConsentVersion: string };
  type PendingRemixRequest = {
    idempotencyKey: string;
    storagePolicy: RemixPolicy;
    storageConsentVersion?: string;
  };

  const [busy, setBusy] = useState(false);
  const remixRequest = useRef<PendingRemixRequest | null>(null);
  const remixStorageKey = `vibecore:pending-remix:${action}`;

  const readRememberedRemix = (): PendingRemixRequest | null => {
    try {
      const parsed = JSON.parse(
        globalThis.localStorage.getItem(remixStorageKey) ?? 'null',
      ) as Partial<PendingRemixRequest> | null;

      const storagePolicy = parsed?.storagePolicy;

      if (
        !parsed ||
        typeof parsed.idempotencyKey !== 'string' ||
        parsed.idempotencyKey.length < 8 ||
        parsed.idempotencyKey.length > 200 ||
        !storagePolicy ||
        !['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'].includes(storagePolicy) ||
        (storagePolicy === 'SHARE_WITH_CONSENT' && typeof parsed.storageConsentVersion !== 'string')
      ) {
        return null;
      }

      return {
        idempotencyKey: parsed.idempotencyKey,
        storagePolicy,
        ...(typeof parsed.storageConsentVersion === 'string'
          ? { storageConsentVersion: parsed.storageConsentVersion }
          : {}),
      };
    } catch {
      return null;
    }
  };

  const rememberRemix = (request: PendingRemixRequest | null) => {
    try {
      if (request) {
        globalThis.localStorage.setItem(remixStorageKey, JSON.stringify(request));
      } else {
        globalThis.localStorage.removeItem(remixStorageKey);
      }
    } catch {
      /*
       * Storage can be unavailable in hardened/private browser contexts. The
       * in-memory request still preserves idempotency for this page lifetime.
       */
    }
  };

  // G5: delete confirm / rename prompt now use token-styled dialogs.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [forkPolicy, setForkPolicy] = useState<RemixPolicy>('DETACH');
  const [shareConsent, setShareConsent] = useState(false);
  const [remixContract, setRemixContract] = useState<RemixContract | null>(null);
  const [remixContractState, setRemixContractState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [remixContractAttempt, setRemixContractAttempt] = useState(0);

  useEffect(() => {
    if (intent !== 'fork' || !forkOpen || remixContract) {
      return undefined;
    }

    const controller = new AbortController();
    setRemixContractState('loading');

    void fetch(`${action}?intent=remix-policy`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as Partial<RemixContract> & { ok?: boolean };

        if (
          !response.ok ||
          result.ok === false ||
          !Array.isArray(result.policies) ||
          typeof result.storageConsentVersion !== 'string'
        ) {
          throw new Error(copy['projectIde.fork.error']);
        }

        const policies = result.policies.filter((policy): policy is RemixPolicy =>
          ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'].includes(policy),
        );

        if (policies.length === 0) {
          throw new Error(copy['projectIde.fork.error']);
        }

        setRemixContract({ policies, storageConsentVersion: result.storageConsentVersion });
        setForkPolicy(policies.includes('DETACH') ? 'DETACH' : policies[0]);
        setRemixContractState('idle');
      })
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          setRemixContractState('error');
        }
      });

    return () => controller.abort();
  }, [action, forkOpen, intent, remixContract, remixContractAttempt]);

  const runAction = async (
    name?: string,
    forkOptions?: { storagePolicy: RemixPolicy; storageConsentVersion?: string },
  ) => {
    setBusy(true);

    try {
      const form = new FormData();
      form.set('intent', intent);
      form.set('projectName', projectName);

      if (intent === 'fork') {
        if (!remixRequest.current) {
          if (!forkOptions) {
            return;
          }

          const request = {
            idempotencyKey: globalThis.crypto.randomUUID(),
            ...forkOptions,
          };
          remixRequest.current = request;
          rememberRemix(request);
        }

        form.set('idempotencyKey', remixRequest.current.idempotencyKey);
        form.set('storagePolicy', remixRequest.current.storagePolicy);

        if (remixRequest.current.storageConsentVersion) {
          form.set('storageConsentVersion', remixRequest.current.storageConsentVersion);
        }
      }

      if (intent === 'rename') {
        if (!name) {
          setBusy(false);
          return;
        }

        form.set('name', name);
      }

      const response = await fetch(action, { method: 'POST', body: form, credentials: 'include' });

      const result = (await response.json().catch(() => ({}))) as {
        project?: { project?: { id?: string }; id?: string };
        pending?: boolean;
        error?: string;
      };

      if (!response.ok) {
        /*
         * Don't silently swallow quota/permission/server errors — the action
         * would otherwise appear to do nothing. Surface the reason.
         */
        console.error('Project action failed', intent, result.error);

        const localizedAction =
          intent === 'delete'
            ? copy['projectIde.action.delete']
            : intent === 'rename'
              ? copy['projectIde.action.rename']
              : intent === 'duplicate'
                ? copy['projectIde.action.duplicate']
                : copy['projectIde.action.fork'];

        configuredToast.error(text(copy['projectIde.action.failed'], { action: localizedAction }));

        if (intent === 'fork' && response.status < 500) {
          remixRequest.current = null;
          rememberRemix(null);
        }
      } else if (intent === 'delete') {
        window.location.href = '/projects';
      } else if (intent === 'duplicate' || intent === 'fork') {
        const nextProjectId = result.project?.project?.id ?? result.project?.id;

        if (nextProjectId) {
          if (intent === 'fork') {
            remixRequest.current = null;
            rememberRemix(null);
          }

          window.location.href = `/projects/${nextProjectId}/ide`;
        } else if (intent === 'fork' && result.pending) {
          configuredToast.info(copy['projectIde.action.forkPending']);
        }
      } else if (intent === 'rename') {
        window.location.reload();
      }
    } catch {
      const localizedAction =
        intent === 'delete'
          ? copy['projectIde.action.delete']
          : intent === 'rename'
            ? copy['projectIde.action.rename']
            : intent === 'duplicate'
              ? copy['projectIde.action.duplicate']
              : copy['projectIde.action.fork'];
      configuredToast.error(text(copy['projectIde.action.failed'], { action: localizedAction }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[var(--vc-ide-text-primary)] hover:bg-[var(--vc-ide-bg-hover)] disabled:opacity-60"
        onClick={() => {
          if (intent === 'delete') {
            setConfirmDeleteOpen(true);
            return;
          }

          if (intent === 'rename') {
            setRenameOpen(true);
            return;
          }

          if (intent === 'fork') {
            const pending = remixRequest.current ?? readRememberedRemix();

            if (pending) {
              remixRequest.current = pending;
              void runAction(undefined, pending);
            } else {
              setShareConsent(false);
              setForkOpen(true);
            }

            return;
          }

          void runAction();
        }}
      >
        {icon}
        <span>{busy ? copy['projectIde.action.working'] : children}</span>
      </button>
      {intent === 'delete' ? (
        <ConfirmationDialog
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            void runAction();
          }}
          title={text(copy['projectIde.delete.title'], { project: projectName })}
          description={copy['projectIde.delete.description']}
          confirmLabel={copy['projectIde.delete.confirm']}
          variant="destructive"
        />
      ) : null}
      {intent === 'rename' ? (
        <InputDialog
          isOpen={renameOpen}
          onClose={() => setRenameOpen(false)}
          onSubmit={(value) => {
            setRenameOpen(false);
            void runAction(value.trim());
          }}
          title={copy['projectIde.rename.title']}
          label={copy['projectIde.rename.label']}
          initialValue={projectName}
          confirmLabel={copy['projectIde.rename.confirm']}
          validate={(value) => (value.trim() ? undefined : copy['projectIde.rename.required'])}
        />
      ) : null}
      {intent === 'fork' ? (
        <DialogRoot open={forkOpen} onOpenChange={(open) => !open && !busy && setForkOpen(false)}>
          <Dialog onClose={() => setForkOpen(false)} onBackdrop={() => !busy && setForkOpen(false)}>
            <div className="flex min-h-0 flex-col gap-4 p-5 sm:p-6">
              <div className="pr-9">
                <DialogTitle>{copy['projectIde.fork.title']}</DialogTitle>
                <DialogDescription>{copy['projectIde.fork.description']}</DialogDescription>
              </div>

              {remixContractState === 'loading' ? (
                <div className="grid gap-2" aria-busy="true" aria-label={copy['projectIde.fork.loading']}>
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-16 animate-pulse rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3"
                    />
                  ))}
                </div>
              ) : remixContractState === 'error' ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-sm text-bolt-elements-textPrimary"
                >
                  <p>{copy['projectIde.fork.error']}</p>
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 font-medium hover:bg-bolt-elements-background-depth-3"
                    onClick={() => {
                      setRemixContractState('idle');
                      setRemixContractAttempt((value) => value + 1);
                    }}
                  >
                    {copy['projectIde.fork.retry']}
                  </button>
                </div>
              ) : remixContract ? (
                <div className="grid gap-2" role="radiogroup" aria-label={copy['projectIde.fork.policyLabel']}>
                  {remixContract.policies.map((policy) => {
                    const key = policy === 'DETACH' ? 'detach' : policy === 'CLONE' ? 'clone' : 'share';
                    const selected = forkPolicy === policy;

                    return (
                      <label
                        key={policy}
                        className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                          selected
                            ? 'border-[var(--vc-action-primary)] bg-[var(--vc-action-primary)]/10'
                            : 'border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3'
                        }`}
                      >
                        <input
                          type="radio"
                          name="remix-storage-policy"
                          value={policy}
                          checked={selected}
                          onChange={() => {
                            setForkPolicy(policy);

                            if (policy !== 'SHARE_WITH_CONSENT') {
                              setShareConsent(false);
                            }
                          }}
                          className="mt-1 accent-[var(--vc-action-primary)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-bolt-elements-textPrimary">
                            {copy[`projectIde.fork.policy.${key}.title`]}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-bolt-elements-textSecondary">
                            {copy[`projectIde.fork.policy.${key}.description`]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {remixContract && forkPolicy === 'SHARE_WITH_CONSENT' ? (
                <label className="flex gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-bolt-elements-textPrimary">
                  <input
                    type="checkbox"
                    checked={shareConsent}
                    onChange={(event) => setShareConsent(event.currentTarget.checked)}
                    className="mt-1 accent-[var(--vc-action-primary)]"
                  />
                  <span>{copy['projectIde.fork.shareConsent']}</span>
                </label>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogButton type="secondary" disabled={busy} onClick={() => setForkOpen(false)}>
                  {copy['projectIde.fork.cancel']}
                </DialogButton>
                <DialogButton
                  type="primary"
                  disabled={
                    busy ||
                    !remixContract ||
                    remixContractState !== 'idle' ||
                    (forkPolicy === 'SHARE_WITH_CONSENT' && !shareConsent)
                  }
                  onClick={() => {
                    if (!remixContract) {
                      return;
                    }

                    setForkOpen(false);
                    void runAction(undefined, {
                      storagePolicy: forkPolicy,
                      ...(forkPolicy === 'SHARE_WITH_CONSENT'
                        ? { storageConsentVersion: remixContract.storageConsentVersion }
                        : {}),
                    });
                  }}
                >
                  {busy ? copy['projectIde.action.working'] : copy['projectIde.fork.confirm']}
                </DialogButton>
              </div>
            </div>
          </Dialog>
        </DialogRoot>
      ) : null}
    </>
  );
}
