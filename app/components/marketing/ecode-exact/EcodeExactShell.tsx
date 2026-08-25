import { useStore } from '@nanostores/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  ChevronRight,
  Github,
  Globe2,
  Instagram,
  Linkedin,
  LogIn,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Twitter,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { Badge, Button, cn, Link, useMarketingNavigate, useWouterLocation } from './EcodeExactUi';
import { publicChromeUserChoseDark, resolvePublicChromeTheme } from './ecode-public-theme';
import {
  MARKETING_SHELL_COPY,
  MARKETING_SHELL_FOOTER_SECTIONS,
  MARKETING_SHELL_LINKS,
  MARKETING_SHELL_NAV_SECTIONS,
  MARKETING_SHELL_SOCIAL_LINKS,
  interpolateMarketingShellCopy,
  type MarketingShellCopy,
  type MarketingShellFooterSectionId,
  type MarketingShellNavItemId,
  type MarketingShellNavSectionId,
  type MarketingShellSocialId,
} from './marketing-shell.copy';
import { getThemeSwitcherPresentation } from './theme-switcher-presentation';
import { LanguageSwitch } from '~/components/i18n/LanguageSwitch';
import {
  persistAnnouncementDismissed,
  readAnnouncementDismissed,
} from '~/components/marketing/ecode-exact/announcement';
import { CloseButton } from '~/components/ui/CloseButton';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { SkipLink } from '~/components/ui/SkipLink';
import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { applyThemeToDocument, kTheme, resolveInitialTheme, themeStore, toggleTheme } from '~/lib/stores/theme';
import type { Theme } from '~/lib/stores/theme';
import { readThemeCookie } from '~/lib/stores/theme-cookie';

type MenuItem = {
  id: MarketingShellNavItemId;
  title: string;
  href: string;
  description: string;
};

type FooterLink = {
  id: (typeof MARKETING_SHELL_FOOTER_SECTIONS)[MarketingShellFooterSectionId][number];
  label: string;
  href: string;
};

const MOBILE_MENU_SECTION_PRESENTATION = {
  product: { icon: Sparkles, iconClassName: 'text-ecode-accent', bordered: false },
  solutions: { icon: ArrowUpRight, iconClassName: 'text-[var(--ecode-accent)]', bordered: true },
  resources: { icon: Search, iconClassName: 'text-[var(--ecode-accent)]', bordered: true },
  company: { icon: ChevronRight, iconClassName: 'text-[var(--ecode-accent)]', bordered: true },
} as const satisfies Record<
  MarketingShellNavSectionId,
  Readonly<{ icon: LucideIcon; iconClassName: string; bordered: boolean }>
>;

const SOCIAL_ICONS = {
  twitter: Twitter,
  github: Github,
  linkedin: Linkedin,
  instagram: Instagram,
} as const satisfies Record<MarketingShellSocialId, LucideIcon>;

function createMenuItems(copy: MarketingShellCopy, section: MarketingShellNavSectionId): MenuItem[] {
  return MARKETING_SHELL_NAV_SECTIONS[section].map((id) => ({
    id,
    href: MARKETING_SHELL_LINKS[id].href,
    ...copy.navigation.items[id],
  }));
}

function createFooterLinks(copy: MarketingShellCopy, section: MarketingShellFooterSectionId): FooterLink[] {
  return MARKETING_SHELL_FOOTER_SECTIONS[section].map((id) => ({
    id,
    href: MARKETING_SHELL_LINKS[id].href,
    label: copy.footer.linkLabels[id],
  }));
}

const ECODE_PUBLIC_ROOT_FONT_SIZE = '16px';
const ECODE_BRAND_NAME = 'E-Code';

let publicThemeWasManuallyChanged = false;

