import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { Globe2, ShieldCheck } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  firstOrganization,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type Domain = { id: string; domain: string; verifiedAt?: string; createdAt?: string };
type Project = { id: string; name: string; description?: string };

export const meta: MetaFunction = () => [{ title: 'Custom domains - VibeCore' }];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const [projectResult, organization] = await Promise.all([
    apiRequest<{ project: Project }>(request, `/projects/${projectId}`),
    firstOrganization(request),
  ]);

  const domains = await apiRequest<{ domains: Domain[] }>(request, `/orgs/${organization.id}/domains`);

  return json({ project: projectResult.project, organization, domains: domains.domains });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: 'Project not found' }, { status: 404 });
  }

  const organization = await firstOrganization(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const domain = String(form.get('domain') ?? '');

  if (intent === 'verify') {
    await apiRequest(request, `/orgs/${organization.id}/domains/${encodeURIComponent(domain)}/verify`, {
      method: 'POST',
    });
  } else {
    await apiRequest(request, `/orgs/${organization.id}/domains`, { method: 'POST', body: JSON.stringify({ domain }) });
  }

  return redirect(`/projects/${projectId}/domains`);
}

export default function ProjectDomainsPage() {
  const { project, domains } = useLoaderData<typeof loader>();

  return (
    <ProjectShell
      projectId={project.id}
      title="Custom domains"
      description="Map project deployments to verified domains with TLS readiness."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ActivityList
          items={
            domains.length
              ? domains.map((item) => ({
                  title: item.domain,
                  detail: item.verifiedAt
                    ? `Verified ${new Date(item.verifiedAt).toLocaleString()}`
                    : 'Pending DNS verification',
                  icon: item.verifiedAt ? ShieldCheck : Globe2,
                }))
              : [{ title: 'No verified domains', detail: 'Add a domain to create a verification token.', icon: Globe2 }]
          }
        />
        <div className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          <Form method="post" className="grid gap-3">
            <input
              className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none"
              name="domain"
              placeholder="app.example.com"
              required
            />
            <Button type="submit">Add domain</Button>
          </Form>
          {domains.map((item) => (
            <Form key={item.id} method="post">
              <input type="hidden" name="intent" value="verify" />
              <input type="hidden" name="domain" value={item.domain} />
              <Button type="submit" variant="outline">
                Verify {item.domain}
              </Button>
            </Form>
          ))}
        </div>
      </div>
    </ProjectShell>
  );
}
