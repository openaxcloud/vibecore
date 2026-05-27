import type { MetaFunction } from '@remix-run/cloudflare';
import { PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Privacy - E-Code' }];

export default function PrivacyPage() {
  return (
    <PublicShell>
      <Policy
        title="Privacy policy"
        sections={[
          'Project data is used to provide the workspace, AI, deployment and support workflows. Secrets stay server-side.',
          'Use E-code to build lawful software and keep account credentials secure.',
          'Enterprise plans may execute a data processing addendum with subprocessors listed here.',
          'Google Cloud, Stripe, Sentry, email delivery and analytics providers support the service.',
          'Provider keys, secrets, billing identifiers, enterprise exports, retention settings, DPA terms and subprocessors are governed by organization policy.',
        ]}
      />
    </PublicShell>
  );
}

function Policy({ title, sections }: { title: string; sections: string[] }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
      <div className="mt-8 space-y-4 text-sm leading-7 text-bolt-elements-textSecondary">
        {sections.map((section) => (
          <p key={section}>{section}</p>
        ))}
      </div>
    </section>
  );
}
