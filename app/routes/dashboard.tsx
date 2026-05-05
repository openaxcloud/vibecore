import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Activity, Boxes, CreditCard, Rocket } from 'lucide-react';
import {
  ActivityList,
  AppShell,
  CommandPalettePreview,
  ProjectGrid,
  StatGrid,
  importOptions,
  LinkButton,
  statsFromUsage,
  type ProjectCard,
} from '~/components/dashboard/SaaSLayout';
import { apiRequest, isForbiddenApiResponse, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type Organization = { id: string };
type ApiProject = { id: string; name: string; updatedAt?: string; sourceType?: string; gitRepositoryUrl?: string };
type BillingState = {
  plan: { name: string };
  usage: Array<{ type: string; quantity: number }>;
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return {
      usageSummary: { projects: 0, activeWorkspaces: 0, planName: 'Free', usageEvents: 0, aiCostCents: 0 },
      billingAccessLimited: false,
      projects: [] satisfies ProjectCard[],
    };
  }

  const [result, billingResult] = await Promise.all([
    apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`),
    optionalBillingRequest(request, organization.id),
  ]);
  const { billing, billingAccessLimited } = billingResult;

  return {
    usageSummary: {
      projects: result.projects.length,
      activeWorkspaces: billing.usage
        .filter((event) => event.type === 'workspaces.active')
        .reduce((sum, event) => sum + event.quantity, 0),
      planName: billing.plan.name,
      usageEvents: billing.usage.length,
      aiCostCents: 0,
    },
    billingAccessLimited,
    projects: result.projects.slice(0, 6).map((project) => ({
      id: project.id,
      name: project.name,
      status: 'Ready',
      updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
      stack: project.gitRepositoryUrl ?? project.sourceType ?? 'Bolt project',
      sourceType: project.sourceType,
      previewImageUrl: `/api/projects/${project.id}/homepage-preview`,
    })),
  };
}

export const meta: MetaFunction = () => [{ title: 'Dashboard - VibeCore' }];

export default function DashboardPage() {
  const { projects, usageSummary, billingAccessLimited } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Dashboard"
      description="Your production workspace hub for Bolt projects, runtime status, usage, billing and team operations."
      actions={
        <>
          <LinkButton to="/projects/new">New project</LinkButton>
          <LinkButton to="/command-palette" variant="outline">
            Command palette
          </LinkButton>
        </>
      }
    >
      <div className="grid gap-6">
        <StatGrid stats={statsFromUsage(usageSummary)} />
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent projects</h2>
              <LinkButton to="/recent-projects" variant="ghost">
                View all
              </LinkButton>
            </div>
            <ProjectGrid projects={projects} />
          </div>
          <div className="space-y-6">
            <CommandPalettePreview />
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
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {importOptions.map((option) => {
            const Icon = option.icon;
            return (
              <a
                key={option.title}
                href={option.to}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 hover:bg-bolt-elements-background-depth-3"
              >
                <Icon className="mb-3 h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
                <h3 className="text-sm font-semibold">{option.title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{option.description}</p>
              </a>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
