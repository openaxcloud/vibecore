import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import { TeamAccessLogPanel } from '~/components/teams/TeamAccessLogPanel';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { loadTeamAccessLog, type TeamAccessLogData } from '~/lib/team-access-log.server';

export const meta: MetaFunction = ({ params }) => [
  { title: `Team access log · ${params.id ?? 'Team'} · E-Code` },
  {
    name: 'description',
    content: 'Review and export security-relevant access events for this team to CSV or JSON.',
  },
];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  return loadTeamAccessLog(request, params.id ?? 'unknown', `/teams/${params.id ?? 'unknown'}`);
}

export default function TeamAccessLogRoute() {
  const data = useLoaderData<typeof loader>() as TeamAccessLogData;

  return (
    <EnterpriseFormPage
      title="Team access log"
      description="Review and export security-relevant access events for this team. Filter by action, and download the full trail as CSV or JSON."
    >
      <div className="flex flex-col gap-6">
        <TeamAccessLogPanel {...data} />
        <p className="text-xs text-bolt-elements-textSecondary">
          <Link className="underline hover:text-bolt-elements-textPrimary" to={`/teams/${data.teamId}/settings`}>
            Open team settings
          </Link>
        </p>
      </div>
    </EnterpriseFormPage>
  );
}
