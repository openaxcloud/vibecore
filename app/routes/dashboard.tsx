import { Activity, Boxes, CreditCard, MailPlus, Rocket, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { resolveDashboardHeaderActions, shouldUseSpaNavigation } from './dashboard-nav';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import {
  ActivityList,
  AppShell,
  CommandPalettePreview,
  OnboardingChecklistCard,
  ProjectGrid,
  StatGrid,
  importOptions,
  LinkButton,
  statsFromUsage,
  type ProjectCard,
} from '~/components/dashboard/SaaSLayout';
import { withoutBillingDestinations } from '~/lib/billing/billing-destinations';
import { useBillingEnabled } from '~/lib/billing/use-billing-enabled';
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { apiRequest, isForbiddenApiResponse, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { userAreaEn, userAreaFr } from '~/lib/i18n/catalogs/user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectLifecycle, projectLifecycleDisplayLabel } from '~/lib/project-card-presentation';
import { projectIdePath } from '~/utils/project-url';

type Organization = { id: string; slug?: string };
type ApiProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
  deploymentCount?: number;
};
type BillingState = {
  plan: { name: string };
  usage: Array<{ type: string; quantity: number }>;
  activeWorkspaces?: number;
};

const fallbackBilling: BillingState = {
  plan: { name: 'Unavailable' },
  usage: [],
};

async function optionalBillingRequest(request: Request, organizationId: string) {
  try {
    return {
      billing: await apiRequest<BillingState>(request, `/orgs/${organizationId}/billing`),
      billingAccessLimited: false,
    };
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return { billing: fallbackBilling, billingAccessLimited: true };
    }

    throw error;
  }
}

/*
 * Aggregated AI spend for the org, summed across the whole ledger. Gated on
 * billing:read like the billing endpoint, so a role without billing access
 * simply reports EUR 0.00 rather than failing the dashboard.
 */
async function optionalAiCostCents(request: Request, organizationId: string) {
  try {
    const summary = await apiRequest<{ totals?: { costCents?: number } }>(
      request,
      `/orgs/${organizationId}/ai/cost-summary`,
    );

    const costCents = summary?.totals?.costCents;

    return Number.isFinite(costCents) ? (costCents as number) : 0;
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return 0;
    }

    throw error;
  }
}

type OnboardingSummary = {
  createdFirstApp: boolean;
  deployedFirstApp: boolean;
  invitedTeammate: boolean;
  deployTo?: string;
  projectName?: string;
  checksUnavailable: boolean;
};

/*
 * "Get set up" card signals. Each probe is best-effort: onboarding hints must
 * never break the dashboard, so a failed lookup simply reports its step as not
 * done. The card itself hides once all three steps are complete.
 */
