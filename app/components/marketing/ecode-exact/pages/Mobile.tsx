import type { LucideIcon } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
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
import {
  getMarketingExactProductCopy,
  type ExactMobileCapabilityId,
  type ExactMobileHighlightId,
} from '~/lib/i18n/catalogs/marketing-exact-product';

const PRODUCT_MOBILE_SHOT = '/ecode-static/assets/product/mobile.png';

const HIGHLIGHT_ICONS: Record<ExactMobileHighlightId, LucideIcon> = {
  anywhere: Code2,
  agent: Sparkles,
  preview: Globe,
  deploy: Rocket,
};

const CAPABILITY_ICONS: Record<ExactMobileCapabilityId, LucideIcon> = {
  touch: Eye,
  git: GitBranch,
  cloud: Wifi,
  projects: Layers,
  security: ShieldCheck,
  resume: Zap,
};

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
  const { i18n } = useTranslation();
  const copy = getMarketingExactProductCopy(i18n.resolvedLanguage ?? i18n.language).exactProduct.mobile;
  const navigate = useMarketingNavigate();

  // Real platform capabilities, each true to what the live E-Code IDE does.
  const highlights = copy.highlights.map((highlight) => {
    const Icon = HIGHLIGHT_ICONS[highlight.id];

    return { ...highlight, icon: <Icon className="h-5 w-5" /> };
  });

  const highlightCount = highlights.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoCycling, setIsAutoCycling] = useState(true);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeHighlight = highlights[activeIndex] ?? highlights[0]!;

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
  const capabilities = copy.capabilities.map((capability) => {
    const Icon = CAPABILITY_ICONS[capability.id];

    return { ...capability, icon: <Icon className="h-5 w-5" /> };
  });

  // Real stacks E-Code workspaces run — title-matched logos, never bare squares.
  const stacks = [
    { icon: <SiReact className="h-5 w-5" />, name: 'React' },
    { icon: <SiTypescript className="h-5 w-5" />, name: 'TypeScript' },
    { icon: <SiNodedotjs className="h-5 w-5" />, name: 'Node.js' },
    { icon: <SiPython className="h-5 w-5" />, name: 'Python' },
    { icon: <SiVite className="h-5 w-5" />, name: 'Vite' },
    { icon: <SiTailwindcss className="h-5 w-5" />, name: 'Tailwind' },
  ];

  const flow = copy.flow;

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
                  <span className="text-[13px] font-medium text-[var(--ecode-accent)]">{copy.hero.badge}</span>
                </div>

                <h1 className="mt-6 mkt-h1 font-bold leading-tight" data-testid="heading-mobile">
                  {copy.hero.title}
                  <span className="block bg-gradient-to-r from-[#F26207] to-[#F99D25] bg-clip-text text-transparent">
                    {copy.hero.accent}
                  </span>
                </h1>

                <p className="mx-auto mt-6 max-w-xl mkt-lead text-muted-foreground lg:mx-0">{copy.hero.description}</p>

                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                  <Button
                    size="lg"
                    onClick={() => navigate('/signup')}
                    className="gap-2 bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90"
                    data-testid="button-mobile-hero-start"
                  >
                    {copy.hero.primary}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    data-testid="button-mobile-hero-dashboard"
                  >
                    {copy.hero.secondary}
                  </Button>
                </div>
              </div>

              <div className="relative">
                <PhoneMockup src={PRODUCT_MOBILE_SHOT} alt={copy.hero.imageAlt} loading="eager" />
              </div>
            </div>
          </div>
        </section>

        {/* Highlights: real capability tour driven by the real screenshot */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="mkt-h2 font-bold">
                {copy.tour.title} <span className="text-[var(--ecode-accent)]">{copy.tour.accent}</span>
              </h2>
              <p className="mt-4 mkt-body text-muted-foreground">{copy.tour.description}</p>
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
                          isActive
                            ? 'bg-[var(--vc-action-primary-strong)] text-white'
                            : 'bg-muted text-[var(--ecode-accent)]'
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
                      aria-label={`${copy.tour.showPrefix} ${highlight.title}`}
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
                <PhoneMockup src={PRODUCT_MOBILE_SHOT} alt={`${copy.tour.imageAltPrefix} — ${activeHighlight.title}`} />
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
            <h2 className="mkt-h2 font-bold">{copy.stacks.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl mkt-body text-muted-foreground">{copy.stacks.description}</p>
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
                {copy.capabilitiesIntro.title}{' '}
                <span className="text-[var(--ecode-accent)]">{copy.capabilitiesIntro.accent}</span>
              </h2>
              <p className="mt-4 mkt-body text-muted-foreground">{copy.capabilitiesIntro.description}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <Card key={capability.id} className="group transition-all hover:shadow-xl">
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
                {copy.flowIntro.title} <span className="text-[var(--ecode-accent)]">{copy.flowIntro.accent}</span>
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
                {copy.comparison.title} <span className="text-[var(--ecode-accent)]">{copy.comparison.accent}</span>{' '}
                {copy.comparison.suffix}
              </h2>
            </div>
            <div className="grid gap-8 rounded-2xl border border-border bg-muted p-8 md:grid-cols-2">
              <div>
                <h3 className="mb-6 mkt-h3 font-bold text-muted-foreground">{copy.comparison.typicalTitle}</h3>
                <ul className="space-y-4">
                  {copy.comparison.typicalItems.map((item) => (
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
                <h3 className="mb-6 mkt-h3 font-bold text-[var(--ecode-accent)]">{copy.comparison.ecodeTitle}</h3>
                <ul className="space-y-4">
                  {copy.comparison.ecodeItems.map((item) => (
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
            <h2 className="mkt-h2 font-bold">{copy.cta.title}</h2>
            <p className="mx-auto mt-4 max-w-xl mkt-lead text-muted-foreground">{copy.cta.description}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="gap-2 bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90"
                data-testid="button-mobile-cta-start"
              >
                {copy.cta.primary}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/dashboard')}
                data-testid="button-mobile-cta-dashboard"
              >
                {copy.cta.secondary}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
