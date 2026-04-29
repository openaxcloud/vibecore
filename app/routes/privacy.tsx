import type { MetaFunction } from '@remix-run/cloudflare';
import { PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Privacy - VibeCore' }];

export default function PrivacyPage() {
  return (
    <PublicShell>
      <Policy
        title="Privacy policy"
        sections={[
          'Workspace metadata is used to operate projects, billing, support and security controls.',
          'Provider keys, secrets and billing identifiers are handled as confidential platform data.',
          'Enterprise exports and retention settings are governed by organization policy.',
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