async function onboardingSignals(
  request: Request,
  organizationId: string,
  projectCount: number,
  mostRecentProject?: { id: string; name: string },
): Promise<OnboardingSummary> {
  const mostRecentProjectId = mostRecentProject?.id;

  const [deploymentProbe, invitationProbe] = await Promise.all([
    (async () => {
      if (!mostRecentProjectId) {
        return { complete: false, unavailable: false };
      }

      try {
        const result = await apiRequest<{ deployments?: unknown[] }>(
          request,
          `/projects/${mostRecentProjectId}/deployments`,
        );

        return { complete: Array.isArray(result?.deployments) && result.deployments.length > 0, unavailable: false };
      } catch {
        return { complete: false, unavailable: true };
      }
    })(),
    (async () => {
      try {
        const result = await apiRequest<{ invitations?: unknown[] }>(request, `/orgs/${organizationId}/invitations`);

        return { complete: Array.isArray(result?.invitations) && result.invitations.length > 0, unavailable: false };
      } catch {
        return { complete: false, unavailable: true };
      }
    })(),
  ]);

  return {
    createdFirstApp: projectCount >= 1,
    deployedFirstApp: deploymentProbe.complete,
    invitedTeammate: invitationProbe.complete,
    deployTo: mostRecentProjectId ? `/projects/${mostRecentProjectId}/deployments` : undefined,
    projectName: mostRecentProject?.name,
    checksUnavailable: deploymentProbe.unavailable || invitationProbe.unavailable,
  };
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = Array.isArray(orgs?.organizations) ? orgs.organizations[0] : undefined;

  if (!organization) {
    return {
      language,
      usageSummary: { projects: 0, activeWorkspaces: 0, planName: 'Free', usageEvents: 0, aiCostCents: 0 },
      billingAccessLimited: false,
      projects: [] satisfies ProjectCard[],
      onboarding: {
        createdFirstApp: false,
        deployedFirstApp: false,
        invitedTeammate: false,
        checksUnavailable: false,
      } satisfies OnboardingSummary,
    };
  }

  const [result, billingResult, aiCostCents] = await Promise.all([
    apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`),
    optionalBillingRequest(request, organization.id),
    optionalAiCostCents(request, organization.id),
  ]);

  const { billing, billingAccessLimited } = billingResult;
  const projects = Array.isArray(result?.projects) ? result.projects : [];

  const sortedProjects = [...projects].sort((a, b) => {
    /*
     * "Recent" must mean most-recently-updated, matching the /recent-projects
     * page this card links to (the API returns createdAt-desc order).
     */
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

    return bt - at;
  });

  const onboarding = await onboardingSignals(request, organization.id, projects.length, sortedProjects[0]);

  return {
    language,
    usageSummary: {
      projects: projects.length,

      /*
       * Live count from the API; fall back to 0 (never sum the append-only
       * workspaces.active ledger, which only ever grows).
       */
      activeWorkspaces: billing.activeWorkspaces ?? 0,
      planName: billingAccessLimited
        ? (language === 'fr' ? userAreaFr : userAreaEn)['userArea.stats.unavailable']
        : billing.plan.name,
      usageEvents: billing.usage.length,
      aiCostCents,
    },
    billingAccessLimited,
    onboarding,
    projects: sortedProjects.slice(0, 6).map((project) => {
      const lifecycle = projectLifecycle(project);

      return {
        id: project.id,
        name: project.name,
        status: projectLifecycleDisplayLabel(lifecycle, language),
        lifecycle,
        deploymentCount: project.deploymentCount,
        updated: project.updatedAt
          ? (formatUserAreaDateTime(project.updatedAt, undefined, language) ??
            (language === 'fr' ? userAreaFr : userAreaEn)['userArea.project.recently'])
          : (language === 'fr' ? userAreaFr : userAreaEn)['userArea.project.recently'],
        updatedAtIso: project.updatedAt,
        stack: projectStackLabel(project, language),
        sourceType: project.sourceType,
        previewImageUrl: `/api/projects/${project.id}/thumbnail`,
        ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization.slug }),
      };
    }),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? userAreaFr : userAreaEn)['dashboard.metaTitle'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export default function DashboardPage() {
  const { t } = useTranslation();
  const billingOn = useBillingEnabled();
  const { projects, usageSummary, billingAccessLimited, onboarding } = useLoaderData<typeof loader>();
  const headerActions = resolveDashboardHeaderActions(projects, (key) => t(key));

  const dashboardDescription =
    projects.length > 0 ? t('dashboard.withProjectsDescription') : t('dashboard.emptyDescription');

  const revalidator = useRevalidator();
  const retryingOnboarding = revalidator.state !== 'idle';

  return (
    <AppShell
      title={t('dashboard.title')}
      description={dashboardDescription}
      actions={
        <>
          <LinkButton to={headerActions.primary.to}>
            <span className="block max-w-[min(70vw,20rem)] truncate" title={headerActions.primary.label}>
              {headerActions.primary.label}
            </span>
          </LinkButton>
          {headerActions.secondary ? (
            <LinkButton to={headerActions.secondary.to} variant="outline">
              {headerActions.secondary.label}
            </LinkButton>
          ) : null}
        </>
      }
    >
      <div className="grid gap-6 overflow-x-clip">
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('dashboard.continueBuilding')}</h2>
              <LinkButton to="/recent-projects" variant="ghost">
                {t('dashboard.viewAll')}
              </LinkButton>
            </div>
            <ProjectGrid projects={projects} />
            <div className="mt-6">
              {onboarding.checksUnavailable ? (
                retryingOnboarding ? (
                  <AsyncPanelSkeleton label={t('dashboard.checkingSetup')} rows={3} compact />
                ) : (
                  <AsyncPanelError
                    title={t('dashboard.setupUnavailable')}
                    description={t('dashboard.setupUnavailableBody')}
                    onRetry={revalidator.revalidate}
                    compact
                  />
                )
              ) : (
                <OnboardingChecklistCard
                  steps={[
                    {
                      key: 'create',
                      title: t('dashboard.createFirstApp'),
                      description: onboarding.createdFirstApp
                        ? t('dashboard.projectReady', {
                            name: onboarding.projectName ?? t('userArea.project.persistent'),
                          })
                        : t('dashboard.describeApp'),
                      done: onboarding.createdFirstApp,
                      actionLabel: t('dashboard.create'),
                      to: '/projects/new',
                      glyph: <Sparkles className="h-4 w-4" aria-hidden />,
                    },
                    {
                      key: 'deploy',
                      title: t('dashboard.deployIt'),
                      description: t('dashboard.deployBody'),
                      done: onboarding.deployedFirstApp,
                      actionLabel: t('dashboard.deploy'),
                      to: onboarding.deployTo,
                      glyph: (
                        <span className="text-[13px] leading-none" aria-hidden>
                          ▲
                        </span>
                      ),
                    },
                    {
                      key: 'invite',
                      title: t('dashboard.inviteTeammate'),
                      description: t('dashboard.inviteBody'),
                      done: onboarding.invitedTeammate,
                      actionLabel: t('dashboard.invite'),
                      to: '/invitations',
                      glyph: <MailPlus className="h-4 w-4" aria-hidden />,
                    },
                  ]}
                />
              )}
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            <CommandPalettePreview projects={projects} />
            <h2 className="text-lg font-semibold">{t('dashboard.workspaceReadiness')}</h2>
            <ActivityList
              items={[
                {
                  title: t('dashboard.usageAvailable'),
                  detail: t('dashboard.usageAvailableBody'),
                  icon: Activity,
                },
                {
                  title: billingAccessLimited ? t('dashboard.billingRestricted') : t('dashboard.planCurrent'),
                  detail: billingAccessLimited ? t('dashboard.billingRestrictedBody') : t('dashboard.planCurrentBody'),
                  icon: CreditCard,
                },
                {
                  title: t('dashboard.capacityAvailable'),
                  detail: t('dashboard.capacityAvailableBody'),
                  icon: Boxes,
                },
                {
                  title: t('dashboard.readyDeploy'),
                  detail: t('dashboard.readyDeployBody'),
                  icon: Rocket,
                },
              ]}
            />
          </div>
        </section>
        <section aria-labelledby="workspace-overview-title">
          <h2 id="workspace-overview-title" className="mb-4 text-lg font-semibold">
            {t('dashboard.workspaceOverview')}
          </h2>
          {/* KILL-SWITCH FACTURATION : les tuiles « Plan » et « Coût IA » pointent vers
              la facturation — elles disparaissent avec elle. */}
          <StatGrid
            stats={withoutBillingDestinations(
              statsFromUsage(usageSummary, (key, options) => t(key, options)),
              billingOn,
            )}
          />
        </section>
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {importOptions.map((option) => {
            const Icon = option.icon;

            const className =
              'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 hover:bg-bolt-elements-background-depth-3';
            const body = (
              <>
                <Icon className="mb-3 h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
                <h3 className="text-sm font-semibold">{t(option.titleKey)}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{t(option.descriptionKey)}</p>
              </>
            );

            /*
             * Internal targets navigate client-side via <Link> so a card click
             * is an SPA transition (no loader re-run, no bundle re-download, no
             * white flash). Only genuinely external URLs fall back to <a href>.
             */
            if (shouldUseSpaNavigation(option.to)) {
              return (
                <Link key={option.title} to={option.to} className={className}>
                  {body}
                </Link>
              );
            }

            return (
              <a key={option.title} href={option.to} className={className}>
                {body}
              </a>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
