import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Code2,
  Compass,
  FileText,
  Globe2,
  Handshake,
  HeartHandshake,
  Layers,
  Megaphone,
  MonitorPlay,
  MonitorSmartphone,
  Palette,
  Newspaper,
  PlayCircle,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link, useParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  getMarketingFigureCopy,
  getMarketingPageCopy,
  getMarketingUiCopy,
  formatMarketingPageTitle,
  marketingAuxiliaryPageCopyEn,
  marketingPageCopyEn,
  marketingSolutionCardCopyEn,
  missingMarketingCatalogEntryError,
} from '~/lib/i18n/catalogs/marketing';
import { socialMetaTags } from '~/utils/social-meta';

type MarketingPageKind = 'standard' | 'legal' | 'solution' | 'compare' | 'resource';

export interface MarketingPageDefinition {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  kind: MarketingPageKind;
  icon: LucideIcon;
  primaryAction?: readonly [label: string, to: string];
  secondaryAction?: readonly [label: string, to: string];
  highlights: readonly string[];
  sections: readonly {
    title: string;
    body: string;
    items: readonly string[];
  }[];
}

const PRODUCT_BASE = '/ecode-static/assets/product';

/**
 * Maps a marketing page slug to a real product capture plus a caption.
 * Only slugs with a genuinely representative screenshot are listed; everything
 * else renders without a figure rather than forcing an unrelated image.
 */
const productFigures: Record<string, { src: string }> = {
  product: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  features: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  demo: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  ai: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  desktop: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  mobile: {
    src: `${PRODUCT_BASE}/mobile.png`,
  },
  deployments: {
    src: `${PRODUCT_BASE}/ide-deploy.png`,
  },
  'dashboard-builder': {
    src: `${PRODUCT_BASE}/dashboard.png`,
  },
  'app-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  'website-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  'game-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  'chatbot-builder': {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  'internal-ai-builder': {
    src: `${PRODUCT_BASE}/ide-git.png`,
  },
  enterprise: {
    src: `${PRODUCT_BASE}/ide-deploy.png`,
  },
  startups: {
    src: `${PRODUCT_BASE}/ide.png`,
  },
  freelancers: {
    src: `${PRODUCT_BASE}/ide-git.png`,
  },
};

type MarketingPageChrome = {
  kind: MarketingPageKind;
  icon: LucideIcon;
  primaryActionTo?: string;
  secondaryActionTo?: string;
};

