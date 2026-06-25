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
  Youtube,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, cn, Link, useMarketingNavigate, useWouterLocation } from './EcodeExactUi';
import { publicChromeUserChoseDark, resolvePublicChromeTheme } from './ecode-public-theme';
import { getThemeSwitcherPresentation } from './theme-switcher-presentation';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { applyThemeToDocument, kTheme, themeStore, toggleTheme } from '~/lib/stores/theme';
import type { Theme } from '~/lib/stores/theme';

type MenuItem = {
  title: string;
  href: string;
  description: string;
};

const productItems: MenuItem[] = [
  { title: 'AI Agent', href: '/ai-agent', description: 'Build production-ready apps with natural language prompts.' },
  { title: 'Browser IDE', href: '/features', description: 'Enterprise-grade development workspace built for teams.' },
  {
    title: 'Multiplayer',
    href: '/features#multiplayer',
    description: 'Live collaboration, pair programming, and shared presence.',
  },
  { title: 'Mobile App', href: '/mobile', description: 'Ship from anywhere with a fully-featured mobile IDE.' },
  { title: 'Desktop App', href: '/desktop', description: 'Optimized offline workflow with secure device sync.' },
  { title: 'AI Platform', href: '/ai', description: 'Governance, observability, and orchestration for AI workloads.' },
  {
    title: 'Deployments',
    href: '/marketing/deployments',
    description: 'Global edge infrastructure with Fortune 500 reliability.',
  },
  {
    title: 'Bounties',
    href: '/marketing/bounties',
    description: 'Activate an on-demand developer network to accelerate delivery.',
  },
  {
    title: 'Teams',
    href: '/marketing/teams',
    description: 'Enterprise controls, compliance, and insights for large orgs.',
  },
];

const solutionsItems: MenuItem[] = [
  {
    title: 'App Builder',
    href: '/solutions/app-builder',
    description: 'Rapidly prototype and deploy full-stack applications.',
  },
  {
    title: 'Website Builder',
    href: '/solutions/website-builder',
    description: 'Create polished marketing sites with zero setup.',
  },
  {
    title: 'Game Builder',
    href: '/solutions/game-builder',
    description: 'Design and launch interactive experiences powered by AI.',
  },
  {
    title: 'Dashboard Builder',
    href: '/solutions/dashboard-builder',
    description: 'Data-rich dashboards with real-time collaboration.',
  },
  {
    title: 'Chatbot / AI Agent Builder',
    href: '/solutions/chatbot-builder',
    description: 'Deploy conversational assistants across your organization.',
  },
  {
    title: 'Internal AI Builder',
    href: '/solutions/internal-ai-builder',
    description: 'Bring private AI agents to every team safely and securely.',
  },
  {
    title: 'Enterprise',
    href: '/solutions/enterprise',
    description: 'Fortune 500-grade platform with SSO, audit logs, and 99.99% SLA.',
  },
  {
    title: 'Startups',
    href: '/solutions/startups',
    description: 'Ship your MVP 10x faster. Startup-friendly pricing.',
  },
  {
    title: 'Freelancers',
    href: '/solutions/freelancers',
    description: 'Deliver client projects faster. Portfolio hosting included.',
  },
];

const resourcesItems: MenuItem[] = [
  { title: 'Documentation', href: '/docs', description: 'Get started quickly with step-by-step guides.' },
  { title: 'AI Documentation', href: '/ai-documentation', description: 'Complete AI capabilities guide' },
  { title: 'Tutorials', href: '/tutorials', description: 'Step-by-step learning from beginner to advanced.' },
  { title: 'Blog', href: '/blog', description: 'Stories on shipping software at global scale.' },
  { title: 'Changelog', href: '/changelog', description: 'Latest features and product updates.' },
  { title: 'Community', href: '/community', description: 'Connect with builders and share best practices.' },
  { title: 'Templates', href: '/templates', description: 'Launch with curated, industry-specific templates.' },
  { title: 'Case Studies', href: '/case-studies', description: 'Real-world success stories from our customers.' },
  { title: 'Help Center', href: '/help-center', description: 'FAQs, troubleshooting, and support.' },
  { title: 'Status', href: '/status', description: 'Transparency around platform availability.' },
];

