import {
  Accessibility as AccessibilityIcon,
  Keyboard,
  ScanEye,
  AudioLines,
  MousePointer2,
  Type,
  Contrast,
  CircleCheckBig,
  Gauge,
  ArrowRight,
  Mail,
} from 'lucide-react';
import { SiApple, SiGoogle, SiAndroid, SiFreedesktopdotorg } from 'react-icons/si';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useMarketingNavigate,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

const PRODUCT_DASHBOARD_SHOT = '/ecode-static/assets/product/dashboard.png';

export default function Accessibility() {
  const navigate = useMarketingNavigate();

  // Each principle maps to a concrete, on-theme concept icon (not a generic badge).
  const commitments = [
    {
      icon: ScanEye,
      title: 'Perceivable',
      description: 'Sufficient color contrast, scalable text, and text alternatives for non-text content',
    },
    {
      icon: MousePointer2,
      title: 'Operable',
      description: 'Full keyboard operability, visible focus states, and no time-based traps',
    },
    {
      icon: Type,
      title: 'Understandable',
      description: 'Predictable navigation, clear labels, and helpful, consistent error messaging',
    },
    {
      icon: Contrast,
      title: 'Robust',
      description: 'Semantic, standards-compliant markup that works with current and future assistive tech',
    },
  ];

  // Real brand glyphs for the platforms behind each assistive technology.
  const assistiveTech = [
    { name: 'VoiceOver', detail: 'Built-in macOS and iOS screen reader', icon: SiApple },
    { name: 'TalkBack', detail: 'Built-in Android screen reader', icon: SiAndroid },
    { name: 'Orca', detail: 'Open-source screen reader on Linux desktops', icon: SiFreedesktopdotorg },
    { name: 'Voice Control', detail: 'Speech-driven navigation and dictation', icon: AudioLines },
    { name: 'Screen Magnifiers', detail: 'OS-level zoom and on-screen magnification', icon: ScanEye },
    { name: 'Voice Access', detail: 'Hands-free control on Android and ChromeOS', icon: SiGoogle },
  ];

  const shortcuts = [
    { keys: 'Tab / Shift + Tab', action: 'Move forward or backward between interactive elements' },
    { keys: 'Enter / Space', action: 'Activate buttons, links, and controls' },
    { keys: 'Esc', action: 'Close dialogs, menus, and overlays' },
    { keys: 'Arrow Keys', action: 'Navigate menus, tabs, and list items' },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-accessibility">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <div
                className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
              >
                <AccessibilityIcon className="h-7 w-7 text-white" />
              </div>
              <h1 className="mkt-h1 mb-4" data-testid="heading-accessibility">
                Accessibility at E-Code
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                We are building a development platform that everyone can use — regardless of ability or the assistive
                technology they rely on.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Targeting WCAG 2.1 Level AA
              </Badge>
            </div>
          </div>
        </section>

        {/* Our Commitment */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="mkt-h2 mb-4">Our Commitment</h2>
              <p className="mkt-body text-muted-foreground">
                Accessibility is a core part of how we design and build E-Code. We follow the four guiding principles of
                the Web Content Accessibility Guidelines, and we treat accessibility issues as bugs that deserve the
                same priority as any other defect.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {commitments.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title}>
                    <CardContent className="pt-6 text-center">
                      <div
                        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                      >
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <h3 className="mkt-h3 font-semibold mb-2">{item.title}</h3>
                      <p className="mkt-small text-muted-foreground">{item.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Conformance */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-5xl mx-auto grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--ecode-accent)' }}
                >
                  <Gauge className="h-6 w-6 text-white" />
                </div>
                <h2 className="mkt-h2 mb-4">Conformance Status</h2>
                <Card>
                  <CardHeader>
                    <CardTitle>WCAG 2.1 Level AA</CardTitle>
                    <CardDescription>
                      E-Code aims to conform to Level AA of the Web Content Accessibility Guidelines 2.1.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="mkt-h3 font-semibold mb-2">Target Standard</h4>
                      <p className="mkt-small text-muted-foreground">
                        We measure our product against WCAG 2.1 AA success criteria across the marketing site,
                        dashboard, and the in-browser IDE.
                      </p>
                    </div>
                    <div>
                      <h4 className="mkt-h3 font-semibold mb-2">Ongoing Testing</h4>
                      <p className="mkt-small text-muted-foreground">
                        Automated checks run in our pipeline and are supplemented by manual screen-reader and
                        keyboard-only testing on key user flows.
                      </p>
                    </div>
                    <div>
                      <h4 className="mkt-h3 font-semibold mb-2">Known Limitations</h4>
                      <p className="mkt-small text-muted-foreground">
                        Some highly interactive editor surfaces are still being improved. Where a gap exists, we
                        document it and prioritize a fix.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Real product capture: the E-Code dashboard, framed responsively. */}
              <figure className="m-0">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-2xl ring-1 ring-white/5">
                  <img
                    src={PRODUCT_DASHBOARD_SHOT}
                    alt="The E-Code dashboard, navigable end-to-end with a keyboard and screen reader"
                    loading="lazy"
                    className="block w-full"
                    draggable={false}
                  />
                </div>
                <figcaption className="mt-3 text-center mkt-small text-muted-foreground">
                  The E-Code dashboard — built with semantic landmarks, visible focus, and accessible labels.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* Supported Assistive Technology */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
              >
                <AudioLines className="h-6 w-6 text-white" />
              </div>
              <h2 className="mkt-h2">Supported Assistive Technology</h2>
              <p className="mkt-body text-muted-foreground mt-4 max-w-2xl mx-auto">
                We test E-Code against the screen readers and input technologies our developers actually use.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {assistiveTech.map((tech) => {
                const Icon = tech.icon;
                return (
                  <Card key={tech.name}>
                    <CardContent className="flex items-center gap-4 p-6">
                      <div
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background"
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                      </div>
                      <div>
                        <h3 className="mkt-h3 font-semibold">{tech.name}</h3>
                        <p className="mkt-small text-muted-foreground">{tech.detail}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Keyboard Navigation */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
              >
                <Keyboard className="h-6 w-6 text-white" />
              </div>
              <h2 className="mkt-h2">Keyboard Navigation</h2>
              <p className="mkt-body text-muted-foreground mt-4 max-w-2xl mx-auto">
                Every interactive element is reachable and operable with a keyboard alone, with a clear visible focus
                indicator at all times.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {shortcuts.map((shortcut) => (
                <Card key={shortcut.keys}>
                  <CardContent className="p-6">
                    <kbd className="inline-block rounded border bg-background px-2 py-1 text-[13px] font-mono mb-3">
                      {shortcut.keys}
                    </kbd>
                    <p className="mkt-small text-muted-foreground">{shortcut.action}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Report an Issue */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
            >
              <Mail className="h-6 w-6 text-white" />
            </div>
            <h2 className="mkt-h2 mb-4">Report an Accessibility Issue</h2>
            <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">
              If you encounter a barrier while using E-Code, we want to hear about it. Please include the page, the
              assistive technology you were using, and a short description so we can reproduce and resolve it quickly.
            </p>
            <a
              href="mailto:accessibility@e-code.ai"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-white rounded-md min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="link-accessibility-report"
            >
              <CircleCheckBig className="h-4 w-4" />
              accessibility@e-code.ai
            </a>
          </div>
        </section>

        {/* End CTA */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive max-w-3xl text-center">
            <h2 className="mkt-h2">Build something everyone can use</h2>
            <p className="mkt-lead mx-auto mt-4 max-w-xl text-muted-foreground">
              Spin up an accessible workspace in seconds — the same projects, agent, and previews, fully keyboard- and
              screen-reader-navigable from day one.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="gap-2 bg-ecode-accent text-white hover:bg-ecode-accent-hover"
                data-testid="button-accessibility-cta-start"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/dashboard')}
                data-testid="button-accessibility-cta-dashboard"
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