const marketingPageChrome = {
  product: { kind: 'standard', icon: Layers, primaryActionTo: '/features', secondaryActionTo: '/pricing' },
  features: { kind: 'standard', icon: MonitorPlay, primaryActionTo: '/signup', secondaryActionTo: '/compare' },
  about: { kind: 'standard', icon: Building2, primaryActionTo: '/signup', secondaryActionTo: '/contact-sales' },
  careers: { kind: 'standard', icon: BriefcaseBusiness, primaryActionTo: '/contact', secondaryActionTo: '/about' },
  blog: { kind: 'resource', icon: Newspaper, primaryActionTo: '/changelog', secondaryActionTo: '/docs' },
  docs: { kind: 'resource', icon: BookOpen, primaryActionTo: '/signup', secondaryActionTo: '/ai-documentation' },
  contact: { kind: 'standard', icon: HeartHandshake, primaryActionTo: '/contact-sales', secondaryActionTo: '/support' },
  partners: { kind: 'standard', icon: Handshake, primaryActionTo: '/contact', secondaryActionTo: '/partners' },
  press: { kind: 'standard', icon: Megaphone, primaryActionTo: '/contact', secondaryActionTo: '/about' },
  accessibility: { kind: 'legal', icon: Users, primaryActionTo: '/contact', secondaryActionTo: '/acceptable-use' },
  mobile: { kind: 'standard', icon: MonitorSmartphone, primaryActionTo: '/signup', secondaryActionTo: '/templates' },
  desktop: { kind: 'standard', icon: TerminalSquare, primaryActionTo: '/signup', secondaryActionTo: '/docs' },
  languages: { kind: 'resource', icon: Code2, primaryActionTo: '/templates', secondaryActionTo: '/docs' },
  tutorials: { kind: 'resource', icon: BookOpen, primaryActionTo: '/docs', secondaryActionTo: '/templates' },
  'case-studies': { kind: 'resource', icon: Layers, primaryActionTo: '/contact-sales', secondaryActionTo: '/partners' },
  customers: { kind: 'resource', icon: Users, primaryActionTo: '/case-studies', secondaryActionTo: '/contact-sales' },
  'help-center': { kind: 'resource', icon: HeartHandshake, primaryActionTo: '/support', secondaryActionTo: '/docs' },
  forum: { kind: 'resource', icon: Users, primaryActionTo: '/support', secondaryActionTo: '/templates' },
  ai: { kind: 'standard', icon: Sparkles, primaryActionTo: '/signup', secondaryActionTo: '/ai-documentation' },
  'ai-documentation': {
    kind: 'resource',
    icon: BookOpen,
    primaryActionTo: '/docs#agent-walkthrough',
    secondaryActionTo: '/signup',
  },
  mcp: { kind: 'standard', icon: Globe2, primaryActionTo: '/docs', secondaryActionTo: '/contact-sales' },
  polyglot: { kind: 'standard', icon: Code2, primaryActionTo: '/templates', secondaryActionTo: '/docs' },
  dpa: { kind: 'legal', icon: FileText, primaryActionTo: '/contact-sales', secondaryActionTo: '/privacy' },
  'commercial-agreement': {
    kind: 'legal',
    icon: Scale,
    primaryActionTo: '/contact-sales',
    secondaryActionTo: '/terms',
  },
  'report-abuse': {
    kind: 'legal',
    icon: ShieldCheck,
    primaryActionTo: '/support',
    secondaryActionTo: '/acceptable-use',
  },
  subprocessors: { kind: 'legal', icon: Globe2, primaryActionTo: '/contact-sales', secondaryActionTo: '/dpa' },
  'student-dpa': { kind: 'legal', icon: FileText, primaryActionTo: '/contact-sales', secondaryActionTo: '/privacy' },
  marketplace: {
    kind: 'resource',
    icon: Layers,
    primaryActionTo: '/templates',
    secondaryActionTo: '/solutions/app-builder',
  },
  community: { kind: 'resource', icon: Users, primaryActionTo: '/forum', secondaryActionTo: '/marketplace' },
  explore: { kind: 'resource', icon: Compass, primaryActionTo: '/templates', secondaryActionTo: '/features' },
  search: { kind: 'resource', icon: Search, primaryActionTo: '/templates', secondaryActionTo: '/docs' },
  demo: { kind: 'standard', icon: MonitorPlay, primaryActionTo: '/signup', secondaryActionTo: '/features' },
  'theme-validation': {
    kind: 'resource',
    icon: Palette,
    primaryActionTo: '/accessibility',
    secondaryActionTo: '/features',
  },
  'runtime-test': { kind: 'resource', icon: TerminalSquare, primaryActionTo: '/status', secondaryActionTo: '/docs' },

  /*
   * `enterprise` copy exists only for the localizer (getMarketingPageCopy); the
   * /enterprise route renders solutionPages.enterprise, so it is not a catalog page here.
   */
} as const satisfies Record<Exclude<keyof typeof marketingPageCopyEn, 'enterprise'>, MarketingPageChrome>;

type CatalogMarketingPageKey = keyof typeof marketingPageChrome;

function makeCatalogMarketingPage(slug: CatalogMarketingPageKey, language: string = 'en'): MarketingPageDefinition {
  const chrome = marketingPageChrome[slug];
  const copy = getMarketingPageCopy(slug, language);

  if (!copy) {
    throw missingMarketingCatalogEntryError('page', slug);
  }

  return {
    slug,
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    kind: chrome.kind,
    icon: chrome.icon,
    primaryAction:
      copy.primaryActionLabel && chrome.primaryActionTo
        ? ([copy.primaryActionLabel, chrome.primaryActionTo] as const)
        : undefined,
    secondaryAction:
      copy.secondaryActionLabel && chrome.secondaryActionTo
        ? ([copy.secondaryActionLabel, chrome.secondaryActionTo] as const)
        : undefined,
    highlights: copy.highlights,
    sections: copy.sections,
  };
}