const companyItems: MenuItem[] = [
  { title: 'About', href: '/about', description: 'Learn about our mission and leadership team.' },
  { title: 'Careers', href: '/careers', description: 'Join a distributed team building the future of software.' },
  { title: 'Press', href: '/press', description: 'Press releases, media kit, and recent coverage.' },
  { title: 'Partners', href: '/partners', description: 'Strategic alliances and solution partners.' },
  { title: 'Contact', href: '/contact', description: 'Get in touch with our team.' },
  { title: 'Accessibility', href: '/accessibility', description: 'Our commitment to inclusive design.' },
];

const footerLinks = {
  product: [
    { label: 'AI Agent', href: '/ai-agent' },
    { label: 'IDE', href: '/features' },
    { label: 'Multiplayer', href: '/features#multiplayer' },
    { label: 'Mobile App', href: '/mobile' },
    { label: 'Desktop App', href: '/desktop' },
    { label: 'Teams', href: '/marketing/teams' },
    { label: 'Deployments', href: '/marketing/deployments' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Bounties', href: '/marketing/bounties' },
    { label: 'AI Platform', href: '/ai' },
  ],
  resources: [
    { label: 'Docs', href: '/docs' },
    { label: 'Blog', href: '/blog' },
    { label: 'Community', href: '/community' },
    { label: 'Templates', href: '/templates' },
    { label: 'Languages', href: '/templates/languages' },
    { label: 'Status', href: '/status' },
    { label: 'Forum', href: '/forum' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press', href: '/press' },
    { label: 'Partners', href: '/partners' },
    { label: 'Contact Sales', href: '/contact-sales' },
  ],
  legal: [
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Subprocessors', href: '/subprocessors' },
    { label: 'DPA', href: '/dpa' },
    { label: 'US Student DPA', href: '/student-dpa' },
    { label: 'Security', href: '/security' },
    { label: 'Report Abuse', href: '/report-abuse' },
  ],
  compare: [
    { label: 'E-Code vs GitHub Codespaces', href: '/compare/github-codespaces' },
    { label: 'E-Code vs Glitch', href: '/compare/glitch' },
    { label: 'E-Code vs Heroku', href: '/compare/heroku' },
    { label: 'E-Code vs CodeSandbox', href: '/compare/codesandbox' },
    { label: 'E-Code vs AWS Cloud9', href: '/compare/aws-cloud9' },
  ],
} as const;

const socialLinks = [
  { icon: Twitter, href: 'https://twitter.com/ecode', label: 'Twitter' },
  { icon: Github, href: 'https://github.com/ecode', label: 'GitHub' },
  { icon: Youtube, href: 'https://youtube.com/ecode', label: 'YouTube' },
  { icon: Linkedin, href: 'https://linkedin.com/company/ecode', label: 'LinkedIn' },
  { icon: Instagram, href: 'https://instagram.com/ecode', label: 'Instagram' },
];

const mobileMenuSections = [
  { title: 'Product', items: productItems, icon: Sparkles, iconClassName: 'text-ecode-accent', bordered: false },
  { title: 'Solutions', items: solutionsItems, icon: ArrowUpRight, iconClassName: 'text-indigo-400', bordered: true },
  { title: 'Resources', items: resourcesItems, icon: Search, iconClassName: 'text-sky-400', bordered: true },
  { title: 'Company', items: companyItems, icon: ChevronRight, iconClassName: 'text-indigo-400', bordered: true },
] as const;

const ECODE_PUBLIC_ROOT_FONT_SIZE = '16px';

let publicThemeWasManuallyChanged = false;

function useHomepagePublicChrome() {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    /*
     * Respect a visitor's persisted dark choice. Reading localStorage here lets a
     * dark selection survive SPA navigation between marketing pages: each route
     * change remounts this shell, and without this guard we would unconditionally
     * reset the manual-change flag and re-force light, reverting the user's pick.
     */
    let persistedTheme: string | null = null;

    try {
      persistedTheme = localStorage.getItem(kTheme);
    } catch {
      persistedTheme = null;
    }

    if (publicChromeUserChoseDark(persistedTheme)) {
      publicThemeWasManuallyChanged = true;
    }

    const chromeTheme = resolvePublicChromeTheme(persistedTheme);

    const root = document.documentElement;
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

export function EcodeExactPublicShell({ children }: { children: React.ReactNode }) {
  useHomepagePublicChrome();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground" data-ecode-static-shell>
      <EcodeExactPublicNavbar />
      {children}
      <EcodeExactPublicFooter />
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
    xs: { icon: 'h-6 w-6', text: 'text-base' },
    sm: { icon: 'h-7 w-7', text: 'text-[15px]' },
    md: { icon: 'h-9 w-9', text: 'text-xl' },
    lg: { icon: 'h-11 w-11', text: 'text-2xl' },
  } as const;

  const resolvedSize = sizeMap[size] ?? sizeMap.md;

  return (
    <div className={cn('flex flex-row items-center gap-2 flex-nowrap whitespace-nowrap', className)}>
      <svg
        className={cn(resolvedSize.icon, 'shrink-0')}
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
            <stop offset="0%" stopColor="#F26207" />
            <stop offset="100%" stopColor="#F99D25" />
          </linearGradient>
        </defs>
      </svg>
      {showText ? <span className={cn('font-bold', resolvedSize.text)}>E-Code</span> : null}
    </div>
  );
}

export function EcodeExactPublicNavbar() {
  const navigate = useMarketingNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="hidden md:block border-b border-[var(--ecode-border)] dark:border-border bg-background dark:bg-background">
        <div className="container-responsive flex h-10 items-center justify-between text-[11px] text-[var(--ecode-text)] dark:text-slate-100">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-surface-solid text-[var(--ecode-accent)] dark:bg-surface-solid dark:text-white border-border dark:border-border uppercase tracking-[0.2em]"
            >
              NEW
            </Badge>
            <p className="font-medium">
              Introducing E-Code Enterprise Cloud with dedicated AI governance and auditability.
            </p>
          </div>
          <button
            className="inline-flex items-center gap-1 text-[var(--ecode-accent)] hover:text-[var(--ecode-accent-hover)] dark:text-sky-200 dark:hover:text-white transition-colors"
            onClick={() => navigate('/contact-sales')}
            aria-label="Talk to a sales expert"
          >
            Talk to an expert
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav
        aria-label="Main navigation"
        className="relative border-b border-[var(--ecode-border)] bg-background dark:border-border dark:bg-background backdrop-blur-xl overflow-visible"
      >
        <div className="absolute inset-0 marketing-grid opacity-0 dark:opacity-100 pointer-events-none" aria-hidden />
        <div className="container-responsive-nav relative overflow-visible">
          <div className="flex h-16 items-center justify-between overflow-visible">
            <div className="flex items-center gap-6 overflow-visible">
              <Link href="/">
                <div className="cursor-pointer">
                  <EcodeLogo size="sm" />
                </div>
              </Link>

              <div className="hidden lg:block text-[var(--ecode-text)] dark:text-slate-200 overflow-visible">
                <div className="flex list-none items-center justify-center gap-1">
                  <MegaMenu title="Product" items={productItems} icon="sparkles" />
                  <MegaMenu title="Solutions" items={solutionsItems} icon="arrow" />
                  <MegaMenu title="Resources" items={resourcesItems} icon="search" />
                  <MegaMenu title="Company" items={companyItems} icon="chevron" compact />
                  <NavPill href="/pricing">Pricing</NavPill>
                  <NavPill href="/team">Teams</NavPill>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <ThemeSwitcher />
              <Button
                variant="ghost"
                className="text-[var(--ecode-text)] dark:text-slate-200 hover:text-[var(--ecode-accent)] dark:hover:text-white min-h-[44px] px-3 sm:px-4"
                onClick={() => navigate('/login')}
                data-testid="link-login"
              >
                <LogIn className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden xs:inline">Log in</span>
              </Button>
              <Button
                onClick={() => navigate('/register')}
                className="hidden sm:inline-flex shrink-0 bg-ecode-accent hover:bg-ecode-accent-hover text-white min-h-[44px] px-3 sm:px-4 text-[13px] whitespace-nowrap"
                data-testid="link-get-started"
              >
                Get started
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open mobile menu"
                className="lg:hidden text-[var(--ecode-text)] dark:text-slate-100"
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
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <Dialog.Content className="fixed z-50 flex h-dvh max-h-dvh flex-col overflow-hidden shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 inset-y-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm w-full sm:w-[380px] p-0 border-l border-border bg-background lg:hidden">
            <div className="sr-only flex flex-col space-y-2 text-center sm:text-left">
              <Dialog.Title className="text-lg font-semibold text-foreground">Mobile Navigation Menu</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Navigate through E-Code platform sections
              </Dialog.Description>
            </div>

            <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-4 py-3">
              <div className="flex items-center justify-between">
                <EcodeLogo size="sm" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close mobile menu"
                  className="hover:bg-muted"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <div className="shrink-0 p-4 border-b border-border">
              <Button
                className="w-full bg-ecode-accent hover:bg-ecode-accent-hover text-white"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/register');
                }}
              >
                Get Started
              </Button>
              <Button
                variant="outline"
                className="mt-2 w-full border-border text-foreground hover:bg-muted"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/login');
                }}
              >
                Sign In
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-1">
                {mobileMenuSections.map((section) => {
                  const SectionIcon = section.icon;

                  return (
                    <div
                      key={section.title}
                      className={cn(section.bordered ? 'border-t border-border pt-3 pb-3' : 'pb-3')}
                    >
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3 flex items-center gap-2">
                        <SectionIcon className={cn('h-3 w-3', section.iconClassName)} />
                        {section.title}
                      </h3>
                      <div className="space-y-0.5">
                        {section.items.map((item) => (
                          <button
                            key={`${section.title}-${item.href}`}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center justify-between group"
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
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
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
  compact = false,
}: {
  title: string;
  items: MenuItem[];
  icon: 'sparkles' | 'arrow' | 'search' | 'chevron';
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = icon === 'sparkles' ? Sparkles : icon === 'search' ? Search : ChevronRight;
  const iconClass = icon === 'arrow' || icon === 'chevron' ? 'text-indigo-300' : 'text-sky-300';

  return (
    <div
      className="ecode-nav-menu relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget instanceof Node ? event.relatedTarget : null;

        if (!event.currentTarget.contains(nextFocusedElement)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
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
        <ChevronRight className="ml-1 h-3 w-3 transition-transform ecode-nav-menu-chevron" aria-hidden />
      </button>
      {isOpen ? (
        <div className="ecode-nav-menu-panel absolute left-0 top-full block pt-2" role="menu">
          <ul
            className={cn(
              'grid gap-3 rounded-xl border border-border bg-background p-4 shadow-xl',
              compact ? 'w-[360px]' : 'w-[calc(100vw-2rem)] sm:w-[480px] md:w-[520px] md:grid-cols-2 lg:w-[640px]',
            )}
          >
            {items.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-border bg-surface-solid p-4 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover-solid hover:shadow-lg hover:shadow-sky-500"
                  role="menuitem"
                >
                  <div className="text-[13px] font-semibold text-[var(--ecode-text)] dark:text-white flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', iconClass)} />
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
        'group inline-flex h-10 w-max items-center justify-center rounded-full border px-5 text-[13px] font-medium transition-colors',
        active
          ? 'border-[var(--ecode-accent)] text-[var(--ecode-accent)]'
          : 'border-[var(--ecode-border)] dark:border-border text-[var(--ecode-text)] dark:text-slate-200 hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent)] dark:hover:text-white',
      )}
    >
      {children}
    </Link>
  );
}

function ThemeSwitcher() {
  const theme = useStore(themeStore);
  const { icon, label } = getThemeSwitcherPresentation(theme);
  const Icon = icon === 'moon' ? Moon : Sun;

  const handleThemeToggle = () => {
    publicThemeWasManuallyChanged = true;
    toggleTheme();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-2"
      data-testid="button-theme-toggle"
      onClick={handleThemeToggle}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline text-[11px]">{label}</span>
    </Button>
  );
}

export function EcodeExactPublicFooter() {
  const navigate = useMarketingNavigate();

  return (
    <footer
      aria-label="Site footer"
      className="relative border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text)] dark:border-border dark:bg-background dark:text-slate-200"
    >
      <div className="absolute inset-0 marketing-gradient opacity-0 dark:opacity-100" aria-hidden />
      <div className="absolute inset-0 marketing-grid opacity-0 dark:opacity-60" aria-hidden />
      <div className="relative container-responsive py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-6">
            <Badge className="bg-surface-solid text-[var(--ecode-accent)] border-border dark:bg-surface-solid dark:text-white dark:border-border">
              <Sparkles className="mr-2 h-3 w-3" />
              Built for Fortune 500
            </Badge>
            <h3 className="text-3xl sm:text-4xl font-semibold text-[var(--ecode-text)] dark:text-white tracking-tight">
              The future of enterprise software development
            </h3>
            <p className="text-[13px] sm:text-base text-[var(--ecode-text-secondary)] dark:text-slate-300 leading-relaxed max-w-lg">
              E-Code combines secure cloud workspaces, intelligent automation, and enterprise controls so your teams can
              ship faster across every device.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500 min-h-[44px]"
                onClick={() => navigate('/contact-sales')}
                data-testid="button-footer-contact-sales"
              >
                Talk to sales
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="border-[var(--ecode-border)] text-[var(--ecode-text)] hover:text-[var(--ecode-accent)] dark:border-border dark:text-slate-100 dark:hover:text-white min-h-[44px]"
                onClick={() => navigate('/register')}
                data-testid="button-footer-start-building"
              >
                Start building
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
              <div className="rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-4">
                <p className="text-[11px] uppercase tracking-widest text-[var(--ecode-text-muted)] dark:text-slate-400">
                  Global uptime
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--ecode-text)] dark:text-white">99.99%</p>
              </div>
              <div className="rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-4">
                <p className="text-[11px] uppercase tracking-widest text-[var(--ecode-text-muted)] dark:text-slate-400">
                  Enterprise teams
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--ecode-text)] dark:text-white">4,500+</p>
              </div>
            </div>
          </div>

          <nav aria-label="Footer navigation" className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title="Product" links={footerLinks.product} />
            <FooterColumn title="Resources" links={footerLinks.resources} />
            <FooterColumn title="Company" links={footerLinks.company} />
            <FooterColumn title="Legal" links={footerLinks.legal} />
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mt-6 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] dark:border-border dark:bg-surface-solid p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ecode-text)] dark:text-white">
                      Compare platforms
                    </p>
                    <p className="text-[11px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
                      See how E-Code stacks up against other development clouds.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3" role="list" aria-label="Platform comparisons">
                    {footerLinks.compare.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-full border border-[var(--ecode-border)] dark:border-border px-3 py-1.5 text-[11px] text-[var(--ecode-text-secondary)] dark:text-slate-200 transition hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent)] dark:hover:text-white"
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
          <div className="flex items-center gap-3 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
            <ShieldCheck className="h-5 w-5 text-emerald-500 dark:text-emerald-300" />
            SOC2 Type II, ISO 27001, GDPR &amp; HIPAA ready.
          </div>
          <div className="flex items-center gap-3 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
            <Globe2 className="h-5 w-5 text-sky-500 dark:text-sky-300" />
            18 global regions with enterprise data residency.
          </div>
          <div className="flex items-center gap-3 text-[13px] text-[var(--ecode-text-secondary)] dark:text-slate-300">
            <Sparkles className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />
            AI governance, policy controls, and audit logging.
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Follow us on ${social.label}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ecode-border)] dark:border-border bg-[var(--ecode-surface-secondary)] dark:bg-surface-solid text-[var(--ecode-text-secondary)] dark:text-slate-200 transition hover:border-[var(--ecode-accent)] dark:hover:border-surface-hover-solid hover:text-[var(--ecode-accent)] dark:hover:text-white"
                data-testid={`link-social-${social.label.toLowerCase()}`}
              >
                <social.icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-[11px] text-[var(--ecode-text-muted)] dark:text-slate-400">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className="cursor-pointer">
                <EcodeLogo size="xs" />
              </div>
            </Link>
            <span>© {new Date().getFullYear()} E-Code.AI (Snatch Group Limited). All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/newsletter/unsubscribe" className="hover:text-[var(--ecode-accent)] dark:hover:text-white">
              Email preferences
            </Link>
            <Link href="/newsletter-confirmed" className="hover:text-[var(--ecode-accent)] dark:hover:text-white">
              Newsletter
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold uppercase tracking-[0.3em] text-[var(--ecode-text-muted)] dark:text-slate-400">
        {title}
      </h4>
      <ul role="list" className="mt-4 space-y-2 text-[13px]">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-[var(--ecode-text-secondary)] dark:text-slate-300 transition hover:text-[var(--ecode-accent)] dark:hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
