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
import { LEGAL_DATES } from '~/lib/legal-dates';

interface Subprocessor {
  name: string;
  service: string;
  category: string;
  location: string;
  purpose: string;
  compliance: string[];
  website?: string;
}

export default function Subprocessors() {
  const subprocessors: Subprocessor[] = [
    {
      name: 'Amazon Web Services',
      service: 'AWS',
      category: 'Infrastructure',
      location: 'United States',
      purpose: 'Cloud hosting, storage, and compute services',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR', 'HIPAA'],
      website: 'https://aws.amazon.com',
    },
    {
      name: 'Google Cloud Platform',
      service: 'GCP',
      category: 'Infrastructure',
      location: 'United States',
      purpose: 'Cloud services and container hosting',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://cloud.google.com',
    },
    {
      name: 'Cloudflare',
      service: 'CDN & Security',
      category: 'Infrastructure',
      location: 'United States',
      purpose: 'Content delivery network and DDoS protection',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://cloudflare.com',
    },
    {
      name: 'Stripe',
      service: 'Payment Processing',
      category: 'Payments',
      location: 'United States',
      purpose: 'Payment processing and subscription management',
      compliance: ['PCI DSS', 'SOC 2', 'ISO 27001'],
      website: 'https://stripe.com',
    },
    {
      name: 'SendGrid',
      service: 'Email Service',
      category: 'Communications',
      location: 'United States',
      purpose: 'Transactional email delivery',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://sendgrid.com',
    },
    {
      name: 'Datadog',
      service: 'Monitoring',
      category: 'Analytics',
      location: 'United States',
      purpose: 'Application performance monitoring and logging',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://datadoghq.com',
    },
    {
      name: 'GitHub',
      service: 'Version Control',
      category: 'Development',
      location: 'United States',
      purpose: 'Code repository and version control integration',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://github.com',
    },
    {
      name: 'Auth0',
      service: 'Authentication',
      category: 'Security',
      location: 'United States',
      purpose: 'User authentication and identity management',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR', 'HIPAA'],
      website: 'https://auth0.com',
    },
    {
      name: 'Intercom',
      service: 'Customer Support',
      category: 'Communications',
      location: 'United States',
      purpose: 'Customer support and chat services',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://intercom.com',
    },
    {
      name: 'MongoDB Atlas',
      service: 'Database',
      category: 'Infrastructure',
      location: 'United States',
      purpose: 'Managed database services',
      compliance: ['SOC 2', 'ISO 27001', 'GDPR'],
      website: 'https://mongodb.com/atlas',
    },
  ];

  const categoryIcons: Record<string, ElementType> = {
    Infrastructure: Server,
    Payments: CreditCard,
    Communications: Mail,
    Analytics: Activity,
    Development: Users,
    Security: Lock,
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-subprocessors">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive py-20">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="heading-subprocessors">
              Subprocessors
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              E-Code partners with industry-leading service providers to deliver a secure, reliable, and performant
              platform
            </p>
            <Badge variant="outline" className="text-[13px]">
              <CheckCircle className="h-4 w-4 mr-1" />
              Last Updated: {LEGAL_DATES.subprocessors}
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
                <CardTitle>Our Commitment to Data Protection</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                E-Code carefully selects subprocessors who maintain the highest standards of security and privacy. All
                subprocessors are required to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Sign data processing agreements that meet GDPR requirements</li>
                <li>Implement appropriate technical and organizational measures</li>
                <li>Undergo regular security audits and maintain compliance certifications</li>
                <li>Limit data processing to the specific purposes outlined below</li>
                <li>Delete or return data upon termination of services</li>
              </ul>
              <p className="text-[13px] text-muted-foreground">
                We continuously monitor our subprocessors to ensure they maintain these standards.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subprocessor List */}
      <section className="py-12">
        <div className="container-responsive">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Current Subprocessors</h2>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service Provider</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Compliance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subprocessors.map((sp) => {
                    const Icon = categoryIcons[sp.category] || Building;
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
                          {sp.website && (
                            <a
                              href={sp.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                            >
                              View details
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
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
            <h2 className="text-2xl font-bold mb-6 text-center">Data Center Locations</h2>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <CardTitle className="text-[15px]">Primary Regions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>United States (US-East, US-West)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>European Union (EU-West, EU-Central)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Asia Pacific (APAC-Southeast)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Canada (CA-Central)</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    <CardTitle className="text-[15px]">Data Residency</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] mb-3">
                    Customer data is stored in the region closest to your primary usage location.
                  </p>
                  <ul className="space-y-2 text-[13px]">
                    <li className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span>Data encrypted at rest and in transit</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span>Automated backups in same region</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span>No cross-region data transfer by default</span>
                    </li>
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
                  <CardTitle>Subprocessor Updates</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  We are committed to transparency regarding our use of subprocessors. Here's how we keep you informed:
                </p>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Notification Process</h4>
                    <ul className="space-y-2 text-[13px]">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>30-day advance notice for new subprocessors</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>Email notifications to account administrators</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>Updates posted to this page</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>Opportunity to object to changes</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Subscribe to Updates</h4>
                    <p className="text-[13px] mb-3">Stay informed about changes to our subprocessor list</p>
                    <Button className="w-full min-h-[44px]" asChild data-testid="button-subprocessors-subscribe">
                      <a href="mailto:privacy@e-code.ai?subject=Subscribe to Subprocessor Updates">
                        Subscribe to Notifications
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
            <h2 className="text-2xl font-bold mb-2">Related Documents</h2>
            <p className="text-muted-foreground">Learn more about our data protection practices</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <FileText className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-[15px]">Privacy Policy</CardTitle>
                <CardDescription>How we collect, use, and protect your data</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/privacy">View Policy</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <FileText className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-[15px]">Data Processing Agreement</CardTitle>
                <CardDescription>Our commitments for processing personal data</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/dpa">View DPA</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Shield className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-[15px]">Security Overview</CardTitle>
                <CardDescription>Our security measures and certifications</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/security">View Security</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12">
        <div className="container-responsive">
          <Card className="max-w-2xl mx-auto text-center">
            <CardContent className="py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="text-xl font-semibold mb-2">Questions About Our Subprocessors?</h3>
              <p className="text-muted-foreground mb-6">
                Our privacy team is here to answer your questions about data processing and subprocessors
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <a href="mailto:privacy@e-code.ai">
                    <Mail className="mr-2 h-4 w-4" />
                    Contact Privacy Team
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/support">Get Support</Link>
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
