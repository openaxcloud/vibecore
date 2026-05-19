import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, Link } from '@remix-run/react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  Gauge,
  Globe2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import {
  SiDocker,
  SiGo,
  SiJavascript,
  SiNodedotjs,
  SiPostgresql,
  SiPython,
  SiReact,
  SiRemix,
  SiRust,
  SiTypescript,
} from 'react-icons/si';
import { PublicShell, LinkButton, TemplateGallery } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [
  { title: 'E-Code - AI-powered enterprise development platform' },
  {
    name: 'description',
    content:
      'Build, run and govern production applications with AI agents, the preserved Bolt IDE, real runtimes, mobile workflows and enterprise controls.',
  },
];

const heroImage = '/assets/hero-image.svg';
const cloudImage = '/assets/hero-image.svg';

const stats = [
  ['Active workspaces', 'Real-time', 'Runtime sessions, ports and preview health.'],
  ['Mobile ready', 'Phone + tablet', 'Responsive IDE panels validated with Playwright.'],
  ['Governance', 'Built in', 'Snapshots, quotas, audit events and security controls.'],
  ['Deploy flow', 'Integrated', 'Preview, logs, domains and production releases.'],
];

const features = [
  {
    icon: Bot,
    title: 'AI agent that works inside the IDE',
    text: 'Generate, edit and validate application code without replacing the preserved Bolt workspace.',
  },
  {
    icon: TerminalSquare,
    title: 'Real terminal and runtime panels',
    text: 'Interactive shell, logs, monitoring, ports and workspace status are wired to backend runtimes.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise governance by default',
    text: 'Role controls, audit trails, environment secrets, snapshots and security scan surfaces.',
  },
  {
    icon: MonitorPlay,
    title: 'Preview-first delivery',
    text: 'Run dev servers, inspect live previews and keep runtime status visible across desktop and mobile.',
  },
  {
    icon: Database,
    title: 'Database and backup workflows',
    text: 'Environment-backed database configuration plus snapshot-based backup and restore flows.',
  },
  {
    icon: Globe2,
    title: 'Ship across devices',
    text: 'Desktop, tablet, mobile browser and Capacitor mobile builds share the same production surface.',
  },
];

const showcases = [
  ['SaaS control plane', 'Billing, organizations, projects, deployments and audit logs in one workspace.'],
  ['AI product sprint', 'Turn a prompt into a typed app with frontend, backend, tests and preview.'],
  ['Internal platform', 'Governed runtime workspaces for teams that need speed and traceability.'],
];

const languageIcons = [
  ['TypeScript', SiTypescript, '#3178C6'],
  ['React', SiReact, '#61DAFB'],
  ['Remix', SiRemix, '#FFFFFF'],
  ['Node.js', SiNodedotjs, '#5FA04E'],
  ['Python', SiPython, '#FACC15'],
  ['PostgreSQL', SiPostgresql, '#60A5FA'],
  ['Docker', SiDocker, '#2496ED'],
  ['JavaScript', SiJavascript, '#F7DF1E'],
  ['Go', SiGo, '#00ADD8'],
  ['Rust', SiRust, '#F97316'],
] as const;

