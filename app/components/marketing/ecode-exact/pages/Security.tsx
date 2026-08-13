import { Shield, Lock, Key, Server, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge, Link } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function Security() {
  const securityFeatures = [
    {
      icon: Lock,
      title: 'End-to-End Encryption',
      description: 'All data is encrypted in transit and at rest using industry-standard encryption',
    },
    {
      icon: Key,
      title: 'Secure Authentication',
      description: 'Multi-factor authentication and SSO support for enterprise customers',
    },
    {
      icon: Server,
      title: 'Infrastructure Security',
      description: 'Hosted on secure cloud infrastructure with regular security audits',
    },
    {
      icon: Shield,
      title: 'Data Protection',
      description: 'GDPR compliant with strict data protection and privacy policies',
    },
  ];

  const certifications = [
    { name: 'SOC 2 Type II', status: 'Certified', icon: CheckCircle },
    { name: 'ISO 27001', status: 'Certified', icon: CheckCircle },
    { name: 'GDPR Compliant', status: 'Compliant', icon: CheckCircle },
    { name: 'CCPA Compliant', status: 'Compliant', icon: CheckCircle },
    { name: 'HIPAA', status: 'Available', icon: AlertTriangle },
    { name: 'PCI DSS', status: 'Level 1', icon: CheckCircle },
  ];

  const securityPractices = [
    {
      title: 'Regular Security Audits',
      description: 'Third-party penetration testing and security assessments',
    },
    {
      title: '24/7 Monitoring',
      description: 'Continuous monitoring of systems for security threats',
    },
    {
      title: 'Incident Response',
      description: 'Dedicated security team with rapid incident response',
    },
    {
      title: 'Employee Training',
      description: 'Regular security training for all employees',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-security">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-security">
                Enterprise-Grade Security
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Your code and data are protected by industry-leading security measures
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                SOC 2 Type II Certified
              </Badge>
            </div>
          </div>
        </section>

        {/* Security Features */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Security Features</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {securityFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4 text-primary" />
                      <h3 className="font-semibold mb-2">{feature.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Certifications */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Compliance & Certifications</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {certifications.map((cert) => {
                const Icon = cert.icon;
                return (
                  <Card key={cert.name}>
                    <CardContent className="flex items-center justify-between p-6">
                      <div>
                        <h3 className="font-semibold">{cert.name}</h3>
                        <p className="text-[13px] text-muted-foreground">{cert.status}</p>
                      </div>
                      <Icon className={`h-6 w-6 ${cert.icon === CheckCircle ? 'text-green-600' : 'text-yellow-600'}`} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Security Practices */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Our Security Practices</h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {securityPractices.map((practice) => (
                <div key={practice.title} className="flex gap-4">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-2">{practice.title}</h3>
                    <p className="text-muted-foreground">{practice.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Protection */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Data Protection</h2>

              <Card>
                <CardHeader>
                  <CardTitle>Your Data, Your Control</CardTitle>
                  <CardDescription>
                    We believe in transparency and giving you full control over your data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Data Ownership</h4>
                    <p className="text-muted-foreground">
                      You retain full ownership of all code and data you create on E-Code
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Data Portability</h4>
                    <p className="text-muted-foreground">
                      Export your projects and data at any time in standard formats
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Data Retention</h4>
                    <p className="text-muted-foreground">
                      Clear data retention policies with automatic deletion options
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Privacy Controls</h4>
                    <p className="text-muted-foreground">
                      Granular privacy settings to control who can see your projects
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Talk to our security team */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Have a Security Question?</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Learn more about our security practices, compliance certifications, and commitment to protecting your data
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 min-h-[44px]"
              data-testid="button-security-trust-center"
            >
              Contact Our Security Team
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