function useHomepagePublicChrome() {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    /*
     * Resolve the theme from the SHARED source of truth (cross-domain cookie ->
     * per-origin localStorage -> OS preference), exactly like the rest of the app.
     * This makes a dark choice — whether made here, on the app/IDE (carried via
     * the .e-code.ai cookie), or via the OS — govern the marketing chrome too, and
     * survive SPA navigation between marketing pages (each route change remounts
     * this shell; without honoring the resolved theme we would re-force light and
     * revert the user's pick).
     */
    let storedTheme: string | null = null;

    try {
      storedTheme = localStorage.getItem(kTheme);
    } catch {
      storedTheme = null;
    }

    const root = document.documentElement;

    const chromeTheme = resolvePublicChromeTheme(
      resolveInitialTheme({
        cookie: readThemeCookie(),
        stored: storedTheme,
        attribute: root.getAttribute('data-theme'),
        prefersDark:
          typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches,
      }),
    );

    if (publicChromeUserChoseDark(chromeTheme)) {
      publicThemeWasManuallyChanged = true;
    }

    const body = document.body;
    const previousTheme: Theme = themeStore.get();
    const previousRootFontSize = root.style.fontSize;
    const previousBodyFontSize = body.style.fontSize;
    const previousChrome = root.getAttribute('data-ecode-public-chrome');

    root.setAttribute('data-ecode-public-chrome', 'homepage');
    root.style.fontSize = ECODE_PUBLIC_ROOT_FONT_SIZE;
    body.style.fontSize = ECODE_PUBLIC_ROOT_FONT_SIZE;
    themeStore.set(chromeTheme);
    applyThemeToDocument(chromeTheme);

    return () => {
      window.setTimeout(() => {
        if (document.querySelector('[data-ecode-static-shell]')) {
          return;
        }

        if (previousChrome) {
          root.setAttribute('data-ecode-public-chrome', previousChrome);
        } else {
          root.removeAttribute('data-ecode-public-chrome');
        }

        root.style.fontSize = previousRootFontSize;
        body.style.fontSize = previousBodyFontSize;

        if (!publicThemeWasManuallyChanged && themeStore.get() === 'light' && previousTheme !== 'light') {
          themeStore.set(previousTheme);
          applyThemeToDocument(previousTheme);
        }
      }, 0);
    };
  }, []);
}

export function EcodeExactPublicShell({
  children,
  language,
}: {
  children: React.ReactNode;
  language?: SupportedLanguage;
}) {
  useHomepagePublicChrome();

  const { i18n } = useTranslation();
  const activeLanguage = language ?? normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const copy = MARKETING_SHELL_COPY[activeLanguage];
  const direction = activeLanguage === 'ar' ? 'rtl' : 'ltr';

  return (
    <div
      className="min-h-screen flex flex-col bg-background text-foreground"
      data-ecode-static-shell
      lang={activeLanguage}
      dir={direction}
    >
      <SkipLink label={copy.a11y.skipToContent} />
      <EcodeExactPublicNavbar copy={copy} language={activeLanguage} />
      <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </div>
      <EcodeExactPublicFooter copy={copy} />
    </div>
  );
}

export function EcodeLogo({
  className,
  size = 'md',
  showText = true,
}: {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showText?: boolean;
}) {
  const sizeMap = {
    xs: { iconClassName: 'h-6 w-6', textClassName: 'text-base' },
    sm: { iconClassName: 'h-7 w-7', textClassName: 'text-[15px]' },
    md: { iconClassName: 'h-9 w-9', textClassName: 'text-xl' },
    lg: { iconClassName: 'h-11 w-11', textClassName: 'text-2xl' },
  } as const;

  const resolvedSize = sizeMap[size] ?? sizeMap.md;

  return (
    <div dir="ltr" className={cn('flex flex-row items-center gap-2 flex-nowrap whitespace-nowrap', className)}>
      <svg
        className={cn(resolvedSize.iconClassName, 'shrink-0')}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="20" cy="20" r="20" fill="url(#ecode-logo-gradient)" />
        <path
          d="M14 12 L14 20 L14 28 M14 12 L22 12 M14 20 L20 20 M14 28 L22 28"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M26 16 L30 20 L26 24" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="ecode-logo-gradient" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stopColor="var(--ecode-accent)" />
            <stop offset="100%" stopColor="var(--ecode-secondary-accent)" />
          </linearGradient>
        </defs>
      </svg>
      {showText ? <span className={cn('font-bold', resolvedSize.textClassName)}>{ECODE_BRAND_NAME}</span> : null}
    </div>
  );
}

