import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';

export const meta: MetaFunction = () => [{ title: 'Quota exceeded - VibeCore' }];

export default function QuotaExceededPage() {
  return (
    <EnterpriseFormPage
      title="Quota exceeded"
      description="A backend quota check blocked the requested action before cost was incurred."
    >
      <div className="space-y-4">
        <p className="text-sm text-bolt-elements-textSecondary">
          Upgrade the plan or ask an administrator for an audited quota override.
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
