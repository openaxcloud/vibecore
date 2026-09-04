import {
  Activity,
  Building,
  CheckCircle,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  Mail,
  MapPin,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Button } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Link } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactSubprocessorsCopy,
  type SubprocessorCategoryId,
  type SubprocessorId,
} from '~/lib/i18n/catalogs/marketing-exact-subprocessors';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

const SUBPROCESSOR_TECHNICAL: Record<SubprocessorId, { name: string; compliance: readonly string[]; website: string }> =
  {
    aws: {
      name: 'Amazon Web Services',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR', 'HIPAA'],
      website: 'https://aws.amazon.com',
    },
    gcp: {
      name: 'Google Cloud Platform',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://cloud.google.com',
    },
    cloudflare: {
      name: 'Cloudflare',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://cloudflare.com',
    },
    stripe: {
      name: 'Stripe',
      compliance: ['PCI DSS', 'SOC 2', 'ISO 27001'],
      website: 'https://stripe.com',
    },
    sendgrid: {
      name: 'SendGrid',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://sendgrid.com',
    },
    datadog: {
      name: 'Datadog',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://datadoghq.com',
    },
    github: {
      name: 'GitHub',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://github.com',
    },
    auth0: {
      name: 'Auth0',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR', 'HIPAA'],
      website: 'https://auth0.com',
    },
    intercom: {
      name: 'Intercom',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://intercom.com',
    },
    mongodb: {
      name: 'MongoDB Atlas',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://mongodb.com/atlas',
    },
  };

const CATEGORY_ICONS: Record<SubprocessorCategoryId, ElementType> = {
  infrastructure: Server,
  payments: CreditCard,
  communications: Mail,
  analytics: Activity,
  development: Users,
  security: Lock,
};

const RELATED_DOCUMENTS = {
  privacy: { icon: FileText, href: '/privacy' },
  dpa: { icon: FileText, href: '/dpa' },
  security: { icon: Shield, href: '/security' },
} as const;

export default function Subprocessors() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactSubprocessorsCopy(language).exactSubprocessors;
  const lastUpdated = formatLegalMonthYear(LEGAL_DATES.subprocessors, language);

  const subprocessors = copy.table.providers.map((provider) => ({
    ...provider,
    ...SUBPROCESSOR_TECHNICAL[provider.id],
  }));

  return (
    <div className="min-h-screen bg-background" data-testid="page-subprocessors">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive py-20">
          <div className="text-center max-w-3xl mx-auto">
            {/* Échelle h1 de la famille légale (Terms/Privacy/DPA) : text-responsive-2xl, pas 60px. */}
            <h1 className="break-words text-responsive-2xl font-bold mb-6" data-testid="heading-subprocessors">
              {copy.title}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">{copy.description}</p>
            <Badge variant="outline" className="text-[13px]">
              <CheckCircle className="h-4 w-4 mr-1" />
              {copy.lastUpdated}: {lastUpdated}
            </Badge>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="py-12">
        <div className="container-responsive">
          <Card className="max-w-4xl mx-auto">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>{copy.commitment.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>{copy.commitment.intro}</p>
              <ul className="list-disc pl-6 space-y-2">
                {copy.commitment.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
              <p className="text-[13px] text-muted-foreground">{copy.commitment.monitoring}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subprocessor List */}
      <section className="py-12">
        <div className="container-responsive">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">{copy.table.title}</h2>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {copy.table.headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subprocessors.map((sp) => {
                    const Icon = CATEGORY_ICONS[sp.categoryId] || Building;
                    return (
                      <TableRow key={sp.name}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-lg">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-medium">{sp.name}</div>
                              <div className="text-[13px] text-muted-foreground">{sp.service}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{sp.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {sp.location}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-[13px]">{sp.purpose}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {sp.compliance.map((cert) => (
                              <Badge key={cert} variant="outline" className="text-[11px]">
                                {cert}
                              </Badge>
                            ))}
                          </div>
                          <a
                            href={sp.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                          >
                            {copy.table.viewDetails}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      </section>

      {/* Data Centers */}
      <section className="py-12 bg-muted/30">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">{copy.dataCenters.title}</h2>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <CardTitle className="text-[15px]">{copy.dataCenters.regionsTitle}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {copy.dataCenters.regions.map((region) => (
                      <li key={region} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{region}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    <CardTitle className="text-[15px]">{copy.dataCenters.residencyTitle}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] mb-3">{copy.dataCenters.residencyDescription}</p>
                  <ul className="space-y-2 text-[13px]">
                    {copy.dataCenters.safeguards.map((safeguard) => (
                      <li key={safeguard} className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span>{safeguard}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Notification Process */}
      <section className="py-12">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Mail className="h-6 w-6 text-primary" />
                  <CardTitle>{copy.updates.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>{copy.updates.intro}</p>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">{copy.updates.processTitle}</h4>
                    <ul className="space-y-2 text-[13px]">
                      {copy.updates.process.map((step) => (
                        <li key={step} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">{copy.updates.subscribeTitle}</h4>
                    <p className="text-[13px] mb-3">{copy.updates.subscribeDescription}</p>
                    <Button className="w-full min-h-[44px]" asChild data-testid="button-subprocessors-subscribe">
                      <a href={`mailto:privacy@e-code.ai?subject=${encodeURIComponent(copy.updates.mailSubject)}`}>
                        {copy.updates.subscribeAction}
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Related Documents */}
      <section className="py-12 bg-muted/30">
        <div className="container-responsive">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">{copy.related.title}</h2>
            <p className="text-muted-foreground">{copy.related.description}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {copy.related.documents.map((document) => {
              const related = RELATED_DOCUMENTS[document.id];
              const Icon = related.icon;

              return (
                <Card key={document.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <Icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-[15px]">{document.title}</CardTitle>
                    <CardDescription>{document.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={related.href}>{document.action}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12">
        <div className="container-responsive">
          <Card className="max-w-2xl mx-auto text-center">
            <CardContent className="py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="text-xl font-semibold mb-2">{copy.contact.title}</h3>
              <p className="text-muted-foreground mb-6">{copy.contact.description}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <a href="mailto:privacy@e-code.ai">
                    <Mail className="mr-2 h-4 w-4" />
                    {copy.contact.primary}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/support">{copy.contact.secondary}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