export const marketingPages = Object.fromEntries(
  (Object.keys(marketingPageChrome) as CatalogMarketingPageKey[]).map((slug) => [slug, makeCatalogMarketingPage(slug)]),
) as { readonly [Key in CatalogMarketingPageKey]: MarketingPageDefinition };

const solutionPageChrome = {
  kind: 'solution',
  icon: PlayCircle,
  primaryActionTo: '/signup',
  secondaryActionTo: '/contact-sales',
} as const;

/*
 * Enterprise predates the dedicated solution-card catalogue and remains in
 * the main marketing catalogue. Unite both catalogue sources here without
 * duplicating any visible copy in the component.
 */
const solutionPageCopyEn = {
  ...marketingSolutionCardCopyEn,
  enterprise: marketingPageCopyEn.enterprise,
} as const;

function makeCatalogSolutionPage(slug: keyof typeof solutionPageCopyEn): MarketingPageDefinition {
  const copy = solutionPageCopyEn[slug];

  return {
    slug,
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    kind: solutionPageChrome.kind,
    icon: solutionPageChrome.icon,
    primaryAction: copy.primaryActionLabel ? [copy.primaryActionLabel, solutionPageChrome.primaryActionTo] : undefined,
    secondaryAction: copy.secondaryActionLabel
      ? [copy.secondaryActionLabel, solutionPageChrome.secondaryActionTo]
      : undefined,
    highlights: copy.highlights,
    sections: copy.sections,
  };
}

/*
 * The complete EN and FR solution copy already lives in the marketing
 * catalogues. This explicit key registry keeps route typing exact while every
 * visible string still comes from that canonical catalogue.
 */
export const solutionPages = {
  'app-builder': makeCatalogSolutionPage('app-builder'),
  'website-builder': makeCatalogSolutionPage('website-builder'),
  'game-builder': makeCatalogSolutionPage('game-builder'),
  'dashboard-builder': makeCatalogSolutionPage('dashboard-builder'),
  'chatbot-builder': makeCatalogSolutionPage('chatbot-builder'),
  'internal-ai-builder': makeCatalogSolutionPage('internal-ai-builder'),
  enterprise: makeCatalogSolutionPage('enterprise'),
  startups: makeCatalogSolutionPage('startups'),
  freelancers: makeCatalogSolutionPage('freelancers'),
} as const satisfies Record<keyof typeof solutionPageCopyEn, MarketingPageDefinition>;

type AuxiliaryMarketingPageKey = keyof typeof marketingAuxiliaryPageCopyEn;

function makeAuxiliaryMarketingPage(
  slug: AuxiliaryMarketingPageKey,
  chrome: {
    kind: MarketingPageKind;
    icon: LucideIcon;
    primaryActionTo: string;
    secondaryActionTo: string;
  },
): MarketingPageDefinition {
  const copy = getMarketingPageCopy(slug, 'en');

  if (!copy) {
    throw missingMarketingCatalogEntryError('auxiliary', slug);
  }

  return {
    slug,
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    kind: chrome.kind,
    icon: chrome.icon,
    primaryAction: copy.primaryActionLabel ? [copy.primaryActionLabel, chrome.primaryActionTo] : undefined,
    secondaryAction: copy.secondaryActionLabel ? [copy.secondaryActionLabel, chrome.secondaryActionTo] : undefined,
    highlights: copy.highlights,
    sections: copy.sections,
  };
}

const comparePageChrome = {
  'github-codespaces': {
    competitor: 'GitHub Codespaces',
    logoSrc: '/assets/compare/github-codespaces.svg',
  },
  glitch: { competitor: 'Glitch', logoSrc: '/assets/compare/glitch.svg' },
  heroku: { competitor: 'Heroku', logoSrc: '/assets/compare/heroku.svg' },
  codesandbox: { competitor: 'CodeSandbox', logoSrc: '/assets/compare/codesandbox.svg' },
  'aws-cloud9': { competitor: 'AWS Cloud9', logoSrc: '/assets/compare/aws-cloud9.svg' },
} as const;

