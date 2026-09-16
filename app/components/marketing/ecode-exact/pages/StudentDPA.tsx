import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BookOpen,
  Building,
  Calendar,
  CheckCircle,
  Database,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Info,
  Lock,
  Mail,
  ScrollText,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Alert, AlertDescription } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Button } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Link } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactStudentDpaCopy,
  type StudentContactId,
  type StudentProtectionId,
  type StudentRightsId,
  type StudentSecurityId,
} from '~/lib/i18n/catalogs/marketing-exact-student-dpa';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

const PROTECTION_ICONS: Record<StudentProtectionId, LucideIcon> = {
  minimization: Lock,
  consent: UserCheck,
  parental: Eye,
  security: ShieldCheck,
  retention: Database,
  breach: AlertCircle,
};

const RIGHTS_ICONS: Record<StudentRightsId, LucideIcon> = {
  student: Users,
  guardian: UserCheck,
  school: Building,
};

const SECURITY_ICONS: Record<StudentSecurityId, LucideIcon> = {
  technical: Lock,
  administrative: UserCheck,
};

const CONTACT_MEDIA: Record<StudentContactId, { icon: LucideIcon; href: string }> = {
  email: { icon: Mail, href: 'mailto:education@e-code.ai' },
  meeting: { icon: Calendar, href: '/contact-sales' },
  resources: { icon: BookOpen, href: '/help-center' },
};

export default function StudentDpa() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactStudentDpaCopy(language).exactStudentDpa;
  const legalDate = formatLegalMonthYear(LEGAL_DATES.studentDpa, language);

  const protections = copy.protections.map((protection) => ({
    ...protection,
    icon: PROTECTION_ICONS[protection.id],
  }));

  return (
    <div className="min-h-screen bg-background" data-testid="page-student-dpa">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive py-20">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="default" className="mb-4">
              <GraduationCap className="h-4 w-4 mr-1" />
              {copy.hero.badge}
            </Badge>

            {/* Échelle h1 de la famille légale (alignée sur DPA.tsx) : text-responsive-2xl, pas 60px. */}
            <h1 className="break-words text-responsive-2xl font-bold mb-6" data-testid="heading-student-dpa">
              {copy.hero.title}
            </h1>

            <p className="text-xl text-muted-foreground mb-8">{copy.hero.description}</p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="min-h-[44px]" asChild data-testid="button-student-dpa-download">
                <a href="#download">
                  <Download className="mr-2 h-5 w-5" />
                  {copy.hero.download}
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-[44px]"
                asChild
                data-testid="button-student-dpa-contact"
              >
                <a href="mailto:education@e-code.ai">
                  <Mail className="mr-2 h-5 w-5" />
                  {copy.hero.contact}
                </a>
              </Button>
            </div>

            <p className="text-[13px] text-muted-foreground mt-6">
              {copy.hero.effectiveDate}: {legalDate} • {copy.hero.lastUpdated}: {legalDate}
            </p>
          </div>
        </div>
      </section>

      {/* Key Points Alert */}
      <section className="py-8">
        <div className="container-responsive">
          <Alert className="max-w-4xl mx-auto">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>{copy.important.label} :</strong> {copy.important.text}
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* Student Privacy Protections */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.protectionsIntro.title}</h2>
            <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">{copy.protectionsIntro.description}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {protections.map((protection) => {
              const Icon = protection.icon;
              return (
                <Card key={protection.title}>
                  <CardHeader>
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-[15px]">{protection.title}</CardTitle>
                    <CardDescription>{protection.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Data Collection and Use */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.dataIntro.title}</h2>
              <p className="text-[15px] text-muted-foreground">{copy.dataIntro.description}</p>
            </div>

            <div className="space-y-6">
              {copy.dataCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      {category.category}
                    </CardTitle>
                    <CardDescription>
                      {copy.dataIntro.purposePrefix} : {category.purpose}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {category.data.map((item) => (
                        <Badge key={item} variant="secondary">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Alert className="mt-8">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>{copy.noCommercial.label} :</strong> {copy.noCommercial.text}
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </section>

      {/* Legal Compliance */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <ScrollText className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl">{copy.compliance.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">{copy.compliance.compliesWith}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {copy.compliance.laws.map((law) => (
                      <div key={law.id} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium">{law.name}</div>
                          <div className="text-[13px] text-muted-foreground">{law.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-3">{copy.compliance.controllerTitle}</h3>
                  <p className="text-muted-foreground mb-3">{copy.compliance.controllerDescription}</p>
                  <ul className="space-y-2 text-[13px]">
                    {copy.compliance.controllerPoints.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Our Obligations */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.obligationsTitle}</h2>
            </div>

            <Card>
              <CardContent className="py-8">
                <div className="space-y-3">
                  {copy.obligations.map((obligation) => (
                    <div key={obligation} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{obligation}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Rights and Access */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.rightsTitle}</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {copy.rights.map((right) => {
                const Icon = RIGHTS_ICONS[right.id];

                return (
                  <Card key={right.id}>
                    <CardHeader>
                      <Icon className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>{right.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-[13px]">
                        {right.items.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Data Security */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl">{copy.security.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {copy.security.groups.map((group) => {
                    const Icon = SECURITY_ICONS[group.id];

                    return (
                      <div key={group.id}>
                        <h4 className="font-semibold mb-3">{group.title}</h4>
                        <ul className="space-y-2 text-[13px]">
                          {group.items.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-20">
        <div className="container-responsive">
          <Card className="max-w-3xl mx-auto">
            <CardContent className="py-12 text-center">
              <FileText className="h-16 w-16 mx-auto mb-6 text-primary" />
              <h2 className="text-2xl font-bold mb-4">{copy.download.title}</h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">{copy.download.description}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <a href={`mailto:legal@e-code.ai?subject=${encodeURIComponent(copy.download.pdfSubject)}`}>
                    <Download className="mr-2 h-5 w-5" />
                    {copy.download.pdf}
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href={`mailto:legal@e-code.ai?subject=${encodeURIComponent(copy.download.wordSubject)}`}>
                    <Download className="mr-2 h-5 w-5" />
                    {copy.download.word}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.contact.title}</h2>
            <p className="text-[15px] text-muted-foreground">{copy.contact.description}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {copy.contact.cards.map((card) => {
              const media = CONTACT_MEDIA[card.id];
              const Icon = media.icon;

              return (
                <Card key={card.id} className="text-center">
                  <CardContent className="py-8">
                    <Icon className="h-12 w-12 mx-auto mb-4 text-primary" />
                    <h3 className="font-semibold mb-2">{card.title}</h3>
                    <p className="text-[13px] text-muted-foreground mb-4">{card.description}</p>
                    <Button variant="outline" asChild className="w-full">
                      {card.id === 'email' ? (
                        <a href={media.href}>{card.action}</a>
                      ) : (
                        <Link href={media.href}>{card.action}</Link>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
