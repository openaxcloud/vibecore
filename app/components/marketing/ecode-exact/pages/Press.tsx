import {
  ArrowRight,
  BookOpen,
  Bot,
  Camera,
  Cloud,
  GitBranch,
  Image as ImageIcon,
  Mail,
  Newspaper,
  Palette,
  Smartphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { SiNodedotjs, SiReact, SiTypescript, SiVite } from 'react-icons/si';

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
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { PRESS_CONTACT_EMAIL, PRESS_CONTACT_MAILTO } from '~/components/marketing/ecode-exact/pages/press-contact';
import {
  getMarketingExactTrustPressCopy,
  type PressBrandAssetId,
  type PressPlatformFactId,
  type PressProductShotId,
  type PressStoryAngleId,
  type PressTechnologyId,
} from '~/lib/i18n/catalogs/marketing-exact-trust-press';

const ACCENT = 'var(--ecode-accent)';

const PRESS_BRAND_ICONS: Record<PressBrandAssetId, LucideIcon> = {
  mark: ImageIcon,
  wordmark: Newspaper,
  colors: Palette,
  guidelines: BookOpen,
};

const PRESS_FACT_ICONS: Record<PressPlatformFactId, LucideIcon> = {
  category: Bot,
  runtime: Cloud,
  workflow: GitBranch,
  reach: Smartphone,
};

const PRESS_STORY_ICONS: Record<PressStoryAngleId, LucideIcon> = {
  agents: Bot,
  cloud: Cloud,
  delivery: GitBranch,
};

const PRESS_PRODUCT_MEDIA: Record<PressProductShotId, string> = {
  ide: '/ecode-static/assets/product/ide.png',
  git: '/ecode-static/assets/product/ide-git.png',
  deploy: '/ecode-static/assets/product/ide-deploy.png',
  dashboard: '/ecode-static/assets/product/dashboard.png',
};

const PRESS_TECH_ICONS: Record<PressTechnologyId, IconType> = {
  react: SiReact,
  typescript: SiTypescript,
  vite: SiVite,
  node: SiNodedotjs,
};

export default function Press() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactTrustPressCopy(i18n.resolvedLanguage ?? i18n.language).exactPress;

  const brandAssets = copy.brand.items.map((asset) => ({ ...asset, icon: PRESS_BRAND_ICONS[asset.id] }));
  const platformFacts = copy.facts.items.map((fact) => ({ ...fact, icon: PRESS_FACT_ICONS[fact.id] }));
  const storyAngles = copy.stories.items.map((story) => ({ ...story, icon: PRESS_STORY_ICONS[story.id] }));
  const productShots = copy.screenshots.items.map((shot) => ({ ...shot, src: PRESS_PRODUCT_MEDIA[shot.id] }));

  const technologies = copy.about.technologies.map((technology) => ({
    ...technology,
    icon: PRESS_TECH_ICONS[technology.id],
  }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-press">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span
                className="inline-flex h-14 w-14 items-center justify-center rounded-xl mb-5"
                style={{ backgroundColor: ACCENT }}
              >
                <Newspaper className="h-7 w-7 text-white" aria-hidden />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-press">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">{copy.hero.description}</p>
              <Badge
                variant="secondary"
                className="inline-flex max-w-full whitespace-normal px-4 py-2 text-center text-[15px]"
              >
                {copy.hero.badge}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 text-center sm:text-left">
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Mail className="h-5 w-5 text-white" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="mkt-h3 font-semibold">{copy.contact.title}</h2>
                      <p className="mkt-small text-muted-foreground">{copy.contact.description}</p>
                    </div>
                  </div>
                  <a
                    href={PRESS_CONTACT_MAILTO}
                    className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-md px-6 py-3 font-medium text-white break-all"
                    style={{ backgroundColor: ACCENT }}
                    data-testid="link-press-contact"
                  >
                    {PRESS_CONTACT_EMAIL}
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                style={{ backgroundColor: ACCENT }}
              >
                <Camera className="h-5 w-5 text-white" aria-hidden />
              </span>
              <h2 className="mkt-h2 font-bold mb-4">{copy.screenshots.title}</h2>
              <p className="mkt-body text-muted-foreground">{copy.screenshots.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {productShots.map((shot) => (
                <figure
                  key={shot.id}
                  className="rounded-xl overflow-hidden border border-border bg-background shadow-sm"
                >
                  <img
                    src={shot.src}
                    alt={shot.imageAlt}
                    loading="lazy"
                    className="w-full aspect-video object-cover object-top"
                  />
                  <figcaption className="px-4 py-3 mkt-small text-muted-foreground border-t border-border">
                    {shot.label}
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="max-w-5xl mx-auto mt-6">
              <figure className="rounded-xl overflow-hidden border border-border bg-background shadow-sm max-w-xs mx-auto">
                <img
                  src="/ecode-static/assets/product/mobile.png"
                  alt={copy.screenshots.mobile.imageAlt}
                  loading="lazy"
                  className="w-full object-cover object-top"
                />
                <figcaption className="px-4 py-3 mkt-small text-muted-foreground border-t border-border text-center">
                  {copy.screenshots.mobile.label}
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">{copy.brand.title}</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              {copy.brand.description}
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {brandAssets.map((asset) => {
                const Icon = asset.icon;

                return (
                  <Card key={asset.id} className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-center h-24 mb-4 rounded-md bg-muted border border-border">
                        <Icon className="h-9 w-9" style={{ color: ACCENT }} aria-hidden />
                      </div>
                      <h3 className="mkt-h3 font-semibold mb-1">{asset.name}</h3>
                      <p className="mkt-small text-muted-foreground mb-3">{asset.description}</p>
                      <span className="mkt-small font-medium text-muted-foreground">{asset.format}</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">{copy.stories.title}</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              {copy.stories.description}
            </p>

            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {storyAngles.map((story) => {
                const Icon = story.icon;

                return (
                  <Card key={story.id} className="h-full">
                    <CardContent className="p-6">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="h-5 w-5 text-white" aria-hidden />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{story.title}</h3>
                      <p className="mkt-body text-muted-foreground leading-relaxed">{story.body}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.facts.title}</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {platformFacts.map((fact) => {
                const Icon = fact.icon;

                return (
                  <Card key={fact.id} className="h-full">
                    <CardContent className="pt-6 text-center">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg mx-auto mb-4"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Icon className="h-5 w-5 text-white" aria-hidden />
                      </span>
                      <h3 className="mkt-small text-muted-foreground mb-1">{fact.label}</h3>
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
                    <span
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Bot className="h-4 w-4 text-white" aria-hidden />
                    </span>
                    {copy.about.title}
                  </CardTitle>
                  <CardDescription>{copy.about.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mkt-body text-muted-foreground leading-relaxed">{copy.about.body}</p>
                  <div className="mt-6 pt-6 border-t border-border">
                    <p className="mkt-small font-medium text-muted-foreground uppercase tracking-wide mb-3">
                      {copy.about.builtOn}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {technologies.map((technology) => {
                        const Icon = technology.icon;

                        return (
                          <span
                            key={technology.id}
                            className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-[13px] font-medium"
                          >
                            <Icon className="h-4 w-4" style={{ color: ACCENT }} aria-hidden />
                            {technology.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div
              className="max-w-5xl mx-auto rounded-2xl px-6 sm:px-8 py-12 text-center"
              style={{
                background: `linear-gradient(135deg, ${ACCENT} 0%, var(--ecode-accent-2, #F99D25) 100%)`,
              }}
            >
              <h2 className="mkt-h2 font-bold text-white mb-3">{copy.cta.title}</h2>
              <p className="text-white/90 mkt-lead max-w-2xl mx-auto mb-8">{copy.cta.description}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/signup"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[48px] px-7 rounded-md bg-white font-semibold text-[15px]"
                  style={{ color: ACCENT }}
                  data-testid="cta-press-signup"
                >
                  {copy.cta.primary}
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
                <a
                  href={PRESS_CONTACT_MAILTO}
                  className="inline-flex w-full sm:w-auto items-center justify-center min-h-[48px] px-7 rounded-md border border-white/70 text-white font-semibold text-[15px] hover:bg-white/10 transition-colors"
                >
                  {copy.cta.secondary}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