type ComparePageKey = keyof typeof comparePageChrome;

export const comparePages = Object.fromEntries(
  (Object.keys(comparePageChrome) as ComparePageKey[]).map((slug) => [
    slug,
    {
      ...makeAuxiliaryMarketingPage(slug, {
        kind: 'compare',
        icon: Scale,
        primaryActionTo: '/signup',
        secondaryActionTo: '/compare',
      }),
      ...comparePageChrome[slug],
    },
  ]),
) as {
  readonly [Key in ComparePageKey]: MarketingPageDefinition & { logoSrc: string; competitor: string };
};

const campaignPageKeys = ['bounties', 'deployments', 'teams'] as const;
type CampaignPageKey = (typeof campaignPageKeys)[number];

export const marketingCampaignPages = Object.fromEntries(
  campaignPageKeys.map((slug) => [
    slug,
    makeAuxiliaryMarketingPage(slug, {
      kind: 'standard',
      icon: Sparkles,
      primaryActionTo: '/signup',
      secondaryActionTo: '/contact-sales',
    }),
  ]),
) as { readonly [Key in CampaignPageKey]: MarketingPageDefinition };

const newsletterPageChrome = {
  index: {
    slug: 'newsletter',
    icon: Newspaper,
    primaryActionTo: '/newsletter/confirm',
    secondaryActionTo: '/changelog',
  },
  confirmed: {
    slug: 'confirmed',
    icon: CheckCircle2,
    primaryActionTo: '/changelog',
    secondaryActionTo: '/signup',
  },
  confirm: {
    slug: 'confirm',
    icon: CheckCircle2,
    primaryActionTo: '/newsletter-confirmed',
    secondaryActionTo: '/',
  },
  unsubscribe: {
    slug: 'unsubscribe',
    icon: FileText,
    primaryActionTo: '/newsletter-confirmed',
    secondaryActionTo: '/',
  },
} as const satisfies Record<
  string,
  {
    slug: AuxiliaryMarketingPageKey;
    icon: LucideIcon;
    primaryActionTo: string;
    secondaryActionTo: string;
  }
>;

type NewsletterPageKey = keyof typeof newsletterPageChrome;

export const newsletterPages = Object.fromEntries(
  (Object.keys(newsletterPageChrome) as NewsletterPageKey[]).map((key) => {
    const chrome = newsletterPageChrome[key];

    return [
      key,
      makeAuxiliaryMarketingPage(chrome.slug, {
        kind: 'resource',
        icon: chrome.icon,
        primaryActionTo: chrome.primaryActionTo,
        secondaryActionTo: chrome.secondaryActionTo,
      }),
    ];
  }),
) as { readonly [Key in NewsletterPageKey]: MarketingPageDefinition };

export function localizeMarketingPage(
  page: MarketingPageDefinition,
  language?: string | null,
): MarketingPageDefinition {
  const copy = getMarketingPageCopy(page.slug, language);

  if (!copy) {
    return page;
  }

  return {
    ...page,
    title: copy.title,
    eyebrow: copy.eyebrow,
    description: copy.description,
    primaryAction:
      page.primaryAction && copy.primaryActionLabel
        ? ([copy.primaryActionLabel, page.primaryAction[1]] as const)
        : page.primaryAction,
    secondaryAction:
      page.secondaryAction && copy.secondaryActionLabel
        ? ([copy.secondaryActionLabel, page.secondaryAction[1]] as const)
        : page.secondaryAction,
    highlights: copy.highlights,
    sections: copy.sections,
  };
}

