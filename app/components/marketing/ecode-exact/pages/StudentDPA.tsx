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
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function StudentDpa() {
  const protections = [
    {
      icon: Lock,
      title: 'Data Minimization',
      description: 'We only collect data necessary for educational purposes',
    },
    {
      icon: UserCheck,
      title: 'Age-Appropriate Consent',
      description: 'Special consent mechanisms for users under 18',
    },
    {
      icon: Eye,
      title: 'Parental Access Rights',
      description: 'Parents can access, review, and delete student data',
    },
    {
      icon: ShieldCheck,
      title: 'Enhanced Security',
      description: 'Additional security measures for student accounts',
    },
    {
      icon: Database,
      title: 'Data Retention Limits',
      description: 'Automatic deletion of data after educational use ends',
    },
    {
      icon: AlertCircle,
      title: 'Breach Notification',
      description: 'Immediate notification to schools of any data incidents',
    },
  ];

  const dataCategories = [
    {
      category: 'Account Information',
      data: ['Student name', 'Email address', 'Username', 'Grade level'],
      purpose: 'Account creation and management',
    },
    {
      category: 'Educational Records',
      data: ['Projects created', 'Code submissions', 'Assignment completion', 'Progress tracking'],
      purpose: 'Educational assessment and progress monitoring',
    },
    {
      category: 'Technical Data',
      data: ['Login times', 'Session duration', 'Feature usage', 'Error logs'],
      purpose: 'Platform improvement and technical support',
    },
    {
      category: 'Communication Data',
      data: ['Messages with instructors', 'Forum posts', 'Support requests'],
      purpose: 'Educational collaboration and support',
    },
  ];

  const obligations = [
    'Process student data only for educational purposes',
    'Implement appropriate security measures to protect student data',
    'Ensure compliance with FERPA, COPPA, and applicable state laws',
    'Provide data portability and deletion upon request',
    'Prohibit sale or commercial use of student data',
    'Limit data retention to active educational use period',
    'Maintain confidentiality of all student information',
    'Cooperate with school audits and compliance reviews',
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="page-student-dpa">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive py-20">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="default" className="mb-4">
              <GraduationCap className="h-4 w-4 mr-1" />
              EDUCATION PRIVACY
            </Badge>

            <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="heading-student-dpa">
              Student Data Processing Agreement
            </h1>

            <p className="text-xl text-muted-foreground mb-8">
              Our commitment to protecting student privacy in educational settings. This agreement governs how E-Code
              processes student data for schools and educational institutions.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="min-h-[44px]" asChild data-testid="button-student-dpa-download">
                <a href="#download">
                  <Download className="mr-2 h-5 w-5" />
                  Download Full Agreement
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
                  Contact Education Team
                </a>
              </Button>
            </div>

            <p className="text-[13px] text-muted-foreground mt-6">
              Effective Date: {LEGAL_DATES.studentDpa} • Last Updated: {LEGAL_DATES.studentDpa}
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
              <strong>Important:</strong> This Student DPA supplements our standard Terms of Service and Privacy Policy
              with additional protections specific to student data. Schools must execute this agreement before using
              E-Code for classroom instruction.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* Student Privacy Protections */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Enhanced Student Privacy Protections</h2>
            <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">
              We implement special safeguards for student data beyond our standard privacy practices
            </p>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Student Data Collection and Use</h2>
              <p className="text-[15px] text-muted-foreground">Transparent disclosure of what we collect and why</p>
            </div>

            <div className="space-y-6">
              {dataCategories.map((category) => (
                <Card key={category.category}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      {category.category}
                    </CardTitle>
                    <CardDescription>Purpose: {category.purpose}</CardDescription>
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
                <strong>No Commercial Use:</strong> Student data is never sold, used for advertising, or shared with
                third parties for commercial purposes. Data is used solely for educational purposes and platform
                improvement.
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
                  <CardTitle className="text-2xl">Legal Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">E-Code complies with:</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium">FERPA</div>
                          <div className="text-[13px] text-muted-foreground">
                            Family Educational Rights and Privacy Act
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium">COPPA</div>
                          <div className="text-[13px] text-muted-foreground">
                            Children's Online Privacy Protection Act
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium">GDPR</div>
                          <div className="text-[13px] text-muted-foreground">
                            General Data Protection Regulation (EU)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium">State Privacy Laws</div>
                          <div className="text-[13px] text-muted-foreground">
                            California, New York, and other state laws
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-3">School as Data Controller</h3>
                  <p className="text-muted-foreground mb-3">
                    Under this agreement, the educational institution acts as the data controller, and E-Code acts as
                    the data processor. This means:
                  </p>
                  <ul className="space-y-2 text-[13px]">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Schools determine what data is collected and for what purpose
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      E-Code processes data only according to school instructions
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Schools maintain responsibility for consent and parental rights
                    </li>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Obligations as Data Processor</h2>
            </div>

            <Card>
              <CardContent className="py-8">
                <div className="space-y-3">
                  {obligations.map((obligation, index) => (
                    <div key={index} className="flex items-start gap-3">
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Rights and Access</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <Users className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Student Rights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-[13px]">
                    <li>• Access their own data</li>
                    <li>• Request corrections</li>
                    <li>• Download their work</li>
                    <li>• Delete their account</li>
                    <li>• Opt-out of optional features</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <UserCheck className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Parent/Guardian Rights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-[13px]">
                    <li>• Review student data</li>
                    <li>• Request data deletion</li>
                    <li>• Withdraw consent</li>
                    <li>• Access activity reports</li>
                    <li>• Contact privacy team</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Building className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>School Rights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-[13px]">
                    <li>• Audit data practices</li>
                    <li>• Export all student data</li>
                    <li>• Terminate agreement</li>
                    <li>• Request compliance reports</li>
                    <li>• Manage user permissions</li>
                  </ul>
                </CardContent>
              </Card>
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
                  <CardTitle className="text-2xl">Data Security Measures</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Technical Safeguards</h4>
                    <ul className="space-y-2 text-[13px]">
                      <li className="flex items-start gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>256-bit encryption at rest and in transit</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Multi-factor authentication for educators</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Regular security audits and penetration testing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Isolated education environment</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3">Administrative Safeguards</h4>
                    <ul className="space-y-2 text-[13px]">
                      <li className="flex items-start gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Background checks for staff with data access</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Regular privacy training for employees</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Strict access controls and logging</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>Incident response procedures</span>
                      </li>
                    </ul>
                  </div>
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
              <h2 className="text-2xl font-bold mb-4">Download the Full Agreement</h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Get the complete Student Data Processing Agreement in PDF format. This document should be reviewed by
                your legal team and executed before deployment.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <a href="mailto:legal@e-code.ai?subject=Request%20for%20Student%20DPA%20(PDF)">
                    <Download className="mr-2 h-5 w-5" />
                    Download PDF
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="mailto:legal@e-code.ai?subject=Request%20for%20Student%20DPA%20(Word)">
                    <Download className="mr-2 h-5 w-5" />
                    Download Word
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Questions About Student Privacy?</h2>
            <p className="text-[15px] text-muted-foreground">Our education team is here to help</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="py-8">
                <Mail className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Email Us</h3>
                <p className="text-[13px] text-muted-foreground mb-4">For DPA questions and execution</p>
                <Button variant="outline" asChild className="w-full">
                  <a href="mailto:education@e-code.ai">education@e-code.ai</a>
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-8">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Schedule a Call</h3>
                <p className="text-[13px] text-muted-foreground mb-4">Discuss your school's needs</p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/contact-sales">Book Meeting</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-8">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Resources</h3>
                <p className="text-[13px] text-muted-foreground mb-4">Privacy guides and best practices</p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/help-center">View Resources</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