export function EcodeExactPublicNavbar({
  copy: copyOverride,
  language: languageOverride,
}: {
  copy?: MarketingShellCopy;
  language?: SupportedLanguage;
} = {}) {
  const { i18n } = useTranslation();
  const language = languageOverride ?? normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const copy = copyOverride ?? MARKETING_SHELL_COPY[language];
  const navigate = useMarketingNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const productItems = createMenuItems(copy, 'product');
  const solutionsItems = createMenuItems(copy, 'solutions');
  const resourcesItems = createMenuItems(copy, 'resources');
  const companyItems = createMenuItems(copy, 'company');
  const direction = language === 'ar' ? 'rtl' : 'ltr';

  const mobileMenuSections = (Object.keys(MARKETING_SHELL_NAV_SECTIONS) as MarketingShellNavSectionId[]).map((id) => ({
    id,
    title: copy.navigation.sectionLabels[id],
    items: createMenuItems(copy, id),
    ...MOBILE_MENU_SECTION_PRESENTATION[id],
  }));

  /*
   * Announcement dismissal: the server and first client render always include
   * the bar (hydration-safe); the C13 boot script hides it pre-paint via the
   * data-ecode-announcement-dismissed attribute when this campaign was already
   * dismissed, and this state catches up after mount.
   */
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  useEffect(() => {
    setAnnouncementDismissed(readAnnouncementDismissed());
  }, []);

  const dismissAnnouncement = () => {
    persistAnnouncementDismissed();
    setAnnouncementDismissed(true);
  };

  /*
   * Guarantee marketing document chrome whenever this navbar is mounted. The
   * boot script + root-level reconcileMarketingChrome() cover most routes, but
   * some marketing pages (confirmed live: /partners) end up with
   * data-ecode-public-chrome unset → the html root falls back to the IDE's ~12px
   * type scale, so rem-based .mkt-* headings render too small (h1 42px vs 56px on
   * pages that DO get chrome). The navbar only ever renders on public marketing
   * pages, so asserting the chrome here is always correct and fixes every such
   * page in one place. Restore the prior values on unmount so navigating into an
   * app route doesn't leave the IDE stuck at the 16px marketing scale.
   */
  useEffect(() => {
    const root = document.documentElement;
    const prevChrome = root.getAttribute('data-ecode-public-chrome');
    const prevFontSize = root.style.fontSize;

    root.setAttribute('data-ecode-public-chrome', 'homepage');
    root.style.fontSize = '16px';

    return () => {
      if (prevChrome === null) {
        root.removeAttribute('data-ecode-public-chrome');
      } else {
        root.setAttribute('data-ecode-public-chrome', prevChrome);
      }

      root.style.fontSize = prevFontSize;
    };
  }, []);

  return (
    <header role="banner" aria-label={copy.a11y.siteHeader} className="sticky top-0 z-50 w-full">
      {!announcementDismissed ? (
        <div
          data-ecode-announcement
          className="hidden md:block border-b border-[var(--ecode-border)] dark:border-border bg-background dark:bg-background"
        >
          <div className="container-responsive flex min-h-11 items-center justify-between text-[11px] text-[var(--ecode-text)] dark:text-slate-100">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Badge
                variant="secondary"
                className="border-border bg-surface-solid text-[var(--ecode-accent-text)] dark:border-border dark:bg-surface-solid uppercase tracking-[0.2em]"
              >
                {copy.announcement.badge}
              </Badge>
              <p className="min-w-0 font-medium leading-relaxed">{copy.announcement.message}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-[var(--ecode-accent-text)] hover:text-[var(--ecode-text)] dark:hover:text-white transition-colors"
                onClick={() => navigate(MARKETING_SHELL_LINKS.contactSales.href)}
                aria-label={copy.announcement.ctaAriaLabel}
              >
                {copy.announcement.ctaLabel}
                <ChevronRight className={cn('h-3 w-3', language === 'ar' && 'rotate-180')} aria-hidden="true" />
              </button>
              <CloseButton
                size="sm"
                ariaLabel={copy.announcement.dismissAriaLabel}
                onClick={dismissAnnouncement}
                className="flex !h-11 !w-11 !min-h-11 !min-w-11 shrink-0 items-center justify-center"
              />
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label={copy.a11y.mainNavigation}
        className="relative border-b border-[var(--ecode-border)] bg-background dark:border-border dark:bg-background backdrop-blur-xl overflow-visible"
      >
        <div className="absolute inset-0 marketing-grid opacity-0 dark:opacity-100 pointer-events-none" aria-hidden />
        <div className="container-responsive-nav relative overflow-visible">
          <div className="flex h-16 items-center justify-between overflow-visible">
            <div className="flex items-center gap-6 overflow-visible">
              <Link
                href={MARKETING_SHELL_LINKS.home.href}
                className="inline-flex min-h-11 items-center"
                aria-label={copy.a11y.home}
              >
                <div className="cursor-pointer">
                  <EcodeLogo size="sm" />
                </div>
              </Link>

              <div className="hidden xl:block text-[var(--ecode-text)] dark:text-slate-200 overflow-visible">
                <div className="flex list-none items-center justify-center gap-1">
                  <MegaMenu
                    title={copy.navigation.sectionLabels.product}
                    items={productItems}
                    icon="sparkles"
                    direction={direction}
                  />
                  <MegaMenu
                    title={copy.navigation.sectionLabels.solutions}
                    items={solutionsItems}
                    icon="arrow"
                    direction={direction}
                  />
                  <MegaMenu
                    title={copy.navigation.sectionLabels.resources}
                    items={resourcesItems}
                    icon="search"
                    direction={direction}
                  />
                  <MegaMenu
                    title={copy.navigation.sectionLabels.company}
                    items={companyItems}
                    icon="chevron"
                    direction={direction}
                    compact
                  />
                  <NavPill href={MARKETING_SHELL_LINKS.pricing.href}>{copy.navigation.pricing}</NavPill>
                  <NavPill href={MARKETING_SHELL_LINKS.teamWorkspace.href}>{copy.navigation.teams}</NavPill>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <ThemeSwitcher copy={copy} />
              <LanguageSwitch />
              <Button
                variant="ghost"
                className="text-[var(--ecode-text)] dark:text-slate-200 hover:text-[var(--ecode-accent-text)] dark:hover:text-white !min-h-11 px-3 sm:px-4"
                onClick={() => navigate(MARKETING_SHELL_LINKS.login.href)}
                data-testid="link-login"
                aria-label={copy.navigation.logIn}
              >
                <LogIn className={cn('h-4 w-4', language === 'ar' ? 'ml-1 sm:ml-2' : 'mr-1 sm:mr-2')} aria-hidden />
                <span className="hidden xs:inline">{copy.navigation.logIn}</span>
              </Button>
              <Button
                onClick={() => navigate(MARKETING_SHELL_LINKS.register.href)}
                className="hidden sm:inline-flex shrink-0 bg-ecode-accent hover:bg-ecode-accent text-[var(--ecode-accent-contrast)] !min-h-11 px-3 sm:px-4 text-[13px] whitespace-nowrap"
                data-testid="link-get-started"
              >
                {copy.navigation.getStarted}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={copy.a11y.openMobileMenu}
                className="!h-11 !w-11 !min-h-11 !min-w-11 xl:hidden text-[var(--ecode-text)] dark:text-slate-100"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <Dialog.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 xl:hidden" />
          <Dialog.Content
            dir={direction}
            className={cn(
              'fixed z-50 flex h-dvh max-h-dvh flex-col overflow-hidden shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 inset-y-0 sm:max-w-sm w-full sm:w-[380px] p-0 border-border bg-background xl:hidden',
              language === 'ar'
                ? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
                : 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            )}
          >
            <div className="sr-only flex flex-col space-y-2 text-center sm:text-left">
              <Dialog.Title className="text-lg font-semibold text-foreground">{copy.a11y.mobileMenuTitle}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {copy.a11y.mobileMenuDescription}
              </Dialog.Description>
            </div>

            <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-4 py-3">
              <div className="flex items-center justify-between">
                <EcodeLogo size="sm" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={copy.a11y.closeMobileMenu}
                  className="!h-11 !w-11 !min-h-11 !min-w-11 hover:bg-muted"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <div className="shrink-0 p-4 border-b border-border">
              <Button
                className="w-full bg-ecode-accent hover:bg-ecode-accent text-[var(--ecode-accent-contrast)]"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(MARKETING_SHELL_LINKS.register.href);
                }}
              >
                {copy.navigation.getStarted}
              </Button>
              <Button
                variant="outline"
                className="mt-2 w-full border-border text-foreground hover:bg-muted"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(MARKETING_SHELL_LINKS.login.href);
                }}
              >
                {copy.navigation.signIn}
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-1">
                {mobileMenuSections.map((section) => {
                  const SectionIcon = section.icon;

                  return (
                    <div
                      key={section.id}
                      className={cn(section.bordered ? 'border-t border-border pt-3 pb-3' : 'pb-3')}
                    >
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3 flex items-center gap-2">
                        <SectionIcon className={cn('h-3 w-3', section.iconClassName)} />
                        {section.title}
                      </h3>
                      <div className="space-y-0.5">
                        {section.items.map((item) => (
                          <button
                            key={`${section.id}-${item.id}`}
                            className={cn(
                              'min-h-11 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center justify-between group',
                              language === 'ar' ? 'text-right' : 'text-left',
                            )}
                            onClick={() => {
                              setMobileMenuOpen(false);
                              navigate(item.href);
                            }}
                          >
                            <div>
                              <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                {item.description}
                              </div>
                            </div>
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0',
                                language === 'ar' ? 'mr-2 rotate-180' : 'ml-2',
                              )}
                              aria-hidden
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}

function MegaMenu({
  title,
  items,
  icon,
  direction,
  compact = false,
}: {
  title: string;
  items: MenuItem[];
  icon: 'sparkles' | 'arrow' | 'search' | 'chevron';
  direction: 'ltr' | 'rtl';
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = icon === 'sparkles' ? Sparkles : icon === 'search' ? Search : ChevronRight;
  const iconClass = 'text-[var(--ecode-accent-text)]';

  /*
   * Hover intent: don't slam the panel shut the instant the cursor leaves. Close
   * after a 150ms grace window, cancelled if the cursor re-enters the trigger or
   * the panel (both inside this wrapper) — so diagonal moves toward the menu items
   * don't dismiss it.
   */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => cancelClose, []);

  return (
    <div
      className="ecode-nav-menu relative"
      onMouseEnter={() => {
        cancelClose();
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        cancelClose();
        closeTimerRef.current = setTimeout(() => setIsOpen(false), 150);
      }}
      onFocus={() => {
        cancelClose();
        setIsOpen(true);
      }}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget instanceof Node ? event.relatedTarget : null;

        if (!event.currentTarget.contains(nextFocusedElement)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        className="group inline-flex min-h-11 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        {title}
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform ecode-nav-menu-chevron',
            direction === 'rtl' ? 'mr-1 rotate-180' : 'ml-1',
          )}
          aria-hidden
        />
      </button>
      {isOpen ? (
        <div
          className={cn(
            'ecode-nav-menu-panel absolute top-full block pt-2',
            direction === 'rtl' ? 'right-0' : 'left-0',
          )}
          role="menu"
        >
          <ul
            className={cn(
              'grid gap-3 rounded-xl border border-border bg-background p-4 shadow-xl',
              compact ? 'w-[360px]' : 'w-[calc(100vw-2rem)] sm:w-[480px] md:w-[520px] md:grid-cols-2 lg:w-[640px]',
            )}
          >
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-border bg-surface-solid p-4 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover-solid hover:shadow-lg hover:shadow-[var(--ecode-accent)]"
                  role="menuitem"
                >
                  <div className="text-[13px] font-semibold text-[var(--ecode-text)] dark:text-white flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', iconClass)} aria-hidden />
                    {item.title}
                  </div>
                  <p className="mt-2 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NavPill({ href, children }: { href: string; children: React.ReactNode }) {
  const [location] = useWouterLocation();
  const current = (location || '').split(/[?#]/)[0];
  const target = href.split(/[?#]/)[0];
  const active = current === target;

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group inline-flex min-h-11 w-max items-center justify-center rounded-full border px-5 text-[13px] font-medium transition-colors',
        active
          ? 'border-[var(--ecode-accent)] text-[var(--ecode-accent-text)]'
          : 'border-[var(--ecode-border)] dark:border-border text-[var(--ecode-text)] dark:text-slate-200 hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent-text)] dark:hover:text-white',
      )}
    >
      {children}
    </Link>
  );
}

function ThemeSwitcher({ copy }: { copy: MarketingShellCopy }) {
  const resolvedTheme = useStore(themeStore);
  const [theme, setHydratedTheme] = useState<Theme>('light');
  const { icon } = getThemeSwitcherPresentation(theme, copy.theme);
  const Icon = icon === 'moon' ? Moon : Sun;
  const label = theme === 'dark' ? copy.theme.dark : copy.theme.light;
  const actionLabel = theme === 'dark' ? copy.theme.switchToLight : copy.theme.switchToDark;
  const accessibleName = `${label}. ${actionLabel}`;

  useEffect(() => {
    setHydratedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const handleThemeToggle = () => {
    publicThemeWasManuallyChanged = true;
    toggleTheme();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="!min-h-11 !min-w-11 gap-2"
      data-testid="button-theme-toggle"
      onClick={handleThemeToggle}
      aria-label={accessibleName}
      title={actionLabel}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline text-[11px]">{label}</span>
    </Button>
  );
}

export function EcodeExactPublicFooter({ copy: copyOverride }: { copy?: MarketingShellCopy } = {}) {
  const { i18n } = useTranslation();
  const activeLanguage = normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const copy = copyOverride ?? MARKETING_SHELL_COPY[activeLanguage];
  const navigate = useMarketingNavigate();
  const productLinks = createFooterLinks(copy, 'product');
  const resourceLinks = createFooterLinks(copy, 'resources');
  const companyLinks = createFooterLinks(copy, 'company');
  const legalLinks = createFooterLinks(copy, 'legal');
  const comparisonLinks = createFooterLinks(copy, 'compare');
  const assuranceIcons = [ShieldCheck, Globe2, Sparkles] as const;

  const socialLinks = (Object.keys(MARKETING_SHELL_SOCIAL_LINKS) as MarketingShellSocialId[]).map((id) => ({
    id,
    icon: SOCIAL_ICONS[id],
    ...MARKETING_SHELL_SOCIAL_LINKS[id],
  }));

  return (
    <footer
      aria-label={copy.a11y.siteFooter}
      className="relative border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text)] dark:border-border dark:bg-background dark:text-slate-200"
    >
      <div className="absolute inset-0 marketing-grid opacity-0 dark:opacity-60" aria-hidden />
      <div className="relative container-responsive py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-6">
            <Badge className="vc-marketing-eyebrow border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid">
              <Sparkles className="mr-2 h-3 w-3" aria-hidden />
              {copy.footer.eyebrow}
            </Badge>
            <h3 className="text-3xl sm:text-4xl font-semibold text-[var(--ecode-text)] dark:text-white tracking-tight">
              {copy.footer.title}
            </h3>
            <p className="text-[13px] sm:text-base text-[var(--ecode-text-secondary)] dark:text-slate-300 leading-relaxed max-w-lg">
              {copy.footer.description}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-gradient-to-r from-[var(--ecode-accent)] via-[var(--ecode-accent)] to-[var(--ecode-accent)] text-[var(--ecode-accent-contrast)] shadow-lg shadow-[var(--ecode-accent)] !min-h-11"
                onClick={() => navigate(MARKETING_SHELL_LINKS.contactSales.href)}
                data-testid="button-footer-contact-sales"
              >
                {copy.footer.contactSales}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="border-[var(--ecode-border)] text-[var(--ecode-text)] hover:text-[var(--ecode-accent-text)] dark:border-border dark:text-slate-100 dark:hover:text-white !min-h-11"
                onClick={() => navigate(MARKETING_SHELL_LINKS.register.href)}
                data-testid="button-footer-start-building"
              >
                {copy.footer.startBuilding}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
              <div className="rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-4">
                <p className="text-[11px] uppercase tracking-widest text-[var(--ecode-text-muted)] dark:text-slate-400">
                  {copy.footer.facts.sourceCode.label}
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--ecode-text)] dark:text-white">
                  {copy.footer.facts.sourceCode.value}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-4">
                <p className="text-[11px] uppercase tracking-widest text-[var(--ecode-text-muted)] dark:text-slate-400">
                  {copy.footer.facts.projectWorkflow.label}
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--ecode-text)] dark:text-white">
                  {copy.footer.facts.projectWorkflow.value}
                </p>
              </div>
            </div>
          </div>

          {/*
           * SCR-010 — Avi : « l'espace ENTRE les titres / colonnes du menu en pied
           * de page est encore trop grand ». À ne pas confondre avec SCR-009, qui
           * portait sur la chasse À L'INTÉRIEUR des titres : ici c'est la grille
           * elle-même qui creuse le vide entre les groupes de liens.
           *
           * Mesuré live le 20/08 sur prod `web:73c4edc166`, aux 3 formats et dans
           * les 2 thèmes (l'espacement ne dépend pas du thème) : `column-gap: 40px`
           * et `row-gap: 20px` partout. Les 40px de gouttière sont l'essentiel du
           * vide qu'Avi voit entre PRODUIT · RESSOURCES · SOCIÉTÉ · LÉGAL.
           *
           * La note précédente figeait `gap-x` à 10 « pour ne pas bouger
           * l'alignement horizontal » — c'est précisément ce qu'Avi demande de
           * revoir, donc elle est levée. `gap-x-6` (24px) resserre les gouttières
           * sans coller les colonnes, et rend 16px de largeur à chaque colonne :
           * moins de libellés qui passent à la ligne, donc un pied de page plus
           * court en prime. `gap-y-3` (12px) resserre les groupes une fois les
           * colonnes empilées (390 et 768), là où deux titres se suivaient.
           *
           * Les lignes de liens gardent leur hauteur tactile de 44px : ce sont des
           * cibles de doigt, pas de l'espacement décoratif.
           */}
          {/*
           * Two columns from the smallest width up. This nav carries 46 links,
           * and a single column made the footer 3981px tall on a 390px phone —
           * 4.7 screens of nothing but links. The 44px rows are deliberate
           * touch targets and are preserved; only the column count changes.
           * Measured on prod: footer 3981px -> 3179px, no label truncated.
           */}
          <nav aria-label={copy.a11y.footerNavigation} className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
            <FooterColumn title={copy.footer.columnLabels.product} links={productLinks} />
            <div>
              <FooterColumn title={copy.footer.columnLabels.resources} links={resourceLinks} />
              <NewsletterMiniForm copy={copy} />
            </div>
            <FooterColumn title={copy.footer.columnLabels.company} links={companyLinks} />
            <FooterColumn title={copy.footer.columnLabels.legal} links={legalLinks} />
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mt-6 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ecode-text)] dark:text-white">
                      {copy.footer.compareTitle}
                    </p>
                    <p className="text-[11px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
                      {copy.footer.compareDescription}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3" role="list" aria-label={copy.a11y.platformComparisons}>
                    {comparisonLinks.map((link) => (
                      <Link
                        key={link.id}
                        href={link.href}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--ecode-border)] dark:border-border px-3 py-1.5 text-[11px] text-[var(--ecode-text-secondary)] dark:text-slate-200 transition hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent-text)] dark:hover:text-white"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-16 grid gap-8 border-t border-[var(--ecode-border)] dark:border-border pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {copy.footer.assurances.map((assurance, index) => {
            const AssuranceIcon = assuranceIcons[index];

            return (
              <div
                className="flex items-center gap-3 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300"
                key={assurance}
              >
                <AssuranceIcon className="h-5 w-5 text-[var(--ecode-accent-text)]" aria-hidden />
                {assurance}
              </div>
            );
          })}
          <div className="flex flex-nowrap items-center gap-2">
            {socialLinks.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={interpolateMarketingShellCopy(copy.a11y.socialLinkTemplate, {
                  network: social.name,
                })}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ecode-border)] dark:border-border bg-[var(--ecode-surface-secondary)] dark:bg-surface-solid text-[var(--ecode-text-secondary)] dark:text-slate-200 transition hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent-text)] dark:hover:text-white"
                data-testid={`link-social-${social.id}`}
              >
                <social.icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-[11px] text-[var(--ecode-text-muted)] dark:text-slate-400">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Link
              href={MARKETING_SHELL_LINKS.home.href}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center"
              aria-label={copy.a11y.home}
            >
              <div className="cursor-pointer">
                <EcodeLogo size="xs" />
              </div>
            </Link>
            <span className="min-w-0 leading-relaxed">
              {interpolateMarketingShellCopy(copy.footer.copyrightTemplate, { year: new Date().getFullYear() })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={MARKETING_SHELL_LINKS.newsletterUnsubscribe.href}
              className="inline-flex min-h-11 items-center hover:text-[var(--ecode-accent-text)] dark:hover:text-white"
            >
              {copy.footer.emailPreferences}
            </Link>
            <Link
              href={MARKETING_SHELL_LINKS.newsletterConfirmed.href}
              className="inline-flex min-h-11 items-center hover:text-[var(--ecode-accent-text)] dark:hover:text-white"
            >
              {copy.footer.newsletter}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <div>
      {/*
       * SCR-009 — Avi : « l'espace des TITRES de menu dans le pied de page est
       * trop grand ». La cause est la chasse : `tracking-[0.3em]` met 30 % de la
       * taille de police entre CHAQUE lettre, soit ~3,9 px à 13 px — « PRODUIT »
       * occupait ainsi presque deux fois sa largeur naturelle, et les quatre
       * titres donnaient au pied de page un air distendu.
       *
       * `0.12em` garde la lecture en capitales (une chasse nulle rendrait les
       * capitales compactes et dures à lire) tout en rendant l'espace au titre.
       * L'écart titre → liens passe de 12 px à 8 px dans le même mouvement.
       */}
      <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--ecode-text-muted)] dark:text-slate-400">
        {title}
      </h4>
      <ul role="list" className="mt-2 space-y-2 text-[13px]">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 min-w-11 items-center text-[var(--ecode-text-secondary)] dark:text-slate-300 transition hover:text-[var(--ecode-accent-text)] dark:hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
 * Footer newsletter opt-in (Resources column). Posts to the /newsletter route
 * action, which proxies to the public API subscribe endpoint. Includes a
 * honeypot field bots fill and humans never see.
 */
