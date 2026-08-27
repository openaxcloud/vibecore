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
import { useTranslation } from 'react-i18next';
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
import {
  getMarketingExactStatusDesktopCopy,
  interpolateMarketingExactStatusDesktopCopy,
  type DesktopCapabilityId,
  type DesktopGitPointId,
  type DesktopOperatingSystemId,
} from '~/lib/i18n/catalogs/marketing-exact-status-desktop';

const PRODUCT = '/ecode-static/assets/product';

const DESKTOP_DOWNLOAD_MEDIA: Record<DesktopOperatingSystemId, { os: string; icon: IconType; file: string }> = {
  macos: { os: 'macOS', icon: SiApple, file: 'E-Code.dmg' },
  windows: { os: 'Windows', icon: Monitor, file: 'E-Code-Setup.exe' },
  linux: { os: 'Linux', icon: SiLinux, file: 'E-Code.AppImage' },
};

const PRIMARY_DESKTOP_DOWNLOAD = DESKTOP_DOWNLOAD_MEDIA.macos;

const DESKTOP_CAPABILITY_ICONS: Record<DesktopCapabilityId, LucideIcon> = {
  nativeIde: PanelsTopLeft,
  performance: Zap,
  offline: WifiOff,
  workspaces: Cloud,
  integration: HardDrive,
  multiWindow: Layers,
};

const DESKTOP_REQUIREMENT_ICONS: Record<DesktopOperatingSystemId, LucideIcon> = {
  macos: Command,
  windows: Monitor,
  linux: Terminal,
};

const DESKTOP_GIT_ICONS: Record<DesktopGitPointId, LucideIcon> = {
  staging: FolderGit2,
  branches: GitBranch,
  sync: RefreshCw,
};

/** Frames real product screenshots with recognizable desktop-window chrome. */
function WindowFrame({
  title,
  src,
  alt,
  priority = false,
  technicalTitle = false,
}: {
  title: string;
  src: string;
  alt: string;
  priority?: boolean;
  technicalTitle?: boolean;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span
          className="mx-auto min-w-0 truncate px-3 text-[12px] font-medium text-muted-foreground"
          data-i18n-audit-ignore={technicalTitle ? true : undefined}
        >
          {title}
        </span>
        <span className="h-3 w-3" aria-hidden="true" />
      </div>
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto" />
    </div>
  );
}

