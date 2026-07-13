import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';

export const meta: MetaFunction = () => [{ title: 'Quota exceeded - E-Code' }];

export default function QuotaExceededPage() {
  return (
    <EnterpriseFormPage
      title="Quota exceeded"
      description="Your current plan limit stopped this action before any additional usage was recorded."
    >
      <div className="space-y-4">
        <p className="text-sm text-bolt-elements-textSecondary">
          Upgrade the plan or ask an organization administrator to adjust the limit.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/upgrade"
            className="rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text"
          >
            Upgrade plan
          </Link>
          <Link
            to="/plan-comparison"
            className="rounded-md border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium hover:border-bolt-elements-focus"
          >
            Compare plans
          </Link>
        </div>
      </div>
    </EnterpriseFormPage>
  );
}
