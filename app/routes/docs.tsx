import type { MetaFunction } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { AgentWalkthrough } from '~/components/docs/AgentWalkthrough';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Docs - E-Code' },
  {
    name: 'description',
    content:
      'E-Code product docs: a feature-by-feature walkthrough of the IDE agent — the keystroke you press, what happens behind it, and a UI mockup for each surface.',
  },
  ...socialMetaTags({
    title: 'Docs - E-Code',
    description: 'A feature-by-feature walkthrough of the E-Code IDE agent, with keystrokes and UI mockups.',
  }),
];

export default function DocsRoute() {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="docs">
        <div className="container-responsive py-16 sm:py-24">
          <AgentWalkthrough />
        </div>
      </main>
    </PublicShell>
  );
}
