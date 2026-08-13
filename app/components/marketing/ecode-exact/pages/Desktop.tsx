import {
  Cloud,
  Command,
  Cpu,
  Download,
  FolderGit2,
  GitBranch,
  HardDrive,
  Layers,
  Monitor,
  PanelsTopLeft,
  RefreshCw,
  Terminal,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import { SiApple, SiLinux } from 'react-icons/si';
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

const PRODUCT = '/ecode-static/assets/product';

/**
 * macOS-style window chrome wrapper used to frame real product screenshots so the
 * marketing page reads as "this is the actual app", not a mock. The traffic-light
 * dots + title bar give it the recognizable desktop-app silhouette.
 */
function WindowFrame({
  title,
  src,
  alt,
  priority = false,
}: {
  title: string;
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto text-[12px] font-medium text-muted-foreground truncate px-3">{title}</span>
        <span className="h-3 w-3" aria-hidden="true" />
      </div>
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto" />
    </div>
  );
}

export default function Desktop() {
  const downloads: { os: string; icon: IconType; hint: string; file: string }[] = [
    { os: 'macOS', icon: SiApple, hint: 'Universal · Apple Silicon & Intel', file: 'E-Code.dmg' },
    { os: 'Windows', icon: Monitor, hint: '64-bit · Windows 10 and later', file: 'E-Code-Setup.exe' },
    { os: 'Linux', icon: SiLinux, hint: 'AppImage · Debian & RPM', file: 'E-Code.AppImage' },
  ];

  const capabilities: { icon: LucideIcon; title: string; description: string }[] = [
    {
      icon: PanelsTopLeft,
      title: 'The full IDE, natively',
      description:
        'The same Agent panel, editor, file tree, terminal, and Run/Publish bar from the web — running in a dedicated desktop window.',
    },
    {
      icon: Zap,
      title: 'Native performance',
      description:
        'A purpose-built desktop runtime keeps the editor, terminal, and previews instant — no browser tab tax.',
    },
    {
      icon: WifiOff,
      title: 'Offline-capable PWA',
      description:
        'Keep coding on the plane or off the grid. Your workspace syncs back automatically once you reconnect.',
    },
    {
      icon: Cloud,
      title: 'Local + cloud workspaces',
      description:
        'Open a project on your own machine or attach to a managed cloud workspace — switch between them without leaving the app.',
    },
    {
      icon: HardDrive,
      title: 'Deep OS integration',
      description: 'Native file dialogs, system notifications, the menu bar, and global shortcuts feel right at home.',
    },
    {
      icon: Layers,
      title: 'Multi-window',
      description: 'Pop projects, terminals, and previews into their own windows and spread work across every display.',
    },
  ];

  const requirements: { os: string; icon: LucideIcon; specs: string[] }[] = [
    {
      os: 'macOS',
      icon: Command,
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
        {/* Hero */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
              <Badge
                variant="secondary"
                className="text-[12px] font-medium px-3 py-1 mb-6 inline-flex items-center gap-1.5"
              >
                <Monitor className="h-3.5 w-3.5" />
                Public beta · macOS, Windows &amp; Linux
              </Badge>
              <h1 className="mkt-h1 font-bold tracking-tight leading-tight mb-5" data-testid="heading-desktop">
                E-Code on your desktop
              </h1>
              <p className="mkt-lead text-muted-foreground leading-relaxed mb-8 max-w-2xl">
                The full E-Code AI development platform as a native app — the same Agent, editor, terminal, and previews
                you know from the web, now faster, offline-ready, and built into your operating system.
              </p>
              <a
                href={desktopDownloadUrl(downloads[0].file)}
                download
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
                data-testid="button-hero-download"
              >
                <Download className="h-4 w-4" />
                Download for {downloads[0].os}
              </a>
            </div>

            {/* Real desktop IDE inside a window frame */}
            <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
              <WindowFrame
                title="E-Code — todo-app"
                src={`${PRODUCT}/ide.png`}
                alt="The full E-Code desktop IDE: AI Agent panel, code editor, file tree, terminal, and Run/Publish bar"
                priority
              />
              <p className="mkt-small text-muted-foreground text-center mt-4">
                The real E-Code desktop IDE — Agent panel, editor, files, terminal, and the Run / Publish bar.
              </p>
            </div>
          </div>
        </section>

        {/* Download cards */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">Download the desktop app</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">
                Code-signed and notarized builds for every major platform. Auto-updates keep you on the latest release.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {downloads.map((dl) => {
                const Icon = dl.icon;
                return (
                  <Card key={dl.os} className="flex flex-col">
                    <CardContent className="pt-8 pb-6 px-6 text-center flex flex-col items-center flex-1">
                      <span className="flex items-center justify-center h-14 w-14 rounded-xl bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor mb-5">
                        <Icon className="h-7 w-7 text-primary" />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-1.5">Download for {dl.os}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed mb-6">{dl.hint}</p>
                      <a
                        href={desktopDownloadUrl(dl.file)}
                        download
                        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity mt-auto"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                        data-testid={`button-download-${dl.os.toLowerCase()}`}
                      >
                        <Download className="h-4 w-4" />
                        {dl.os}
                      </a>
                      <p className="mkt-small text-muted-foreground mt-3 font-mono">{dl.file}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">Why go native</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">
                Everything the web app does, plus the speed, reach, and OS integration only a desktop app can offer.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {capabilities.map((cap) => {
                const Icon = cap.icon;
                return (
                  <Card key={cap.title} className="h-full">
                    <CardContent className="pt-6 px-6 pb-6">
                      <span className="flex items-center justify-center h-11 w-11 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor mb-4">
                        <Icon className="h-5 w-5 text-primary" />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{cap.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{cap.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Git showcase — real Git panel */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center max-w-6xl mx-auto">
              <div>
                <Badge
                  variant="secondary"
                  className="text-[12px] font-medium px-3 py-1 mb-5 inline-flex items-center gap-1.5"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Built-in version control
                </Badge>
                <h2 className="mkt-h2 font-bold tracking-tight leading-tight mb-4">Full Git, right in the window</h2>
                <p className="mkt-lead text-muted-foreground leading-relaxed mb-6">
                  Stage, commit, branch, and review your history without leaving the editor. The native app surfaces the
                  same first-class Git panel as the web — backed by your local file system.
                </p>
                <ul className="space-y-3">
                  {[
                    { icon: FolderGit2, text: 'Working-tree diff with one-click staging' },
                    { icon: GitBranch, text: 'Branch switching and a live commit graph' },
                    { icon: RefreshCw, text: 'Push, pull, and sync to your connected remotes' },
                  ].map((row) => {
                    const Icon = row.icon;
                    return (
                      <li key={row.text} className="flex items-start gap-3 mkt-body">
                        <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>{row.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <WindowFrame
                title="E-Code — Source Control"
                src={`${PRODUCT}/ide-git.png`}
                alt="E-Code's real Git panel: current branch, working tree changes, orange Commit button, and commit graph"
              />
            </div>
          </div>
        </section>

        {/* System requirements */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">System requirements</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">
                Lightweight by design — E-Code runs comfortably on the machine you already have.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {requirements.map((req) => {
                const Icon = req.icon;
                return (
                  <Card key={req.os} className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
                          <Icon className="h-5 w-5 text-primary" />
                        </span>
                        <CardTitle>{req.os}</CardTitle>
                      </div>
                      <CardDescription className="mt-2">Minimum supported configuration</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5">
                        {req.specs.map((spec) => (
                          <li key={spec} className="flex items-start gap-2.5 mkt-body text-muted-foreground">
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

            <p className="mkt-small text-muted-foreground text-center mt-10">
              All builds are code-signed and notarized · automatic background updates
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="mkt-h2 font-bold tracking-tight mb-4">Bring E-Code everywhere you build</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
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
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
