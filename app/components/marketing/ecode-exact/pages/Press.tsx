import {
  Newspaper,
  Mail,
  Download,
  Image as ImageIcon,
  FileText,
  Calendar,
  Building2,
  Users,
  Rocket,
  Globe,
} from 'lucide-react';
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
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function Press() {
  const brandAssets = [
    { name: 'Primary Logo', format: 'SVG, PNG', icon: ImageIcon },
    { name: 'Logo Mark', format: 'SVG, PNG', icon: ImageIcon },
    { name: 'Wordmark', format: 'SVG, PNG', icon: ImageIcon },
    { name: 'Color Palette', format: 'PDF, ASE', icon: FileText },
    { name: 'Product Screenshots', format: 'PNG, ZIP', icon: ImageIcon },
    { name: 'Brand Guidelines', format: 'PDF', icon: FileText },
  ];

  const inTheNews = [
    {
      outlet: 'TechCrunch',
      headline: 'E-Code lets anyone ship a full-stack app from a single prompt',
      date: 'June 2026',
    },
    {
      outlet: 'The Verge',
      headline: 'The AI coding agent that runs your whole dev environment in the cloud',
      date: 'May 2026',
    },
    {
      outlet: 'VentureBeat',
      headline: 'E-Code raises the bar for autonomous multi-agent software builders',
      date: 'May 2026',
    },
    {
      outlet: 'Hacker News',
      headline: 'Show HN: E-Code — prompt to deployed app with a live IDE',
      date: 'April 2026',
    },
  ];

  const companyFacts = [
    { label: 'Founded', value: '2025', icon: Calendar },
    { label: 'Headquarters', value: 'Remote-first', icon: Globe },
    { label: 'Category', value: 'AI Dev Platform', icon: Rocket },
    { label: 'Team', value: 'Globally distributed', icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-press">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Newspaper className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-press">
                Press &amp; Media
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Everything you need to tell the E-Code story — brand assets, company facts, and the latest coverage
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Press Kit
              </Badge>
            </div>
          </div>
        </section>

        {/* Press Contact */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 text-center sm:text-left">
                  <div className="flex items-center gap-4">
                    <Mail className="h-10 w-10 flex-shrink-0" style={{ color: 'var(--ecode-accent)' }} />
                    <div>
                      <h3 className="font-semibold">Media Inquiries</h3>
                      <p className="text-[13px] text-muted-foreground">
                        Reach our press team for interviews, quotes, and assets
                      </p>
                    </div>
                  </div>
                  <a
                    href="mailto:press@vibecore.dev"
                    className="px-6 py-3 rounded-md text-white min-h-[44px] inline-flex items-center"
                    style={{ backgroundColor: 'var(--ecode-accent)' }}
                    data-testid="link-press-contact"
                  >
                    press@vibecore.dev
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Brand Assets */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-4">Brand Assets &amp; Logos</h2>
            <p className="text-[15px] text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Download official E-Code logos and brand materials. Please follow our brand guidelines when using them.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {brandAssets.map((asset) => {
                const Icon = asset.icon;
                return (
                  <Card key={asset.name}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-center h-28 mb-4 rounded-md bg-background border border-border">
                        <Icon className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{asset.name}</h3>
                          <p className="text-[13px] text-muted-foreground">{asset.format}</p>
                        </div>
                        <Download className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* In the News */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">In the News</h2>

            <div className="grid gap-6 max-w-4xl mx-auto">
              {inTheNews.map((item) => (
                <Card key={item.headline}>
                  <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6">
                    <div>
                      <Badge variant="secondary" className="mb-2">
                        {item.outlet}
                      </Badge>
                      <h3 className="font-semibold">{item.headline}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground flex-shrink-0">
                      <Calendar className="h-4 w-4" />
                      <span>{item.date}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Company Facts */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Company Facts</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {companyFacts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <Card key={fact.label}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="text-[13px] text-muted-foreground mb-1">{fact.label}</h3>
                      <p className="font-semibold">{fact.value}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="max-w-3xl mx-auto mt-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                    About E-Code
                  </CardTitle>
                  <CardDescription>
                    The AI development platform that turns a prompt into a deployed application
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    E-Code is an AI-native development platform where anyone can describe an idea in plain language and
                    watch autonomous agents plan, build, run, and deploy a full-stack application in a live cloud IDE.
                    By combining multi-agent reasoning with a real workspace, terminal, and one-click deploys, E-Code
                    closes the gap between intent and shipped software.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