export function makeMarketingMeta(page: MarketingPageDefinition): MetaFunction {
  /*
   * BUG-MKT-003 : le canonical est dérivé de `location.pathname`, jamais d'un
   * chemin recopié. Un canonical FAUX est pire qu'absent — il désigne
   * explicitement la mauvaise page aux moteurs — et une table de correspondance
   * écrite à la main dérive au premier renommage de route.
   */
  return ({ data, location, matches }) => {
    const routeLanguage = (data as { language?: string } | undefined)?.language;

    const rootLanguage = (matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined)
      ?.language;

    const localizedPage = localizeMarketingPage(page, routeLanguage ?? rootLanguage);

    return [
      { title: formatMarketingPageTitle(localizedPage.title) },
      { name: 'description', content: localizedPage.description },
      ...socialMetaTags({
        title: formatMarketingPageTitle(localizedPage.title),
        description: localizedPage.description,
        path: location?.pathname,
      }),
    ];
  };
}

export function MarketingStaticPage({ page }: { page: MarketingPageDefinition }) {
  const { i18n } = useTranslation();
  const localizedPage = localizeMarketingPage(page, i18n.resolvedLanguage ?? i18n.language);

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page={page.slug}>
        <MarketingPageContent page={localizedPage} />
      </main>
    </PublicShell>
  );
}

