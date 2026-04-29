import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { Activity, Code2, Rocket, TerminalSquare } from 'lucide-react';
import { PublicShell, LinkButton, publicFooterLinks, TemplateGallery } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [
  { title: 'VibeCore - Bolt IDE for production SaaS teams' },
  {
    name: 'description',
    content:
      'Build, run and govern Bolt workspaces with persistent projects, Kubernetes runtimes, billing and enterprise controls.',
  },
];

export default function LandingPage() {
  return (
    <PublicShell>
      <section className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
          <div className="relative min-h-[620px] overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
            <div className="absolute inset-x-4 bottom-4 top-36 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 sm:inset-x-8 sm:bottom-8 lg:top-28">
              <div className="grid h-full grid-cols-[170px_1fr] md:grid-cols-[220px_1fr_300px]">
                <aside className="border-r border-bolt-elements-borderColor p-3">
                  {['app', 'components', 'services', 'packages', 'infra'].map((item) => (
                    <div key={item} className="mb-2 rounded px-2 py-1.5 text-sm text-bolt-elements-textSecondary">
                      {item}
                    </div>
                  ))}
                </aside>
                <div className="grid min-w-0 grid-rows-[44px_1fr_120px]">
                  <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-3 text-sm">
                    <Code2 className="h-4 w-4" aria-hidden />
                    app/routes/projects.$projectId.ide.tsx
                  </div>
                  <div className="p-4 font-mono text-xs leading-6 text-bolt-elements-textSecondary">
                    <p>const runtime = await adapter.startWorkspace(projectId);</p>
                    <p>await runtime.writeFile('app/page.tsx', content);</p>
                    <p>const preview = await runtime.getPreviewUrl(5173);</p>
                    <p>await audit.record(toolCall);</p>
                  </div>
                  <div className="grid grid-cols-2 border-t border-bolt-elements-borderColor">
                    <div className="border-r border-bolt-elements-borderColor p-3 text-sm">
                      <TerminalSquare className="mb-2 h-4 w-4" aria-hidden />
                      Terminal streaming
                    </div>
                    <div className="p-3 text-sm">
                      <Rocket className="mb-2 h-4 w-4" aria-hidden />
                      Preview ready
                    </div>
                  </div>
                </div>
                <aside className="hidden border-l border-bolt-elements-borderColor p-3 md:block">
                  {['Workspace running', 'Quota checked', 'Snapshot ready', 'Deploy enabled'].map((item) => (
                    <div
                      key={item}
                      className="mb-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
                    >
                      {item}
                    </div>
                  ))}
                </aside>
              </div>
            </div>
            <div className="relative z-10 max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
              <p className="mb-4 text-sm font-medium text-bolt-elements-textSecondary">
                Bolt IDE, preserved for production teams
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
                Ship AI-built software from governed cloud workspaces.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-bolt-elements-textSecondary">
                VibeCore wraps the Bolt editor with persistent projects, remote runtimes, billing, quotas, audit
                controls and enterprise identity without removing the IDE engineers already use.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton to="/signup">Start building</LinkButton>
                <LinkButton to="/contact-sales" variant="outline">
                  Contact sales
                </LinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            ['Persistent projects', 'Postgres metadata plus runtime-backed workspace files.'],
            ['Controlled AI', 'Quota checks, tool RBAC, snapshots and cost ledgers.'],
            ['Remote runtimes', 'Kubernetes workspaces behind RuntimeAdapter.'],
            ['Enterprise ready', 'SSO, audit, billing, SCIM and security controls.'],
          ].map(([title, detail]) => (
            <div key={title}>
              <Activity className="mb-3 h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">{detail}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Start from a production template</h2>
            <p className="mt-2 text-sm text-bolt-elements-textSecondary">
              Templates open directly into the Bolt project flow.
            </p>
          </div>
          <Link to="/templates" className="text-sm font-medium hover:underline">
            View all
          </Link>
        </div>
        <TemplateGallery compact />
      </section>
      <footer className="border-t border-bolt-elements-borderColor">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-bolt-elements-textSecondary sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>VibeCore keeps the Bolt IDE intact.</span>
          <nav className="flex flex-wrap gap-4" aria-label="Footer">
            {publicFooterLinks.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-bolt-elements-textPrimary">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </PublicShell>
  );
}
