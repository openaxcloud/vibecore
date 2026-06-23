import {
  Apple,
  Cpu,
  Download,
  HardDrive,
  Layers,
  Monitor,
  MonitorSmartphone,
  Terminal,
  WifiOff,
  Zap,
} from 'lucide-react';
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
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { desktopDownloadUrl } from '~/components/marketing/ecode-exact/pages/desktop-download';

export default function Desktop() {
  const downloads = [
    { os: 'macOS', icon: Apple, hint: 'Universal · Apple Silicon & Intel', file: 'E-Code.dmg' },
    { os: 'Windows', icon: Monitor, hint: '64-bit · Windows 10 and later', file: 'E-Code-Setup.exe' },
    { os: 'Linux', icon: Terminal, hint: 'AppImage · Debian & RPM', file: 'E-Code.AppImage' },
  ];

  const features = [
    {
      icon: Zap,
      title: 'Native Performance',
      description:
        'A purpose-built desktop runtime keeps the editor, terminal, and previews instant — no browser tab tax.',
    },
    {
      icon: WifiOff,
      title: 'Works Offline',
      description:
        'Keep coding on the plane or off the grid. Your workspace syncs back automatically once you reconnect.',
    },
    {
      icon: HardDrive,
      title: 'Deep OS Integration',
      description: 'Native file dialogs, system notifications, the menu bar, and global shortcuts feel right at home.',
    },
    {
      icon: Layers,
      title: 'Multi-Window',
      description: 'Pop projects, terminals, and previews into their own windows and spread work across every display.',
    },
  ];

  const requirements = [
    {
      os: 'macOS',
      icon: Apple,
      specs: [
        'macOS 12 Monterey or later',
        'Apple Silicon or Intel',
        '4 GB RAM (8 GB recommended)',
        '600 MB free disk space',
      ],
    },
    {
      os: 'Windows',
      icon: Monitor,
      specs: [
        'Windows 10 / 11 (64-bit)',
        'x64 or ARM64 processor',
        '4 GB RAM (8 GB recommended)',
        '600 MB free disk space',
      ],
    },
    {
      os: 'Linux',
      icon: Terminal,
      specs: [
        'Ubuntu 20.04+ / Fedora 36+',
        'glibc 2.31 or newer',
        '4 GB RAM (8 GB recommended)',
        '600 MB free disk space',
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-desktop">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <MonitorSmartphone className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-desktop">
                E-Code on your desktop
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                The full E-Code AI development platform as a native app for macOS, Windows, and Linux — faster,
                offline-ready, and built into your operating system.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Now in public beta
              </Badge>
            </div>
          </div>
        </section>

        {/* Download Buttons */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Download the desktop app</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {downloads.map((dl) => {
                const Icon = dl.icon;
                return (
                  <Card key={dl.os}>
                    <CardContent className="pt-6 text-center flex flex-col items-center">
                      <Icon className="h-10 w-10 mb-4 text-primary" />
                      <h3 className="font-semibold mb-1">Download for {dl.os}</h3>
                      <p className="text-[13px] text-muted-foreground mb-6">{dl.hint}</p>
                      <a
                        href={desktopDownloadUrl(dl.file)}
                        download
                        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                        data-testid={`button-download-${dl.os.toLowerCase()}`}
                      >
                        <Download className="h-4 w-4" />
                        {dl.os}
                      </a>
                      <p className="text-[11px] text-muted-foreground mt-3">{dl.file}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-[13px] text-muted-foreground text-center mt-8">
              Auto-updates keep you on the latest release. All builds are code-signed and notarized.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Why go native</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature) => {
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

        {/* System Requirements */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">System requirements</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {requirements.map((req) => {
                const Icon = req.icon;
                return (
                  <Card key={req.os}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Icon className="h-6 w-6 text-primary" />
                        <CardTitle>{req.os}</CardTitle>
                      </div>
                      <CardDescription>Minimum supported configuration</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {req.specs.map((spec) => (
                          <li key={spec} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                            <Cpu className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                            <span>{spec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Bring E-Code everywhere you build</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              The same projects, agents, and previews you know from the web — now with the speed and reach of a native
              desktop app.
            </p>
            <a
              href={desktopDownloadUrl(downloads[0].file)}
              download
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="button-desktop-cta"
            >
              <Download className="h-4 w-4" />
              Get the desktop app
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
