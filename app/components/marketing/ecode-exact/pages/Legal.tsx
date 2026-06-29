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
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

const legalDocuments = [
  {
    title: 'Terms of Service',
    description: 'The terms that govern access to and use of E-Code products, services, and websites.',
    href: '/terms',
    icon: FileText,
    badge: 'Terms',
  },
  {
    title: 'Privacy Policy',
    description: 'How E-Code collects, uses, protects, and shares personal data across the platform.',
    href: '/privacy',
    icon: Lock,
    badge: 'Privacy',
  },
  {
    title: 'Subprocessors',
    description: 'Third-party providers that help E-Code process customer data and deliver the service.',
    href: '/subprocessors',
    icon: Database,
    badge: 'Data',
  },
  {
    title: 'Data Processing Addendum',
    description: 'Contractual terms for customers that need a data processing agreement with E-Code.',
    href: '/dpa',
    icon: FileCheck,
    badge: 'DPA',
  },
  {
    title: 'US Student DPA',
    description: 'Student privacy and education-specific data processing protections for US schools.',
    href: '/student-dpa',
    icon: GraduationCap,
    badge: 'Education',
  },
  {
    title: 'Security',
    description: 'Security controls, infrastructure protections, compliance posture, and incident response.',
    href: '/security',
    icon: Shield,
    badge: 'Trust',
  },
  {
    title: 'Acceptable Use Policy',
    description: 'Prohibited activities and the resource limits that keep the platform fair and reliable.',
    href: '/acceptable-use',
    icon: ShieldCheck,
    badge: 'Safety',
  },
  {
    title: 'Enforcement Policy',
    description: 'How E-Code responds to policy violations — warnings, restrictions, suspension, and appeals.',
    href: '/enforcement',
    icon: Gavel,
    badge: 'Safety',
  },
  {
    title: 'Licensing',
    description: 'How licenses apply to the apps you build and publish on E-Code.',
    href: '/licensing',
    icon: ScrollText,
    badge: 'Terms',
  },
  {
    title: 'Account Inactivity',
    description: 'When inactive free accounts may be removed, the notice you receive, and how to stay active.',
    href: '/account-inactivity',
    icon: Clock,
    badge: 'Account',
  },
  {
    title: 'Deleting Your Data',
    description: 'How to delete projects or your entire account, what gets removed, and how to request it.',
    href: '/data-deletion',
    icon: Trash2,
    badge: 'Data',
  },
  {
    title: 'Report Abuse',
    description: 'Report malicious code, illegal content, harassment, spam, privacy issues, or other abuse.',
    href: '/report-abuse',
    icon: AlertTriangle,
    badge: 'Safety',
  },
] as const;

export default function Legal() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-legal">
      <PublicNavbar />

      <main>
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-4 flex items-center justify-center gap-2">
                <Scale className="h-5 w-5" />
                <span className="text-[13px] text-muted-foreground">Legal Center</span>
              </div>
              <h1 className="mb-4 text-responsive-2xl font-bold tracking-tight" data-testid="heading-legal">
                Legal
              </h1>
              <p className="mx-auto max-w-2xl text-responsive-base text-muted-foreground">
                Review the policies, agreements, and trust resources that govern E-Code services.
              </p>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
              {legalDocuments.map((document) => {
                const Icon = document.icon;

                return (
                  <Card key={document.href} className="group">
                    <CardHeader>
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="secondary">{document.badge}</Badge>
                      </div>
                      <CardTitle>{document.title}</CardTitle>
                      <CardDescription>{document.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="outline" className="w-full justify-between">
                        <Link href={document.href}>
                          View document
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="mx-auto mt-12 max-w-4xl rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 text-center">
              <h2 className="mb-2 text-xl font-semibold">Need legal help?</h2>
              <p className="mx-auto mb-6 max-w-2xl text-[13px] text-muted-foreground">
                Contact our legal team for contract questions, data processing requests, security reviews, or abuse
                escalation.
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild>
                  <a href="mailto:legal@e-code.ai">Contact Legal</a>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/report-abuse">Report Abuse</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
