import {
  Newspaper,
  Mail,
  Image as ImageIcon,
  Palette,
  BookOpen,
  Camera,
  Bot,
  Cloud,
  GitBranch,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { SiReact, SiTypescript, SiVite, SiNodedotjs } from 'react-icons/si';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { PRESS_CONTACT_EMAIL, PRESS_CONTACT_MAILTO } from '~/components/marketing/ecode-exact/pages/press-contact';

const ACCENT = 'var(--ecode-accent)';

export default function Press() {
  const brandAssets = [
    {
      name: 'Logo Mark',
      desc: 'The E-Code symbol for avatars, favicons, and app icons.',
      format: 'SVG · PNG',
      icon: ImageIcon,
    },
    {
      name: 'Wordmark',
      desc: 'Full "E-Code" lockup for headers and partner pages.',
      format: 'SVG · PNG',
      icon: Newspaper,
    },
    {
      name: 'Color & Type',
      desc: 'Accent orange #F26207 and the IBM Plex type system.',
      format: 'PDF · ASE',
      icon: Palette,
    },
    {
      name: 'Brand Guidelines',
      desc: 'Clear-space, do/don’t, and usage rules for the logo.',
      format: 'PDF',
      icon: BookOpen,
    },
  ];

  /*
   * Honest, capability-true facts about what E-Code is — no invented dates,
   * funding rounds, headcount, or coverage.
   */
  const platformFacts = [
    {
      label: 'Category',
      value: 'AI development platform',
      icon: Bot,
    },
    {
      label: 'Runtime',
      value: 'Cloud IDE & live workspace',
      icon: Cloud,
    },
    {
      label: 'Workflow',
      value: 'Prompt → build → deploy',
      icon: GitBranch,
    },
    {
      label: 'Reach',
      value: 'Web & mobile',
      icon: Smartphone,
    },
  ];

  /*
   * What E-Code actually does — accurate story angles a journalist can verify
   * in the product, not fabricated press hits.
   */
  const storyAngles = [
    {
      icon: Bot,
      title: 'Autonomous multi-agent builds',
      body: 'Describe an app in plain language and watch agents plan, write, run, and fix code in a real workspace — with every step streamed live.',
    },
    {
      icon: Cloud,
      title: 'A full dev environment in the cloud',
      body: 'Each project gets a sandboxed container with an editor, terminal, package manager, and live preview — no local setup required.',
    },
    {
      icon: GitBranch,
      title: 'From idea to deployed in one flow',
      body: 'Connect a Git provider, commit from the IDE, and ship to a live URL with one-click deploys — all without leaving the browser.',
    },
  ];

  const productShots = [
    { src: '/ecode-static/assets/product/ide.png', label: 'AI agent and live cloud IDE' },
    { src: '/ecode-static/assets/product/ide-git.png', label: 'Integrated Git workflow' },
    { src: '/ecode-static/assets/product/ide-deploy.png', label: 'One-click deploys' },
    { src: '/ecode-static/assets/product/dashboard.png', label: 'Project dashboard' },
  ];

  const techStack = [
    { name: 'React', icon: SiReact },
    { name: 'TypeScript', icon: SiTypescript },
    { name: 'Vite', icon: SiVite },
    { name: 'Node.js', icon: SiNodedotjs },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-press">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span
                className="inline-flex h-14 w-14 items-center justify-center rounded-xl mb-5"
                style={{ backgroundColor: ACCENT }}
              >
                <Newspaper className="h-7 w-7 text-white" />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-press">
                Press &amp; Media
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Everything you need to tell the E-Code story — brand assets, real product captures, and the facts about
                what the platform does.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Press Kit
              </Badge>
            </div>
          </div>
        </section>

        {/* Press Contact */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 text-center sm:text-left">
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Mail className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <h3 className="mkt-h3 font-semibold">Media inquiries</h3>
                      <p className="mkt-small text-muted-foreground">
                        Reach our press team for interviews, quotes, and assets
                      </p>
                    </div>
                  </div>
                  <a
                    href={PRESS_CONTACT_MAILTO}
                    className="px-6 py-3 rounded-md text-white min-h-[44px] inline-flex items-center font-medium"
                    style={{ backgroundColor: ACCENT }}
                    data-testid="link-press-contact"
                  >
                    {PRESS_CONTACT_EMAIL}
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Product Screenshots */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                style={{ backgroundColor: ACCENT }}
              >
                <Camera className="h-5 w-5 text-white" />
              </span>
              <h2 className="mkt-h2 font-bold mb-4">Product Screenshots</h2>
              <p className="mkt-body text-muted-foreground">
                Real captures of the E-Code platform — free to use in coverage. Please credit &ldquo;E-Code&rdquo;.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {productShots.map((shot) => (
                <figure
                  key={shot.src}
                  className="rounded-xl overflow-hidden border border-border bg-background shadow-sm"
                >
                  <img
                    src={shot.src}
                    alt={shot.label}
                    loading="lazy"
                    className="w-full aspect-video object-cover object-top"
                  />
                  <figcaption className="px-4 py-3 mkt-small text-muted-foreground border-t border-border">
                    {shot.label}
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="max-w-5xl mx-auto mt-6">
              <figure className="rounded-xl overflow-hidden border border-border bg-background shadow-sm max-w-xs mx-auto">
                <img
                  src="/ecode-static/assets/product/mobile.png"
                  alt="E-Code on mobile"
                  loading="lazy"
                  className="w-full object-cover object-top"
                />
                <figcaption className="px-4 py-3 mkt-small text-muted-foreground border-t border-border text-center">
                  E-Code on mobile
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* Brand Assets */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">Brand Assets &amp; Logos</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              The official E-Code brand system. Please follow our guidelines when using these — keep the orange accent
              and IBM Plex type intact, and never recolor the mark.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {brandAssets.map((asset) => {
                const Icon = asset.icon;
                return (
                  <Card key={asset.name} className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-center h-24 mb-4 rounded-md bg-muted border border-border">
                        <Icon className="h-9 w-9" style={{ color: ACCENT }} />
                      </div>
                      <h3 className="mkt-h3 font-semibold mb-1">{asset.name}</h3>
                      <p className="mkt-small text-muted-foreground mb-3">{asset.desc}</p>
                      <span className="mkt-small font-medium text-muted-foreground">{asset.format}</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Story Angles */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">Story Angles</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              What makes E-Code worth covering — every angle below is something you can see for yourself in the product.
            </p>

            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {storyAngles.map((angle) => {
                const Icon = angle.icon;
                return (
                  <Card key={angle.title} className="h-full">
                    <CardContent className="p-6">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{angle.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{angle.body}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Platform Facts */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">Platform Facts</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {platformFacts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <Card key={fact.label}>
                    <CardContent className="pt-6 text-center">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg mx-auto mb-4"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </span>
                      <h3 className="mkt-small text-muted-foreground mb-1">{fact.label}</h3>
                      <p className="font-semibold">{fact.value}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="max-w-3xl mx-auto mt-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Bot className="h-4 w-4 text-white" />
                    </span>
                    About E-Code
                  </CardTitle>
                  <CardDescription>
                    The AI development platform that turns a prompt into a deployed application
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mkt-body text-muted-foreground leading-relaxed">
                    E-Code is an AI-native development platform where anyone can describe an idea in plain language and
                    watch autonomous agents plan, build, run, and deploy a full-stack application in a live cloud IDE.
                    By combining multi-agent reasoning with a real workspace, terminal, and one-click deploys, E-Code
                    closes the gap between intent and shipped software.
                  </p>
                  <div className="mt-6 pt-6 border-t border-border">
                    <p className="mkt-small font-medium text-muted-foreground uppercase tracking-wide mb-3">Built on</p>
                    <div className="flex flex-wrap gap-3">
                      {techStack.map((tech) => {
                        const Icon = tech.icon;
                        return (
                          <span
                            key={tech.name}
                            className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-[13px] font-medium"
                          >
                            <Icon className="h-4 w-4" style={{ color: ACCENT }} />
                            {tech.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div
              className="max-w-5xl mx-auto rounded-2xl px-8 py-12 text-center"
              style={{
                background: `linear-gradient(135deg, ${ACCENT} 0%, var(--ecode-accent-2, #F99D25) 100%)`,
              }}
            >
              <h2 className="mkt-h2 font-bold text-white mb-3">See E-Code for yourself</h2>
              <p className="text-white/90 mkt-lead max-w-2xl mx-auto mb-8">
                The fastest way to understand the story is to build something. Spin up a project and ship it in minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 rounded-md bg-white font-semibold text-[15px]"
                  style={{ color: ACCENT }}
                  data-testid="cta-press-signup"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={PRESS_CONTACT_MAILTO}
                  className="inline-flex items-center justify-center min-h-[48px] px-7 rounded-md border border-white/70 text-white font-semibold text-[15px] hover:bg-white/10 transition-colors"
                >
                  Contact press team
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
