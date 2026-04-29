import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';

export default function PlanComparisonPage() {
  return (
    <EnterpriseFormPage title="Plan comparison" description="Compare Free, Pro, Team and Enterprise capabilities.">
      <div className="grid gap-2 text-sm text-bolt-elements-textSecondary">
        <p>Free: public templates and small workspaces.</p>
        <p>Pro: private previews, deployments and stronger models.</p>
        <p>Team: collaboration, shared billing and audit logs.</p>
        <p>Enterprise: SSO, SCIM, custom quotas, audit export and private deployment options.</p>
      </div>
    </EnterpriseFormPage>
  );
}
