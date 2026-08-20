import {
  Accessibility as AccessibilityIcon,
  ArrowRight,
  AudioLines,
  CircleCheckBig,
  Contrast,
  Gauge,
  Keyboard,
  Mail,
  MousePointer2,
  ScanEye,
  Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { SiAndroid, SiApple, SiFreedesktopdotorg, SiGoogle } from 'react-icons/si';

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
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactTrustPressCopy,
  type AccessibilityCommitmentId,
  type AccessibilityTechnologyId,
} from '~/lib/i18n/catalogs/marketing-exact-trust-press';

const PRODUCT_DASHBOARD_SHOT = '/ecode-static/assets/product/dashboard.png';
const ACCESSIBILITY_EMAIL = 'accessibility@e-code.ai';
const ACCESSIBILITY_MAILTO = `mailto:${ACCESSIBILITY_EMAIL}`;
const ACCENT = 'var(--ecode-accent)';

const ACCESSIBILITY_COMMITMENT_ICONS: Record<AccessibilityCommitmentId, LucideIcon> = {
  perceivable: ScanEye,
  operable: MousePointer2,
  understandable: Type,
  robust: Contrast,
};

type AccessibilityIconComponent = LucideIcon | IconType;

const ACCESSIBILITY_TECH_ICONS: Record<AccessibilityTechnologyId, AccessibilityIconComponent> = {
  voiceOver: SiApple,
  talkBack: SiAndroid,
  orca: SiFreedesktopdotorg,
  voiceControl: AudioLines,
  magnifiers: ScanEye,
  voiceAccess: SiGoogle,
};

export default function Accessibility() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactTrustPressCopy(i18n.resolvedLanguage ?? i18n.language).exactAccessibility;

  const commitments = copy.commitment.items.map((commitment) => ({
    ...commitment,
    icon: ACCESSIBILITY_COMMITMENT_ICONS[commitment.id],
  }));
  const technologies = copy.technologies.items.map((technology) => ({
    ...technology,
    icon: ACCESSIBILITY_TECH_ICONS[technology.id],
  }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-accessibility">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <div
                className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: ACCENT }}
              >
                <AccessibilityIcon className="h-7 w-7 text-white" aria-hidden />
              </div>
              <h1 className="mkt-h1 mb-4" data-testid="heading-accessibility">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">{copy.hero.description}</p>
              <Badge
                variant="secondary"
                className="inline-flex max-w-full whitespace-normal px-4 py-2 text-center text-[15px]"
              >
                {copy.hero.badge}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="mkt-h2 mb-4">{copy.commitment.title}</h2>
              <p className="mkt-body text-muted-foreground">{copy.commitment.description}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {commitments.map((item) => {
                const Icon = item.icon;

                return (
                  <Card key={item.id} className="h-full">
                    <CardContent className="pt-6 text-center">
                      <div
                        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="h-6 w-6 text-white" aria-hidden />
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

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-5xl mx-auto grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="min-w-0">
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Gauge className="h-6 w-6 text-white" aria-hidden />
                </div>
                <h2 className="mkt-h2 mb-4">{copy.conformance.title}</h2>
                <Card>
                  <CardHeader>
                    <CardTitle>{copy.conformance.cardTitle}</CardTitle>
                    <CardDescription>{copy.conformance.cardDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {copy.conformance.items.map((item) => (
                      <div key={item.id}>
                        <h3 className="mkt-h3 font-semibold mb-2">{item.title}</h3>
                        <p className="mkt-small text-muted-foreground">{item.description}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <figure className="m-0 min-w-0">
                <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
                  <img
                    src={PRODUCT_DASHBOARD_SHOT}
                    alt={copy.conformance.imageAlt}
                    loading="lazy"
                    className="block w-full"
                    draggable={false}
                  />
                </div>
                <figcaption className="mt-3 text-center mkt-small text-muted-foreground">
                  {copy.conformance.imageCaption}
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: ACCENT }}
              >
                <AudioLines className="h-6 w-6 text-white" aria-hidden />
              </div>
              <h2 className="mkt-h2">{copy.technologies.title}</h2>
              <p className="mkt-body text-muted-foreground mt-4 max-w-2xl mx-auto">{copy.technologies.description}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {technologies.map((technology) => {
                const Icon = technology.icon;

                return (
                  <Card key={technology.id} className="h-full">
                    <CardContent className="flex min-w-0 items-center gap-4 p-6">
                      <div
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background"
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" style={{ color: ACCENT }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="mkt-h3 font-semibold">{technology.name}</h3>
                        <p className="mkt-small text-muted-foreground">{technology.detail}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center mb-12">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: ACCENT }}
              >
                <Keyboard className="h-6 w-6 text-white" aria-hidden />
              </div>
              <h2 className="mkt-h2">{copy.keyboard.title}</h2>
              <p className="mkt-body text-muted-foreground mt-4 max-w-2xl mx-auto">{copy.keyboard.description}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {copy.keyboard.items.map((shortcut) => (
                <Card key={shortcut.id} className="h-full">
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

        <section className="py-responsive">
          <div className="container-responsive text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: ACCENT }}
            >
              <Mail className="h-6 w-6 text-white" aria-hidden />
            </div>
            <h2 className="mkt-h2 mb-4">{copy.report.title}</h2>
            <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">{copy.report.description}</p>
            <a
              href={ACCESSIBILITY_MAILTO}
              className="inline-flex min-h-[44px] w-full max-w-sm items-center justify-center gap-2 break-all rounded-md px-6 py-3 text-white sm:w-auto"
              style={{ backgroundColor: ACCENT }}
              data-testid="link-accessibility-report"
            >
              <CircleCheckBig className="h-4 w-4 shrink-0" aria-hidden />
              {ACCESSIBILITY_EMAIL}
            </a>
          </div>
        </section>

        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive max-w-3xl text-center">
            <h2 className="mkt-h2">{copy.cta.title}</h2>
            <p className="mkt-lead mx-auto mt-4 max-w-xl text-muted-foreground">{copy.cta.description}</p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[var(--vc-action-primary-strong)] px-8 font-medium text-white hover:brightness-90 sm:w-auto"
                data-testid="button-accessibility-cta-start"
              >
                {copy.cta.primary}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-border bg-surface-solid px-8 font-medium text-foreground hover:bg-surface-hover-solid sm:w-auto"
                data-testid="button-accessibility-cta-dashboard"
              >
                {copy.cta.secondary}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
