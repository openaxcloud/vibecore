import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import { TeamAccessLogPanel } from '~/components/teams/TeamAccessLogPanel';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { loadTeamAccessLog, type TeamAccessLogData } from '~/lib/team-access-log.server';

export const meta: MetaFunction = ({ params }) => [
  { title: `Team settings · ${params.id ?? 'Team'} · E-Code` },
  {
    name: 'description',
    content: 'Manage this team and review its security-relevant access log, exportable to CSV or JSON.',
  },
];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  return loadTeamAccessLog(request, params.id ?? 'unknown', `/teams/${params.id ?? 'unknown'}/settings`);
}

export default function TeamSettingsRoute() {
  const data = useLoaderData<typeof loader>() as TeamAccessLogData;

  return (
    <EnterpriseFormPage
      title="Team settings"
      description="Manage this team. The access log below records security-relevant events for the team and can be exported to CSV or JSON."
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary">
          Access log for team <span className="font-mono">{data.teamId}</span>.{' '}
          <Link className="underline hover:text-bolt-elements-textPrimary" to={`/teams/${data.teamId}`}>
            Open the full team access log
          </Link>
          .
        </div>
        <TeamAccessLogPanel {...data} />
      </div>
    </EnterpriseFormPage>
  );
}