export default function LandingPage() {
  return (
    <PublicShell>
      <section className="vc-home-hero" data-testid="section-hero">
        <img src={cloudImage} alt="" className="vc-home-hero-bg" loading="eager" />
        <div className="vc-public-container vc-home-hero-grid">
          <div className="vc-home-hero-copy">
            <span className="vc-badge">
              <Sparkles className="h-3 w-3" aria-hidden />
              AI-powered enterprise development platform
            </span>
            <h1>Build and deploy production apps in minutes.</h1>
            <p>
              E-Code wraps the Bolt editor with persistent projects, real runtimes, mobile-ready workflows, deployment
              controls and enterprise governance so teams can ship without losing engineering discipline.
            </p>
            <Form method="get" action="/signup" className="vc-home-builder-form" id="builder">
              <label htmlFor="homepage-prompt">Describe the app you want to build</label>
              <div>
                <input
                  id="homepage-prompt"
                  name="prompt"
                  type="text"
                  placeholder="Build a customer portal with auth, billing, admin dashboard and deployment..."
                  data-testid="input-homepage-prompt"
                />
                <button type="submit" data-testid="button-homepage-build">
                  Start building
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </Form>
            <div className="vc-home-hero-actions">
              <LinkButton to="/signup">Get started</LinkButton>
              <LinkButton to="/contact-sales" variant="outline">
                Contact sales
              </LinkButton>
              <Link to="#video-demo" className="vc-home-video-link">
                <Play className="h-4 w-4" aria-hidden />
                Watch platform flow
              </Link>
            </div>
          </div>
          <div className="vc-home-product-frame" aria-label="E-Code IDE preview">
            <div className="vc-home-browser-bar">
              <span />
              <span />
              <span />
              <strong>projects/acme/ide</strong>
            </div>
            <div className="vc-home-ide-preview">
              <aside>
                {['app', 'components', 'routes', 'runtime', 'deploy'].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </aside>
              <main>
                <div className="vc-home-tabs">
                  <span>Agent</span>
                  <span>Editor</span>
                  <span>Preview</span>
                  <span>Terminal</span>
                </div>
                <pre>{`const app = await ecode.build({
  prompt,
  runtime: "managed",
  checks: ["typecheck", "tests", "preview"]
});`}</pre>
                <div className="vc-home-terminal">
                  <TerminalSquare className="h-4 w-4" />
                  <span>Runtime: Running</span>
                  <span>Port 5173</span>
                  <span>Preview active</span>
                </div>
              </main>
            </div>
          </div>
        </div>
      </section>

      <section className="vc-home-stats" aria-label="Platform proof">
        <div className="vc-public-container">
          {stats.map(([label, value, detail]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="vc-home-section" id="product" data-testid="section-product">
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Product</span>
            <h2>Everything expected from a serious cloud IDE, wired for real delivery.</h2>
            <p>
              The homepage design is visual, but the product claims map to actual E-Code surfaces: projects, runtime
              adapters, terminal, preview, security, database, deployment and mobile validation.
            </p>
          </div>
          <div className="vc-home-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <article key={feature.title} className="vc-home-card">
                  <Icon className="h-6 w-6" aria-hidden />
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              );
            })}
          </div>
          <div className="vc-home-section-cta">
            <Link to="/docs#agent-walkthrough" className="vc-home-section-cta-link">
              See every agent panel feature with screenshots &amp; keystrokes{' '}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section className="vc-home-video" id="video-demo" data-testid="section-video-demo">
        <div className="vc-public-container">
          <div className="vc-home-media-card">
            <img src={heroImage} alt="Developer workspace with code editor" loading="lazy" />
            <div>
              <span className="vc-badge">Live platform flow</span>
              <h2>Prompt, inspect, run, preview, deploy.</h2>
              <p>
                E-Code is optimized for the working loop: describe a change, inspect generated files, run the real
                terminal, verify preview output and push a deployable project.
              </p>
              <ul>
                {['AI code generation', 'Real terminal', 'Runtime preview', 'Deployment controls'].map((item) => (
                  <li key={item}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="vc-home-section" id="solutions" data-testid="section-solutions">
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Solutions</span>
            <h2>Built for teams that need speed and accountability.</h2>
          </div>
          <div className="vc-home-showcase-grid">
            {showcases.map(([title, text]) => (
              <article key={title}>
                <Activity className="h-5 w-5" aria-hidden />
                <h3>{title}</h3>
                <p>{text}</p>
                <Link to="/contact-sales">
                  Learn more
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vc-home-section vc-home-templates" data-testid="section-templates">
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Templates</span>
            <h2>Start from production-shaped stacks.</h2>
            <p>Templates open into the existing project flow and preserve the Bolt IDE experience.</p>
          </div>
          <TemplateGallery compact />
        </div>
      </section>

      <section className="vc-home-section" data-testid="section-languages">
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Stacks</span>
            <h2>Any language, any framework, one governed workspace.</h2>
          </div>
          <div className="vc-home-language-grid">
            {languageIcons.map(([name, languageIcon, color]) => {
              const LanguageIcon = languageIcon;

              return (
                <article key={name}>
                  <LanguageIcon className="h-8 w-8" style={{ color }} aria-hidden />
                  <span>{name}</span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="vc-home-cta" data-testid="section-cta">
        <div className="vc-public-container">
          <div>
            <Gauge className="h-8 w-8" aria-hidden />
            <h2>Ready to build with production constraints from day one?</h2>
            <p>Start with AI, keep the IDE, validate the preview and move toward deployment without swapping tools.</p>
          </div>
          <div className="vc-home-cta-actions">
            <LinkButton to="/signup">Start building free</LinkButton>
            <LinkButton to="/contact-sales" variant="outline">
              Contact sales
            </LinkButton>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