export default function Desktop() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactStatusDesktopCopy(i18n.resolvedLanguage ?? i18n.language).exactDesktop;

  const downloads = copy.downloads.items.map((download) => ({
    ...download,
    ...DESKTOP_DOWNLOAD_MEDIA[download.id],
  }));
  const capabilities = copy.capabilities.items.map((capability) => ({
    ...capability,
    icon: DESKTOP_CAPABILITY_ICONS[capability.id],
  }));
  const requirements = copy.requirements.items.map((requirement) => ({
    ...requirement,
    ...DESKTOP_DOWNLOAD_MEDIA[requirement.id],
    icon: DESKTOP_REQUIREMENT_ICONS[requirement.id],
  }));

  const gitPoints = copy.git.points.map((point) => ({ ...point, icon: DESKTOP_GIT_ICONS[point.id] }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-desktop">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
              <Badge
                variant="secondary"
                className="max-w-full text-center text-[12px] font-medium px-3 py-1 mb-6 inline-flex items-center gap-1.5 whitespace-normal"
              >
                <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {copy.hero.badge}
              </Badge>
              <h1 className="mkt-h1 font-bold tracking-tight leading-tight mb-5" data-testid="heading-desktop">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground leading-relaxed mb-8 max-w-2xl">{copy.hero.description}</p>
              <a
                href={desktopDownloadUrl(PRIMARY_DESKTOP_DOWNLOAD.file)}
                download
                className="inline-flex w-full max-w-sm sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
                data-testid="button-hero-download"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                {interpolateMarketingExactStatusDesktopCopy(copy.hero.downloadTemplate, {
                  os: PRIMARY_DESKTOP_DOWNLOAD.os,
                })}
              </a>
            </div>

            <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
              <WindowFrame
                title={copy.showcase.windowTitle}
                src={`${PRODUCT}/ide.png`}
                alt={copy.showcase.imageAlt}
                priority
                technicalTitle
              />
              <p className="mkt-small text-muted-foreground text-center mt-4">{copy.showcase.caption}</p>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">{copy.downloads.title}</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">{copy.downloads.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {downloads.map((download) => {
                const Icon = download.icon;

                return (
                  <Card key={download.id} className="flex flex-col">
                    <CardContent className="pt-8 pb-6 px-6 text-center flex flex-col items-center flex-1">
                      <span className="flex items-center justify-center h-14 w-14 rounded-xl bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor mb-5">
                        <Icon className="h-7 w-7 text-primary" aria-hidden />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-1.5">
                        {interpolateMarketingExactStatusDesktopCopy(copy.downloads.cardTitleTemplate, {
                          os: download.os,
                        })}
                      </h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed mb-6">{download.hint}</p>
                      <a
                        href={desktopDownloadUrl(download.file)}
                        download
                        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity mt-auto"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                        data-testid={`button-download-${download.os.toLowerCase()}`}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        {download.os}
                      </a>
                      <p className="mkt-small text-muted-foreground mt-3 font-mono break-all">{download.file}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">{copy.capabilities.title}</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">{copy.capabilities.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {capabilities.map((capability) => {
                const Icon = capability.icon;

                return (
                  <Card key={capability.id} className="h-full">
                    <CardContent className="pt-6 px-6 pb-6">
                      <span className="flex items-center justify-center h-11 w-11 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor mb-4">
                        <Icon className="h-5 w-5 text-primary" aria-hidden />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{capability.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{capability.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center max-w-6xl mx-auto">
              <div>
                <Badge
                  variant="secondary"
                  className="max-w-full whitespace-normal text-[12px] font-medium px-3 py-1 mb-5 inline-flex items-center gap-1.5"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {copy.git.badge}
                </Badge>
                <h2 className="mkt-h2 font-bold tracking-tight leading-tight mb-4">{copy.git.title}</h2>
                <p className="mkt-lead text-muted-foreground leading-relaxed mb-6">{copy.git.description}</p>
                <ul className="space-y-3">
                  {gitPoints.map((point) => {
                    const Icon = point.icon;

                    return (
                      <li key={point.id} className="flex items-start gap-3 mkt-body">
                        <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" aria-hidden />
                        <span>{point.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <WindowFrame title={copy.git.windowTitle} src={`${PRODUCT}/ide-git.png`} alt={copy.git.imageAlt} />
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight mb-3">{copy.requirements.title}</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed">{copy.requirements.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {requirements.map((requirement) => {
                const Icon = requirement.icon;

                return (
                  <Card key={requirement.id} className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
                          <Icon className="h-5 w-5 text-primary" aria-hidden />
                        </span>
                        <CardTitle>{requirement.os}</CardTitle>
                      </div>
                      <CardDescription className="mt-2">{copy.requirements.minimum}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5">
                        {requirement.specs.map((specification) => (
                          <li key={specification} className="flex items-start gap-2.5 mkt-body text-muted-foreground">
                            <Cpu className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" aria-hidden />
                            <span>{specification}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="mkt-small text-muted-foreground text-center mt-10">{copy.requirements.footer}</p>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="mkt-h2 font-bold tracking-tight mb-4">{copy.cta.title}</h2>
              <p className="mkt-lead text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
                {copy.cta.description}
              </p>
              <a
                href={desktopDownloadUrl(PRIMARY_DESKTOP_DOWNLOAD.file)}
                download
                className="inline-flex w-full max-w-sm sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
                data-testid="button-desktop-cta"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                {copy.cta.button}
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
