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
  { title: 'E-Code - Native cloud IDE for AI software teams' },
  {
    name: 'description',
    content:
      'E-Code combines a VS Code-class cloud IDE, AI agents, Cloud Run deployment, and native mobile workflows on Google Cloud.',
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
    anchor: 'ai-platform',
    icon: Bot,
    title: 'AI agent that works inside the IDE',
    text: 'Generate, edit and validate application code without replacing the preserved Bolt workspace.',
  },
  {
    anchor: 'runtime',
    icon: TerminalSquare,
    title: 'Real terminal and runtime panels',
    text: 'Interactive shell, logs, monitoring, ports and workspace status are wired to backend runtimes.',
  },
  {
    anchor: 'collaboration',
    icon: ShieldCheck,
    title: 'Enterprise governance by default',
    text: 'Role controls, audit trails, environment secrets, snapshots and security scan surfaces.',
  },
  {
    anchor: 'preview',
    icon: MonitorPlay,
    title: 'Preview-first delivery',
    text: 'Run dev servers, inspect live previews and keep runtime status visible across desktop and mobile.',
  },
  {
    anchor: 'database',
    icon: Database,
    title: 'Database and backup workflows',
    text: 'Environment-backed database configuration plus snapshot-based backup and restore flows.',
  },
  {
    anchor: 'mobile',
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

const partnerLogos = [
  ['OpenAI', '/partners/openai.svg'],
  ['GitHub', '/partners/github.svg'],
  ['Docker', '/partners/docker.svg'],
  ['Vercel', '/partners/vercel.svg'],
  ['Cloudflare', '/partners/cloudflare.svg'],
  ['Stripe', '/partners/stripe.svg'],
  ['MongoDB', '/partners/mongodb.svg'],
  ['Redis', '/partners/redis.svg'],
  ['Google', '/partners/google.svg'],
  ['Microsoft', '/partners/microsoft.svg'],
  ['Amazon', '/partners/amazon.svg'],
  ['Firebase', '/partners/firebase.svg'],
] as const;

const sourceComparisonRows = [
  ['Runtime', 'Cloud Run with gVisor and GCS-backed files', 'Mixed proprietary runtimes'],
  ['Agents', 'Plan, act, observe, commit, deploy', 'Editor-only or generation-only'],
  ['Mobile', 'Native iOS and Android workflows', 'Usually web-first'],
] as const;

const comparisonPlatforms = [
  [
    'compare-github-codespaces',
    'GitHub Codespaces',
    '/assets/compare/github-codespaces.svg',
    'Repository-native cloud workspaces without E-Code agent orchestration and governed release flow.',
  ],
  [
    'compare-glitch',
    'Glitch',
    '/assets/compare/glitch.svg',
    'Creative prototyping compared with production runtimes, previews, snapshots and enterprise controls.',
  ],
  [
    'compare-heroku',
    'Heroku',
    '/assets/compare/heroku.svg',
    'Application hosting compared with an AI IDE, real terminal workflow and deployment guardrails.',
  ],
  [
    'compare-codesandbox',
    'CodeSandbox',
    '/assets/compare/codesandbox.svg',
    'Browser sandboxes compared with persistent projects, collaboration and controlled runtime adapters.',
  ],
  [
    'compare-aws-cloud9',
    'AWS Cloud9',
    '/assets/compare/aws-cloud9.svg',
    'Cloud IDE infrastructure compared with E-Code mobile-ready AI delivery loops.',
  ],
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
            <h1>E-Code</h1>
            <p>
              The GCP-native workspace where teams create, run, review, and deploy real applications with AI agents and
              production controls. Build, run, collaborate, and deploy production apps with AI agents.
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
              <Link to="#deploy" className="vc-home-video-link">
                <Play className="h-4 w-4" aria-hidden />
                Watch platform flow
              </Link>
            </div>
          </div>
          <div className="vc-home-product-frame" aria-label="E-Code IDE preview">
            <img src="/assets/ai-avatar.svg" alt="" className="vc-home-agent-avatar" loading="eager" decoding="async" />
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

      <section className="vc-home-stats" id="proof" aria-label="Platform proof">
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

      <section className="vc-home-partners" id="partners" aria-label="E-Code partner ecosystem">
        <div className="vc-public-container">
          <div className="vc-home-partners-copy">
            <span className="vc-badge">Ecosystem</span>
            <p>Imported from the E-Code partner system and adapted to this marketing surface.</p>
          </div>
          <div className="vc-home-partner-grid">
            {partnerLogos.map(([name, src]) => (
              <article key={name}>
                <img src={src} alt={`${name} logo`} loading="lazy" decoding="async" />
                <span>{name}</span>
              </article>
            ))}
          </div>
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
                <article key={feature.title} id={feature.anchor} className="vc-home-card">
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

      <section className="vc-home-video" id="deploy" data-testid="section-video-demo">
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

      <section
        className="vc-home-section vc-home-source-compare"
        id="compare-replit-cursor-lovable"
        data-testid="section-source-compare"
      >
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Source comparison</span>
            <h2>Compared with Replit, Cursor and Lovable</h2>
            <p>
              Imported from the E-Code source marketing page and adapted into the Vibecore public shell. Privacy-first
              analytics. Google Cloud native.
            </p>
          </div>
          <div className="vc-home-source-compare-table" role="region" aria-label="E-Code source comparison table">
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>E-Code</th>
                  <th>Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {sourceComparisonRows.map(([capability, ecode, alternatives]) => (
                  <tr key={capability}>
                    <td>{capability}</td>
                    <td>{ecode}</td>
                    <td>{alternatives}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="vc-home-section vc-home-compare" id="compare" data-testid="section-compare">
        <div className="vc-public-container">
          <div className="vc-home-section-head">
            <span className="vc-badge">Compare</span>
            <h2>E-Code comparison assets are now part of the marketing surface.</h2>
            <p>
              The cards below preserve the E-Code competitor logo set while routing to local anchors instead of missing
              pages.
            </p>
          </div>
          <div className="vc-home-compare-grid">
            {comparisonPlatforms.map(([id, name, src, text]) => (
              <article key={id} id={id}>
                <img src={src} alt={`${name} logo`} loading="lazy" decoding="async" />
                <div>
                  <span>E-Code vs</span>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </div>
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