export function MarketingDynamicPage({
  pages,
  fallbackTitle,
}: {
  pages: Record<string, MarketingPageDefinition>;
  fallbackTitle: string;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const ui = getMarketingUiCopy(language);
  const params = useParams();
  const slug = params.slug ?? '';
  const page = pages[slug];

  if (!page) {
    throw new Response(ui.pageNotFound(fallbackTitle), { status: 404 });
  }

  return <MarketingStaticPage page={page} />;
}

export function MarketingIndexPage({
  title,
  description,
  pages,
}: {
  title: string;
  description: string;
  pages: Record<string, MarketingPageDefinition>;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const ui = getMarketingUiCopy(language);
  const localizedPages = Object.values(pages).map((page) => localizeMarketingPage(page, language));

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="index">
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative py-20 sm:py-28">
            <div className="max-w-4xl">
              <span className="inline-flex items-center rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent-text)]">
                E-Code
              </span>
              <h1 className="mkt-h1 mt-8 max-w-4xl text-[var(--ecode-text)]">{title}</h1>
              <p className="mkt-lead mt-6 max-w-3xl text-[var(--ecode-text-secondary)]">{description}</p>
            </div>
          </div>
        </section>

        <section className="container-responsive py-16 sm:py-24">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {localizedPages.map((page) => {
              const Icon = page.icon;

              return (
                <Link
                  key={page.slug}
                  to={routeForPage(page)}
                  className="group flex min-h-[15rem] flex-col rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 text-[var(--ecode-text)] no-underline transition hover:-translate-y-1 hover:border-[var(--ecode-accent)] hover:shadow-xl"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ecode-surface-secondary)] text-[var(--ecode-accent)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <strong className="mt-5 text-xl font-bold tracking-tight">{page.title}</strong>
                  <small className="mt-3 text-[14px] leading-6 text-[var(--ecode-text-secondary)]">
                    {page.description}
                  </small>
                  <span className="mt-auto inline-flex items-center pt-7 text-[13px] font-semibold text-[var(--ecode-accent)]">
                    {ui.viewPage}
                    <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-t border-[var(--ecode-border)]" aria-label={ui.pageCtaLabel(title)}>
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
            <div className="container-responsive relative flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-[var(--ecode-text)] sm:text-4xl">
                  {ui.indexCtaTitle}
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)] sm:text-base">
                  {ui.indexCtaBody}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <EcodeMarketingActionLink to="/signup">{ui.startBuilding}</EcodeMarketingActionLink>
                <EcodeMarketingActionLink to="/contact-sales" variant="secondary">
                  {ui.contactSales}
                </EcodeMarketingActionLink>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

function MarketingPageContent({ page }: { page: MarketingPageDefinition }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const ui = getMarketingUiCopy(language);
  const Icon = page.icon;

  const compare =
    'logoSrc' in page ? (page as MarketingPageDefinition & { logoSrc: string; competitor: string }) : null;

  const figureAsset = productFigures[page.slug];
  const figureCopy = getMarketingFigureCopy(page.slug, language);
  const figure = figureAsset && figureCopy ? { ...figureAsset, ...figureCopy } : null;

  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
        <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
        <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
        <div className="container-responsive relative py-20 sm:py-28">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent-text)]">
              <Icon className="h-4 w-4" aria-hidden />
              {page.eyebrow}
            </span>
            <h1 className="mkt-h1 mt-8 max-w-4xl text-[var(--ecode-text)]">{page.title}</h1>
            <p className="mkt-lead mt-6 max-w-3xl text-[var(--ecode-text-secondary)]">{page.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {page.primaryAction ? (
                <EcodeMarketingActionLink to={page.primaryAction[1]}>{page.primaryAction[0]}</EcodeMarketingActionLink>
              ) : null}
              {page.secondaryAction ? (
                <EcodeMarketingActionLink to={page.secondaryAction[1]} variant="secondary">
                  {page.secondaryAction[0]}
                </EcodeMarketingActionLink>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="container-responsive py-16 sm:py-24" aria-label={ui.pageHighlightsLabel(page.title)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.highlights.map((highlight) => (
            <div
              key={highlight}
              className="flex min-h-[4.75rem] items-center gap-3 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-4 text-[14px] font-medium text-[var(--ecode-text)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
              <span>{highlight}</span>
            </div>
          ))}
        </div>
      </section>

      {compare ? (
        <section className="container-responsive pb-6" aria-label={ui.compareLabel(compare.competitor)}>
          <div className="grid gap-5 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <img
              src={compare.logoSrc}
              alt={ui.competitorLogoAlt(compare.competitor)}
              className="h-16 w-16 object-contain"
              loading="lazy"
              decoding="async"
            />
            <div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--ecode-text-muted)]">
                {ui.comparedWithLabel(compare.competitor)}
              </span>
              <strong className="mt-2 block text-xl font-bold leading-8 text-[var(--ecode-text)]">
                {ui.comparePitch}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      {figure ? (
        <section className="container-responsive pb-16 sm:pb-24" aria-label={ui.productPreviewLabel(page.title)}>
          <figure className="overflow-hidden rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-accent)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-border)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--ecode-border)]" aria-hidden />
            </div>
            <img
              src={figure.src}
              alt={figure.alt}
              className="block h-auto w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="border-t border-[var(--ecode-border)] px-5 py-4 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
              {figure.caption}
            </figcaption>
          </figure>
        </section>
      ) : null}

      <section className="container-responsive grid gap-5 pb-20 sm:pb-28 lg:grid-cols-2">
        {page.sections.map((section) => (
          <article
            key={section.title}
            className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-7"
          >
            <h2 className="text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{section.title}</h2>
            <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">{section.body}</p>
            <ul className="mt-6 grid gap-3">
              {section.items.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-[var(--ecode-text)]">
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="border-t border-[var(--ecode-border)]" aria-label={ui.pageCtaLabel(page.title)}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="container-responsive relative flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[var(--ecode-text)] sm:text-4xl">
                {ui.pageCtaTitle}
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)] sm:text-base">
                {ui.pageCtaBody}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <EcodeMarketingActionLink to={page.primaryAction?.[1] ?? '/signup'}>
                {page.primaryAction?.[0] ?? ui.startBuilding}
              </EcodeMarketingActionLink>
              <EcodeMarketingActionLink to={page.secondaryAction?.[1] ?? '/contact-sales'} variant="secondary">
                {page.secondaryAction?.[0] ?? ui.contactSales}
              </EcodeMarketingActionLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function EcodeMarketingActionLink({
  children,
  to,
  variant = 'primary',
}: {
  children: ReactNode;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  const className =
    variant === 'primary'
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--vc-action-primary-strong)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-90'
      : 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--ecode-border)] bg-transparent px-5 py-3 text-[13px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]';

  if (/^(https?:)?\/\//.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {children}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Link>
  );
}

function routeForPage(page: MarketingPageDefinition) {
  if (page.kind === 'solution') {
    return `/solutions/${page.slug}`;
  }

  if (page.kind === 'compare') {
    return `/compare/${page.slug}`;
  }

  return `/${page.slug}`;
}
