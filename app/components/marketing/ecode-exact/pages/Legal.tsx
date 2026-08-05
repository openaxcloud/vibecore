import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Database,
  FileCheck,
  FileText,
  Gavel,
  GraduationCap,
  Lock,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
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
  getMarketingExactPrivacyTermsCopy,
  type LegalResourceId,
} from '~/lib/i18n/catalogs/marketing-exact-privacy-terms';

const LEGAL_RESOURCE_MEDIA: Record<LegalResourceId, { href: string; icon: LucideIcon }> = {
  terms: { href: '/terms', icon: FileText },
  privacy: { href: '/privacy', icon: Lock },
  subprocessors: { href: '/subprocessors', icon: Database },
  dpa: { href: '/dpa', icon: FileCheck },
  studentDpa: { href: '/student-dpa', icon: GraduationCap },
  security: { href: '/security', icon: Shield },
  acceptableUse: { href: '/acceptable-use', icon: ShieldCheck },
  enforcement: { href: '/enforcement', icon: Gavel },
  licensing: { href: '/licensing', icon: ScrollText },
  inactivity: { href: '/account-inactivity', icon: Clock },
  dataDeletion: { href: '/data-deletion', icon: Trash2 },
  reportAbuse: { href: '/report-abuse', icon: AlertTriangle },
};

export default function Legal() {
  const { i18n } = useTranslation();
  const catalog = getMarketingExactPrivacyTermsCopy(i18n.resolvedLanguage ?? i18n.language);
  const copy = catalog.exactLegal;

  const documents = copy.documents.map((document) => ({
    ...document,
    ...LEGAL_RESOURCE_MEDIA[document.id],
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="page-legal">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-4 flex items-center justify-center gap-2">
                <Scale className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-[13px] text-muted-foreground">{copy.hero.eyebrow}</span>
              </div>
              <h1 className="mb-4 break-words text-responsive-2xl font-bold tracking-tight" data-testid="heading-legal">
                {copy.hero.title}
              </h1>
              <p className="mx-auto max-w-2xl text-responsive-base text-muted-foreground">{copy.hero.description}</p>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
              {documents.map((document) => {
                const Icon = document.icon;

                return (
                  <Card key={document.id} className="group flex h-full min-w-0 flex-col">
                    <CardHeader className="min-w-0">
                      <div className="mb-3 flex min-w-0 items-start justify-between gap-4">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                          aria-hidden="true"
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="secondary" className="max-w-full whitespace-normal text-center leading-relaxed">
                          {document.badge}
                        </Badge>
                      </div>
                      <CardTitle className="break-words">{document.title}</CardTitle>
                      <CardDescription className="break-words">{document.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <Link
                        href={document.href}
                        className="inline-flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-solid px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
                      >
                        {copy.documentAction}
                        <ArrowRight
                          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="mx-auto mt-12 max-w-4xl rounded-lg border border-border bg-muted p-6 text-center sm:p-8">
              <h2 className="mb-2 break-words text-xl font-semibold">{copy.contact.title}</h2>
              <p className="mx-auto mb-6 max-w-2xl text-[13px] text-muted-foreground">{copy.contact.description}</p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <a
                  href={`mailto:${catalog.shared.legalEmail}`}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                >
                  {copy.contact.primary}
                </a>
                <Link
                  href="/report-abuse"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-border bg-surface-solid px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                >
                  {copy.contact.secondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
