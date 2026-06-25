import {
  Smartphone,
  Code2,
  Sparkles,
  Globe,
  Rocket,
  GitBranch,
  Check,
  ArrowRight,
  Wifi,
  Eye,
  Layers,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SiReact, SiTypescript, SiPython, SiVite, SiNodedotjs, SiTailwindcss } from 'react-icons/si';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  useMarketingNavigate,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  AUTO_CYCLE_INTERVAL_MS,
  AUTO_CYCLE_RESUME_DELAY_MS,
  nextFeatureIndex,
  shouldAutoCycle,
} from '~/components/marketing/ecode-exact/pages/mobile-auto-cycle';

const PRODUCT_MOBILE_SHOT = '/ecode-static/assets/product/mobile.png';

/**
 * A real photo-frame phone mockup that renders an actual product screenshot.
 * `mobile.png` is the live E-Code app captured at a 390px viewport, so we frame
 * it 1:1 inside a device chassis — no fabricated UI.
 */
function PhoneMockup({
  src,
  alt,
  className = '',
  loading = 'lazy',
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  return (
    <div
      className={`relative mx-auto w-[260px] sm:w-[300px] ${className}`}
      style={{ aspectRatio: '390 / 844' }}
      data-testid="phone-mockup"
    >
      {/* Chassis */}
      <div className="absolute inset-0 rounded-[2.6rem] bg-gradient-to-b from-zinc-800 to-zinc-900 p-[10px] shadow-2xl ring-1 ring-white/10">
        {/* Screen bezel */}
        <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-black ring-1 ring-black/60">
          {/* Notch */}
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
          <img
            src={src}
            alt={alt}
            loading={loading}
            className="h-full w-full object-cover object-top"
            draggable={false}
          />
        </div>
      </div>
      {/* Side buttons */}
      <div className="absolute -left-[2px] top-[110px] h-10 w-[3px] rounded-l bg-zinc-700" />
      <div className="absolute -left-[2px] top-[150px] h-16 w-[3px] rounded-l bg-zinc-700" />
      <div className="absolute -right-[2px] top-[130px] h-20 w-[3px] rounded-r bg-zinc-700" />
    </div>
  );
}

export default function Mobile() {
  const navigate = useMarketingNavigate();

  // Real platform capabilities, each true to what the live E-Code IDE does.
  const highlights = [
    {
      id: 'anywhere',
      icon: <Code2 className="h-5 w-5" />,
      title: 'Code from anywhere',
      description:
        'Open any project in the mobile browser and pick up exactly where you left off. The full workspace — files, editor, and terminal — runs in the cloud, so nothing depends on the device in your hand.',
    },
    {
      id: 'agent',
      icon: <Sparkles className="h-5 w-5" />,
      title: 'The agent on mobile',
      description:
        'Describe a change in plain language and the E-Code agent edits your code, runs commands, and proposes diffs you can review and accept — the same agent panel you use on the desktop, sized for a phone.',
    },
    {
      id: 'preview',
      icon: <Globe className="h-5 w-5" />,
      title: 'Live preview on your phone',
      description:
        'Every workspace serves a live preview URL. Watch your app hot-reload as the agent works, and test real touch interactions on the actual device your users hold.',
    },
    {
      id: 'deploy',
      icon: <Rocket className="h-5 w-5" />,
      title: 'Push to deploy',
      description:
        'Commit from the built-in Git panel and publish from the Deployments tab. Ship a fix from the train and share the live link before you reach your stop.',
    },
  ];

  const highlightCount = highlights.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoCycling, setIsAutoCycling] = useState(true);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeHighlight = highlights[activeIndex] ?? highlights[0];

  const pauseAutoCycle = () => {
    setIsAutoCycling(false);

    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }

    resumeTimeoutRef.current = setTimeout(() => setIsAutoCycling(true), AUTO_CYCLE_RESUME_DELAY_MS);
  };

  const selectHighlight = (index: number) => {
    pauseAutoCycle();
    setActiveIndex(index);
  };

  useEffect(() => {
    if (!shouldAutoCycle(isAutoCycling, highlightCount)) {
      return undefined;
    }

    const interval = setInterval(() => {
      setActiveIndex((prev) => nextFeatureIndex(prev, highlightCount));
    }, AUTO_CYCLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [highlightCount, isAutoCycling]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
    };
  }, []);

  // Real capabilities that genuinely carry over to the mobile experience.
  const capabilities = [
    {
      icon: <Eye className="h-5 w-5" />,
      title: 'Touch-first preview',
      description: 'Interact with your running app exactly as your users will, on the device they actually use.',
    },
    {
      icon: <GitBranch className="h-5 w-5" />,
      title: 'Git in your pocket',
      description: 'Branch, stage, commit, and view the working tree from the same Git panel as the desktop IDE.',
    },
    {
      icon: <Wifi className="h-5 w-5" />,
      title: 'Cloud workspaces',
      description: 'Your environment lives in the cloud, so a phone, tablet, and laptop all open the same session.',
    },
    {
      icon: <Layers className="h-5 w-5" />,
      title: 'Real multi-file projects',
      description: 'Navigate full codebases — not a single scratch file — with the file tree and editor side by side.',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Secure by default',
      description: 'Workspaces are isolated and your code stays in your account, on every device you sign in from.',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Instant resume',
      description: 'Reopen a project and the agent, files, and preview restore in seconds — no local setup.',
    },
  ];

  // Real stacks E-Code workspaces run — title-matched logos, never bare squares.
  const stacks = [
    { icon: <SiReact className="h-5 w-5" />, name: 'React' },
    { icon: <SiTypescript className="h-5 w-5" />, name: 'TypeScript' },
    { icon: <SiNodedotjs className="h-5 w-5" />, name: 'Node.js' },
    { icon: <SiPython className="h-5 w-5" />, name: 'Python' },
    { icon: <SiVite className="h-5 w-5" />, name: 'Vite' },
    { icon: <SiTailwindcss className="h-5 w-5" />, name: 'Tailwind' },
  ];

  const flow = [
    { step: '01', title: 'Open your workspace', description: 'Sign in and resume any project from the dashboard.' },
    { step: '02', title: 'Prompt the agent', description: 'Ask for a feature or fix; review the proposed diff.' },
    { step: '03', title: 'Preview live', description: 'Watch the change hot-reload in the on-device preview.' },
    { step: '04', title: 'Commit & publish', description: 'Commit from the Git panel, then deploy in a tap.' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="page-mobile">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgba(242,98,7,0.18),transparent_55%)]" />
          <div className="container-responsive relative py-responsive">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-accent)]/30 bg-[var(--ecode-accent)]/10 px-4 py-1.5">
                  <Smartphone className="h-4 w-4 text-[var(--ecode-accent)]" />
                  <span className="text-[13px] font-medium text-[var(--ecode-accent)]">
                    Runs in your mobile browser
                  </span>
                </div>

                <h1 className="mt-6 mkt-h1 font-bold leading-tight" data-testid="heading-mobile">
                  Your whole IDE,
                  <span className="block bg-gradient-to-r from-[#F26207] to-[#F99D25] bg-clip-text text-transparent">
                    in your pocket
                  </span>
                </h1>

                <p className="mx-auto mt-6 max-w-xl mkt-lead text-muted-foreground lg:mx-0">
                  E-Code is a cloud development platform — so the editor, agent, terminal, live preview, and deploy you
                  use on the desktop all open on your phone. No app to install, nothing to set up.
                </p>

                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                  <Button
                    size="lg"
                    onClick={() => navigate('/signup')}
                    className="gap-2 bg-ecode-accent text-white hover:bg-ecode-accent-hover"
                    data-testid="button-mobile-hero-start"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    data-testid="button-mobile-hero-dashboard"
                  >
                    Open dashboard
                  </Button>
                </div>
              </div>

              <div className="relative">
                <PhoneMockup src={PRODUCT_MOBILE_SHOT} alt="E-Code workspace dashboard on a phone" loading="eager" />
              </div>
            </div>
          </div>
        </section>

        {/* Highlights: real capability tour driven by the real screenshot */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="mkt-h2 font-bold">
                Everything you build with, <span className="text-[var(--ecode-accent)]">on the go</span>
              </h2>
              <p className="mt-4 mkt-body text-muted-foreground">
                The same platform — not a stripped-down companion app. Here is what carries straight over to mobile.
              </p>
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="order-2 lg:order-1 space-y-3">
                {highlights.map((highlight, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={highlight.id}
                      type="button"
                      onClick={() => selectHighlight(index)}
                      className={`flex w-full items-start gap-4 rounded-xl border p-5 text-left transition-colors ${
                        isActive
                          ? 'border-[var(--ecode-accent)]/40 bg-[var(--ecode-accent)]/5'
                          : 'border-border bg-surface-solid hover:bg-surface-hover-solid'
                      }`}
                      data-testid={`highlight-${highlight.id}`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                          isActive ? 'bg-ecode-accent text-white' : 'bg-muted text-[var(--ecode-accent)]'
                        }`}
                      >
                        {highlight.icon}
                      </span>
                      <span>
                        <span className="block mkt-h3 font-semibold">{highlight.title}</span>
                        <span className="mt-1 block mkt-small text-muted-foreground">{highlight.description}</span>
                      </span>
                    </button>
                  );
                })}

                <div className="flex justify-center gap-2 pt-2 lg:justify-start">
                  {highlights.map((highlight, index) => (
                    <button
                      key={highlight.id}
                      type="button"
                      onClick={() => selectHighlight(index)}
                      aria-label={`Show ${highlight.title}`}
                      className={`h-2 rounded-full transition-all ${
                        index === activeIndex
                          ? 'w-8 bg-ecode-accent'
                          : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative order-1 lg:order-2">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(242,98,7,0.16),transparent_60%)]" />
                <PhoneMockup src={PRODUCT_MOBILE_SHOT} alt={`E-Code on mobile — ${activeHighlight.title}`} />
                <div className="mt-6 text-center">
                  <Badge variant="secondary" className="inline-flex items-center gap-2">
                    {activeHighlight.icon}
                    {activeHighlight.title}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stacks */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="mkt-h2 font-bold">Bring any stack</h2>
            <p className="mx-auto mt-4 max-w-2xl mkt-body text-muted-foreground">
              Mobile workspaces run the same cloud runtime as the desktop — the frameworks and languages you already
              ship.
            </p>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
              {stacks.map((stack) => (
                <div
                  key={stack.name}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-solid px-4 py-2 text-[13px] font-medium"
                >
                  <span className="text-[var(--ecode-accent)]">{stack.icon}</span>
                  {stack.name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="mkt-h2 font-bold">
                Professional development, <span className="text-[var(--ecode-accent)]">pocket-sized</span>
              </h2>
              <p className="mt-4 mkt-body text-muted-foreground">
                No compromises — the capabilities you rely on are present on every screen size.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <Card key={capability.title} className="group transition-all hover:shadow-xl">
                  <CardContent className="pt-6">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)] transition-transform group-hover:scale-110">
                      {capability.icon}
                    </div>
                    <h3 className="mb-2 mkt-h3 font-semibold">{capability.title}</h3>
                    <p className="mkt-small text-muted-foreground">{capability.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Flow */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="mkt-h2 font-bold">
                From idea to live, <span className="text-[var(--ecode-accent)]">without a laptop</span>
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {flow.map((item) => (
                <div key={item.step} className="rounded-xl border border-border bg-surface-solid p-6">
                  <span className="mkt-small font-mono font-semibold text-[var(--ecode-accent)]">{item.step}</span>
                  <h3 className="mt-3 mkt-h3 font-semibold">{item.title}</h3>
                  <p className="mt-2 mkt-small text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why mobile */}
        <section className="py-responsive">
          <div className="container-responsive max-w-5xl">
            <div className="mb-12 text-center">
              <h2 className="mkt-h2 font-bold">
                Why coding on <span className="text-[var(--ecode-accent)]">E-Code mobile</span> is different
              </h2>
            </div>
            <div className="grid gap-8 rounded-2xl border border-border bg-muted p-8 md:grid-cols-2">
              <div>
                <h3 className="mb-6 mkt-h3 font-bold text-muted-foreground">A typical mobile code editor</h3>
                <ul className="space-y-4">
                  {[
                    'A single file, no real project structure',
                    'No terminal or package installs',
                    'No live preview of a running app',
                    'No way to deploy what you wrote',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/15 text-[13px] text-muted-foreground">
                        ×
                      </span>
                      <span className="mkt-small text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-6 mkt-h3 font-bold text-[var(--ecode-accent)]">E-Code mobile</h3>
                <ul className="space-y-4">
                  {[
                    'Full multi-file workspaces in the cloud',
                    'Real terminal and the coding agent',
                    'Live preview you can touch and test',
                    'Commit with Git and deploy in a tap',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ecode-accent)]/15">
                        <Check className="h-4 w-4 text-[var(--ecode-accent)]" />
                      </span>
                      <span className="mkt-small">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* End CTA */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive max-w-3xl text-center">
            <h2 className="mkt-h2 font-bold">Ready to build from anywhere?</h2>
            <p className="mx-auto mt-4 max-w-xl mkt-lead text-muted-foreground">
              Open E-Code in your mobile browser and start a workspace in seconds — the same projects, agent, and
              previews follow you across every device.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="gap-2 bg-ecode-accent text-white hover:bg-ecode-accent-hover"
                data-testid="button-mobile-cta-start"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/dashboard')}
                data-testid="button-mobile-cta-dashboard"
              >
                Open dashboard
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
