import { AlertTriangle, CheckCircle, Key, Lock, Server, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  type SecurityCertificationId,
  type SecurityFeatureId,
} from '~/lib/i18n/catalogs/marketing-exact-trust-press';

const SECURITY_FEATURE_ICONS: Record<SecurityFeatureId, LucideIcon> = {
  encryption: Lock,
  authentication: Key,
  infrastructure: Server,
  data: Shield,
};

const SECURITY_CERTIFICATION_MEDIA: Record<SecurityCertificationId, { icon: LucideIcon; className: string }> = {
  soc2: { icon: CheckCircle, className: 'text-green-600' },
  iso27001: { icon: CheckCircle, className: 'text-green-600' },
  gdpr: { icon: CheckCircle, className: 'text-green-600' },
  ccpa: { icon: CheckCircle, className: 'text-green-600' },
  hipaa: { icon: AlertTriangle, className: 'text-amber-600' },
  pci: { icon: CheckCircle, className: 'text-green-600' },
};

export default function Security() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactTrustPressCopy(i18n.resolvedLanguage ?? i18n.language).exactSecurity;

  const features = copy.features.items.map((feature) => ({
    ...feature,
    icon: SECURITY_FEATURE_ICONS[feature.id],
  }));
  const certifications = copy.certifications.items.map((certification) => ({
    ...certification,
    ...SECURITY_CERTIFICATION_MEDIA[certification.id],
  }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-security">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" aria-hidden />
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-security">
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
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.features.title}</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <Card key={feature.id} className="h-full">
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4 text-primary" aria-hidden />
                      <h3 className="mkt-h3 font-semibold mb-2">{feature.title}</h3>
                      <p className="mkt-small text-muted-foreground leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.certifications.title}</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {certifications.map((certification) => {
                const Icon = certification.icon;

                return (
                  <Card key={certification.id} className="h-full">
                    <CardContent className="flex items-start justify-between gap-4 p-6">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{certification.name}</h3>
                        <p className="mkt-small text-muted-foreground">{certification.status}</p>
                      </div>
                      <Icon className={`h-6 w-6 shrink-0 ${certification.className}`} aria-hidden />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.practices.title}</h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {copy.practices.items.map((practice) => (
                <div key={practice.id} className="flex gap-4">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="mkt-h3 font-semibold mb-2">{practice.title}</h3>
                    <p className="mkt-body text-muted-foreground leading-relaxed">{practice.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="mkt-h2 font-bold text-center mb-12">{copy.data.title}</h2>

              <Card>
                <CardHeader>
                  <CardTitle>{copy.data.cardTitle}</CardTitle>
                  <CardDescription>{copy.data.cardDescription}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  {copy.data.items.map((item) => (
                    <div key={item.id}>
                      <h3 className="mkt-h3 font-semibold mb-2">{item.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive text-center">
            <h2 className="mkt-h2 font-bold mb-4">{copy.cta.title}</h2>
            <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl mx-auto">{copy.cta.description}</p>
            <Link
              href="/contact"
              className="inline-flex w-full max-w-sm sm:w-auto items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 min-h-[44px]"
              data-testid="button-security-trust-center"
            >
              {copy.cta.button}
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