function NewsletterMiniForm({ copy }: { copy: MarketingShellCopy }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== 'idle';
  const succeeded = fetcher.data?.ok === true;
  const failed = fetcher.data?.ok === false;
  const errorId = 'footer-newsletter-error';

  return (
    <div className="mt-8">
      {/*
       * SCR-009 (suite) — même chasse que les titres de colonnes (FooterColumn) :
       * ce titre « Newsletter » vit dans la même grille de pied de page ; le
       * laisser à 0.3em recréait exactement l'étirement corrigé juste au-dessus.
       */}
      <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--ecode-text-muted)] dark:text-slate-400">
        {copy.newsletter.title}
      </h4>
      {succeeded ? (
        <p
          className="mt-4 text-[13px]"
          style={{ color: 'var(--status-success-text)' }}
          role="status"
          aria-live="polite"
        >
          {copy.newsletter.success}
        </p>
      ) : (
        <fetcher.Form method="post" action="/newsletter" className="mt-4">
          <div className="flex flex-col gap-2">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={copy.newsletter.emailPlaceholder}
              aria-label={copy.a11y.emailAddress}
              aria-invalid={failed || undefined}
              aria-describedby={failed ? errorId : undefined}
              disabled={submitting}
              className="min-h-11 w-full rounded-md border border-[var(--ecode-border)] dark:border-border bg-[var(--ecode-surface-secondary)] dark:bg-surface-solid px-3 py-2 text-[16px] text-[var(--ecode-text)] dark:text-slate-100 placeholder:text-[var(--ecode-text-muted)] outline-none focus-visible:border-[var(--ecode-accent)] focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
            />
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="pointer-events-none absolute h-0 w-0 opacity-0"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="w-full !min-h-11 bg-ecode-accent hover:bg-ecode-accent text-[var(--ecode-accent-contrast)]"
            >
              {submitting ? copy.newsletter.subscribing : copy.newsletter.subscribe}
            </Button>
          </div>
          {failed ? (
            <p id={errorId} className="mt-2 text-[12px]" style={{ color: 'var(--status-error-text)' }} role="alert">
              {copy.newsletter.errorFallback}
            </p>
          ) : null}
        </fetcher.Form>
      )}
    </div>
  );
}
