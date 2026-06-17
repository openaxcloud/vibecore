import { Accessibility as AccessibilityIcon, Keyboard, Eye, Ear, MousePointer2, CheckCircle, Mail } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function Accessibility() {
  const commitments = [
    {
      icon: Eye,
      title: 'Perceivable',
      description: 'Sufficient color contrast, scalable text, and text alternatives for non-text content',
    },
    {
      icon: MousePointer2,
      title: 'Operable',
      description: 'Full keyboard operability, visible focus states, and no time-based traps',
    },
    {
      icon: AccessibilityIcon,
      title: 'Understandable',
      description: 'Predictable navigation, clear labels, and helpful, consistent error messaging',
    },
    {
      icon: CheckCircle,
      title: 'Robust',
      description: 'Semantic, standards-compliant markup that works with current and future assistive tech',
    },
  ];

  const assistiveTech = [
    { name: 'VoiceOver', detail: 'macOS and iOS screen reader' },
    { name: 'NVDA', detail: 'Windows screen reader' },
    { name: 'JAWS', detail: 'Windows screen reader' },
    { name: 'TalkBack', detail: 'Android screen reader' },
    { name: 'Screen Magnifiers', detail: 'OS-level zoom and magnification' },
    { name: 'Voice Control', detail: 'Speech-driven navigation and dictation' },
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
              <AccessibilityIcon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-accessibility">
                Accessibility at E-Code
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                We are building a development platform that everyone can use, regardless of ability or the assistive
                technology they rely on
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                WCAG 2.1 Level AA
              </Badge>
            </div>
          </div>
        </section>

        {/* Our Commitment */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Our Commitment</h2>
              <p className="text-[15px] text-muted-foreground">
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
                      <Icon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mb-2">{item.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{item.description}</p>
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
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Conformance Status</h2>

              <Card>
                <CardHeader>
                  <CardTitle>WCAG 2.1 Level AA</CardTitle>
                  <CardDescription>
                    E-Code aims to conform to Level AA of the Web Content Accessibility Guidelines 2.1
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Target Standard</h4>
                    <p className="text-muted-foreground">
                      We measure our product against WCAG 2.1 AA success criteria across the marketing site, dashboard,
                      and the in-browser IDE.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Ongoing Testing</h4>
                    <p className="text-muted-foreground">
                      Automated checks run in our pipeline and are supplemented by manual screen-reader and
                      keyboard-only testing on key user flows.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Known Limitations</h4>
                    <p className="text-muted-foreground">
                      Some highly interactive editor surfaces are still being improved. Where a gap exists, we document
                      it and prioritize a fix.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Supported Assistive Technology */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <Ear className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h2 className="text-3xl font-bold">Supported Assistive Technology</h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {assistiveTech.map((tech) => (
                <Card key={tech.name}>
                  <CardContent className="flex items-center justify-between p-6">
                    <div>
                      <h3 className="font-semibold">{tech.name}</h3>
                      <p className="text-[13px] text-muted-foreground">{tech.detail}</p>
                    </div>
                    <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Keyboard Navigation */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <Keyboard className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h2 className="text-3xl font-bold">Keyboard Navigation</h2>
              <p className="text-[15px] text-muted-foreground mt-4 max-w-2xl mx-auto">
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
                    <p className="text-muted-foreground">{shortcut.action}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Report an Issue */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <Mail className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
            <h2 className="text-3xl font-bold mb-4">Report an Accessibility Issue</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              If you encounter a barrier while using E-Code, we want to hear about it. Please include the page, the
              assistive technology you were using, and a short description so we can reproduce and resolve it quickly.
            </p>
            <a
              href="mailto:accessibility@vibecore.dev"
              className="inline-flex items-center justify-center px-6 py-3 text-primary-foreground rounded-md min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="link-accessibility-report"
            >
              accessibility@vibecore.dev
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
