import { Activity, Boxes, CreditCard, MailPlus, Rocket, Sparkles } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { shouldUseSpaNavigation } from './dashboard-nav';
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
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { apiRequest, isForbiddenApiResponse, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
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
 * simply reports $0.00 rather than failing the dashboard.
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

  const [deployedFirstApp, invitedTeammate] = await Promise.all([
    (async () => {
      if (!mostRecentProjectId) {
        return false;
      }

      try {
        const result = await apiRequest<{ deployments?: unknown[] }>(
          request,
          `/projects/${mostRecentProjectId}/deployments`,
        );

        return Array.isArray(result?.deployments) && result.deployments.length > 0;
      } catch {
        return false;
      }
    })(),
    (async () => {
      try {
        const result = await apiRequest<{ invitations?: unknown[] }>(request, `/orgs/${organizationId}/invitations`);

        return Array.isArray(result?.invitations) && result.invitations.length > 0;
      } catch {
        return false;
      }
    })(),
  ]);

  return {
    createdFirstApp: projectCount >= 1,
    deployedFirstApp,
    invitedTeammate,
    deployTo: mostRecentProjectId ? `/projects/${mostRecentProjectId}/deployments` : undefined,
    projectName: mostRecentProject?.name,
  };
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = Array.isArray(orgs?.organizations) ? orgs.organizations[0] : undefined;

  if (!organization) {
    return {
      usageSummary: { projects: 0, activeWorkspaces: 0, planName: 'Free', usageEvents: 0, aiCostCents: 0 },
      billingAccessLimited: false,
      projects: [] satisfies ProjectCard[],
      onboarding: {
        createdFirstApp: false,
        deployedFirstApp: false,
        invitedTeammate: false,
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
    usageSummary: {
      projects: projects.length,

      /*
       * Live count from the API; fall back to 0 (never sum the append-only
       * workspaces.active ledger, which only ever grows).
       */
      activeWorkspaces: billing.activeWorkspaces ?? 0,
      planName: billing.plan.name,
      usageEvents: billing.usage.length,
      aiCostCents,
    },
    billingAccessLimited,
    onboarding,
    projects: sortedProjects.slice(0, 6).map((project) => ({
      id: project.id,
      name: project.name,
      status: 'Ready',
      deploymentCount: project.deploymentCount,
      updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
      updatedAtIso: project.updatedAt,
      stack: projectStackLabel(project),
      sourceType: project.sourceType,
      previewImageUrl: `/api/projects/${project.id}/thumbnail`,
      ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization.slug }),
    })),
  };
}

export const meta: MetaFunction = () => [{ title: 'Dashboard - E-Code' }];

export default function DashboardPage() {
  const { projects, usageSummary, billingAccessLimited, onboarding } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Dashboard"
      description="Your production workspace hub for E-Code projects, runtime status, usage, billing and team operations."
      actions={
        <>
          <LinkButton to="/projects/new">New project</LinkButton>
          <LinkButton to="/command-palette" variant="outline">
            Command palette
          </LinkButton>
        </>
      }
    >
      <div className="grid gap-6 overflow-x-clip">
        <StatGrid stats={statsFromUsage(usageSummary)} />
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent projects</h2>
              <LinkButton to="/recent-projects" variant="ghost">
                View all
              </LinkButton>
            </div>
            <ProjectGrid projects={projects} />
            <div className="mt-6">
              <OnboardingChecklistCard
                steps={[
                  {
                    key: 'create',
                    title: 'Create your first app',
                    description: onboarding.createdFirstApp
                      ? `${onboarding.projectName ?? 'Your project'} is ready in your workspace.`
                      : 'Describe what you want to build and the E-Code agent scaffolds a real project.',
                    done: onboarding.createdFirstApp,
                    actionLabel: 'Create',
                    to: '/projects/new',
                    glyph: <Sparkles className="h-4 w-4" aria-hidden />,
                  },
                  {
                    key: 'deploy',
                    title: 'Deploy it',
                    description: 'Ship your app to a live URL from the project deployments page.',
                    done: onboarding.deployedFirstApp,
                    actionLabel: 'Deploy',
                    to: onboarding.deployTo,
                    glyph: (
                      <span className="text-[13px] leading-none" aria-hidden>
                        ▲
                      </span>
                    ),
                  },
                  {
                    key: 'invite',
                    title: 'Invite a teammate',
                    description: 'Bring a collaborator into your organization to build together.',
                    done: onboarding.invitedTeammate,
                    actionLabel: 'Invite',
                    to: '/invitations',
                    glyph: <MailPlus className="h-4 w-4" aria-hidden />,
                  },
                ]}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            <CommandPalettePreview projects={projects} />
            <h2 className="text-lg font-semibold">System status</h2>
            <ActivityList
              items={[
                { title: 'Usage checked', detail: 'Backend quotas protected project and AI actions.', icon: Activity },
                {
                  title: billingAccessLimited ? 'Billing access limited' : 'Billing synced',
                  detail: billingAccessLimited
                    ? 'Your role can open the dashboard without billing metrics.'
                    : 'Stripe subscription state is current.',
                  icon: CreditCard,
                },
                { title: 'Workspace ready', detail: 'Runtime quota allows another project session.', icon: Boxes },
                {
                  title: 'Deployment available',
                  detail: 'Production deploy flow is enabled for this plan.',
                  icon: Rocket,
                },
              ]}
            />
          </div>
        </section>
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {importOptions.map((option) => {
            const Icon = option.icon;

            const className =
              'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 hover:bg-bolt-elements-background-depth-3';
            const body = (
              <>
                <Icon className="mb-3 h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
                <h3 className="text-sm font-semibold">{option.title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{option.description}</p>
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
