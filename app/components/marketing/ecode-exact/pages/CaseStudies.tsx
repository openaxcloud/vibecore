import {
  ArrowRight,
  Boxes,
  GitBranch,
  Globe,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';

const ACCENT = '#F26207';
const ACCENT_2 = '#F99D25';

export default function CaseStudies() {
  // Honest, platform-true workflows — describing what E-Code does, not fabricated customers.
  const workflows = [
    {
      icon: Sparkles,
      title: 'Idea to working app',
      body: 'Describe what you want in plain language. The AI Agent scaffolds the project, writes the code, and wires it up in a cloud workspace — no local setup.',
    },
    {
      icon: Zap,
      title: 'Live preview as you build',
      body: 'Every change runs instantly in a sandboxed preview beside the editor, so you see the result the moment the agent finishes a step.',
    },
    {
      icon: GitBranch,
      title: 'Git built in',
      body: 'Connect GitHub or GitLab, commit, branch, and push straight from the IDE. Your work stays version-controlled without context switching.',
    },
    {
      icon: Rocket,
      title: 'Deploy from the editor',
      body: 'Ship to a live URL with the in-IDE Deployments panel. Static sites and full-stack apps go to production without leaving your workspace.',
    },
    {
      icon: Boxes,
      title: 'Reproducible workspaces',
      body: 'Each project runs in its own isolated cloud container with the same toolchain for everyone — no "works on my machine".',
    },
    {
      icon: Workflow,
      title: 'Extend with MCP',
      body: 'Add Model Context Protocol connectors so the agent can reach your databases, APIs, and internal tools while it builds.',
    },
  ];

  // Real product captures served from /ecode-static/assets/product.
  const showcase = [
    {
      src: '/ecode-static/assets/product/ide.png',
      label: 'E-Code Workspace',
      icon: LayoutDashboard,
      span: 'lg:col-span-3',
      glow: 'from-[#F26207]/20 to-[#F99D25]/20',
      alt: 'The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace',
      caption: 'Agent, editor, files and live preview together in one cloud workspace.',
      testid: 'img-case-studies-ide',
    },
    {
      src: '/ecode-static/assets/product/ide-git.png',
      label: 'Git in the IDE',
      icon: GitBranch,
      span: 'lg:col-span-2',
      glow: 'from-[#F99D25]/15 to-[#F26207]/15',
      alt: 'The E-Code source control panel showing commits, branches and diffs inside the editor',
      caption: 'Commit, branch and push without leaving the editor.',
      testid: 'img-case-studies-git',
    },
  ];

  // Capabilities map — concrete, true platform surfaces.
  const capabilities = [
    {
      icon: Globe,
      title: 'Static & full-stack hosting',
      body: 'Publish a marketing page or a full app to a live e-code URL straight from the Deployments panel.',
    },
    {
      icon: Smartphone,
      title: 'Build from anywhere',
      body: 'The workspace runs in the cloud and adapts down to mobile, so you can review and ship from a phone.',
    },
    {
      icon: ShieldCheck,
      title: 'Isolated by default',
      body: 'Every project gets its own sandboxed container, so untrusted code and dependencies stay contained.',
    },
    {
      icon: Terminal,
      title: 'Full terminal access',
      body: 'Run any command in the integrated terminal — install packages, run migrations, inspect logs.',
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary"
      data-testid="page-case-studies"
    >
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden py-16 sm:py-20 md:py-28 px-4">
          <div
            className="absolute inset-0 -z-10 opacity-60 pointer-events-none"
            style={{
              background: 'radial-gradient(60% 50% at 50% 0%, rgba(242,98,7,0.16) 0%, rgba(242,98,7,0) 70%)',
            }}
          />
          <div className="max-w-3xl mx-auto text-center">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium ring-1"
              style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}14`, borderWidth: 1 }}
            >
              <Sparkles className="h-4 w-4" />
              How teams build with E-Code
            </span>
            <h1 className="mt-6 mkt-h1 font-bold tracking-tight" data-testid="heading-case-studies">
              From a prompt to a deployed app
            </h1>
            <p className="mt-5 mkt-lead text-bolt-elements-textSecondary">
              E-Code turns plain-language ideas into real software — the AI Agent writes the code, a live preview runs
              it, Git keeps it versioned, and one click ships it to production. Here is what that looks like in
              practice.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/signup"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
                data-testid="button-case-studies-hero-signup"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md font-medium min-h-[44px] ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
                data-testid="button-case-studies-hero-dashboard"
              >
                Open dashboard
              </a>
            </div>
          </div>
        </section>

        {/* Real product showcase */}
        <section className="py-12 sm:py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-stretch">
              {showcase.map((shot) => {
                const Icon = shot.icon;
                return (
                  <figure key={shot.src} className={`${shot.span} group relative`}>
                    <div
                      className={`absolute -inset-2 bg-gradient-to-r ${shot.glow} blur-2xl rounded-2xl pointer-events-none`}
                    />
                    <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                        <Icon className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                        <span className="mkt-small text-bolt-elements-textSecondary font-medium truncate">
                          {shot.label}
                        </span>
                      </div>
                      <img
                        src={shot.src}
                        alt={shot.alt}
                        width={1440}
                        height={900}
                        loading="lazy"
                        className="block w-full h-auto"
                        data-testid={shot.testid}
                      />
                    </div>
                    <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5" style={{ color: ACCENT }} />
                      <span>{shot.caption}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>

        {/* The workflow */}
        <section className="py-12 sm:py-16 md:py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight">The build loop, end to end</h2>
              <p className="mt-4 mkt-body text-bolt-elements-textSecondary">
                Every project on E-Code follows the same path — describe, preview, version, and deploy — without ever
                leaving the browser.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {workflows.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 transition-all hover:border-[#F26207]/50 hover:shadow-md"
                    data-testid={`card-workflow-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div
                      className="flex items-center justify-center w-11 h-11 rounded-lg mb-4 ring-1"
                      style={{ background: `${ACCENT}1A`, borderColor: `${ACCENT}40` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: ACCENT }} />
                    </div>
                    <h3 className="mkt-h3 font-semibold mb-2">{item.title}</h3>
                    <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Dashboard capture + capabilities */}
        <section className="py-12 sm:py-16 md:py-20 px-4 bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <figure className="group relative order-2 lg:order-1">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Rocket className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                  <span className="mkt-small text-bolt-elements-textSecondary font-medium truncate">Deployments</span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt="The in-IDE Deployments panel where E-Code ships a project to a live production URL"
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-case-studies-deploy"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5" style={{ color: ACCENT }} />
                <span>Ship to a live URL from the in-editor Deployments panel.</span>
              </figcaption>
            </figure>

            <div className="order-1 lg:order-2">
              <h2 className="mkt-h2 font-bold tracking-tight">What you can ship</h2>
              <p className="mt-4 mkt-body text-bolt-elements-textSecondary">
                E-Code is a full cloud development platform — the same surfaces that power the IDE are available to
                every project, from a one-page site to a database-backed app.
              </p>
              <ul className="mt-8 space-y-5">
                {capabilities.map((cap) => {
                  const Icon = cap.icon;
                  return (
                    <li key={cap.title} className="flex items-start gap-4">
                      <div
                        className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ring-1"
                        style={{ background: `${ACCENT}1A`, borderColor: `${ACCENT}40` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: ACCENT }} />
                      </div>
                      <div>
                        <h3 className="mkt-h3 font-semibold">{cap.title}</h3>
                        <p className="mt-1 mkt-body text-bolt-elements-textSecondary leading-relaxed">{cap.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-20 md:py-24 px-4">
          <div
            className="max-w-4xl mx-auto rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden ring-1 ring-[#F26207]/30"
            style={{ background: `linear-gradient(135deg, ${ACCENT}1A, ${ACCENT_2}0D)` }}
          >
            <div
              className="absolute inset-0 -z-10 opacity-70 pointer-events-none"
              style={{
                background: 'radial-gradient(50% 80% at 50% 0%, rgba(242,98,7,0.18) 0%, rgba(242,98,7,0) 70%)',
              }}
            />
            <h2 className="mkt-h2 font-bold tracking-tight">Write your own story</h2>
            <p className="mt-4 mkt-lead text-bolt-elements-textSecondary max-w-2xl mx-auto">
              Start a project, describe what you want, and watch E-Code build it. No setup, no credit card to begin.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/signup"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-md text-white font-medium min-h-[44px] transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
                data-testid="button-case-studies-signup"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-md font-medium min-h-[44px] ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
                data-testid="button-case-studies-dashboard"
              >
                Open dashboard
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
