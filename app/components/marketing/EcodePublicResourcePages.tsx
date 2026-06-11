import { Link } from '@remix-run/react';
import {
  ArrowRight,
  BookOpen,
  Code2,
  Globe2,
  Layers,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { classNames } from '~/utils/classNames';

export type PublicTemplateCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  categoryName: string;
  difficulty: string;
  featured: boolean;
  trending: boolean;
  technologies: string[];
  tags: string[];
  updatedAt: string;
};

export type PublicTemplateCategory = {
  slug: string;
  name: string;
  count: number;
};

export type PublicCommunityPost = {
  id: string;
  title: string;
  summary: string;
  categoryName: string;
  tags: string[];
  templateSlug: string;
  updatedAt: string;
};

type TemplatesPageProps = {
  categories: PublicTemplateCategory[];
  templates: PublicTemplateCard[];
};

type CommunityPageProps = {
  posts: PublicCommunityPost[];
  templates: PublicTemplateCard[];
};

export function TemplatesMarketingPage({ categories, templates }: TemplatesPageProps) {
  const featuredTemplates = templates.filter((template) => template.featured).slice(0, 6);
  const remainingTemplates = templates.filter((template) => !template.featured).slice(0, 6);
  const visibleTemplates = featuredTemplates.length > 0 ? featuredTemplates : templates.slice(0, 6);
  const secondaryTemplates = remainingTemplates.length > 0 ? remainingTemplates : templates.slice(6, 12);

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="templates">
        <ResourceHero
          eyebrow="Templates"
          title="Start faster with production-ready E-Code templates"
          description="Browse real Vibecore project starters adapted into the E-Code marketing experience. Pick a foundation, open the preserved IDE, and continue with typed code, preview and deployment workflows."
          primaryAction={{ label: 'Browse templates', to: '#featured-templates' }}
          secondaryAction={{ label: 'Open docs', to: '/docs' }}
          metrics={[
            { label: 'Official templates', value: templates.length.toString() },
            { label: 'Categories', value: categories.length.toString() },
            { label: 'Project-ready', value: '100%' },
          ]}
          icon={<Layers className="h-5 w-5" aria-hidden />}
        />

        <section id="featured-templates" className="container-responsive py-16 sm:py-24">
          <SectionHeader
            eyebrow="Template gallery"
            title="Curated starters without the app dashboard chrome"
            description="This is a public marketing gallery. It uses the same E-Code header and footer as the homepage, while the cards are powered by Vibecore's real template catalog."
          />

          <div className="mt-8 flex gap-3 overflow-x-auto pb-2" aria-label="Template categories">
            {categories.map((category) => (
              <span
                key={category.slug}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-medium text-[var(--ecode-text-secondary)]"
              >
                <Globe2 className="h-4 w-4 text-[var(--ecode-accent)]" aria-hidden />
                {category.name}
                <span className="text-[var(--ecode-text-muted)]">{category.count}</span>
              </span>
            ))}
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleTemplates.map((template) => (
              <TemplateMarketingCard key={template.id} template={template} featured />
            ))}
          </div>
        </section>

        <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
          <div className="container-responsive grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">
                Real project foundations
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                Templates stay public. Workspaces stay private.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-[var(--ecode-text-secondary)]">
                Visitors see a marketing page. Signed-in builders continue into the IDE, where auth, files, terminal,
                preview and deployment controls remain part of the real product.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['No invented catalog', 'Cards come from existing Vibecore starters.'],
                ['No user menu', 'Public pages do not render account dropdowns.'],
                ['Same shell', 'Header and footer match the marketing routes.'],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5"
                >
                  <ShieldCheck className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="mt-4 text-base font-semibold text-[var(--ecode-text)]">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {secondaryTemplates.length > 0 ? (
          <section className="container-responsive py-16 sm:py-24">
            <SectionHeader
              eyebrow="More starters"
              title="More ways to start"
              description="Additional foundations for web apps, AI agents, dashboards, APIs and mobile projects."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {secondaryTemplates.map((template) => (
                <TemplateMarketingCard key={template.id} template={template} />
              ))}
            </div>
          </section>
        ) : null}

        <ResourceCta
          title="Ready to turn a template into a real project?"
          description="Open a starter, keep the generated code reviewable, and continue in the preserved Bolt IDE."
          primary={{ label: 'Start building', to: '/register' }}
          secondary={{ label: 'See pricing', to: '/pricing' }}
        />
      </main>
    </PublicShell>
  );
}

export function CommunityMarketingPage({ posts, templates }: CommunityPageProps) {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="community">
        <ResourceHero
          eyebrow="Community"
          title="A public builder community, not an account dashboard"
          description="Explore public project patterns, template notes and implementation practices from the E-Code ecosystem with the same marketing header and footer as the homepage."
          primaryAction={{ label: 'Open forum', to: '/forum' }}
          secondaryAction={{ label: 'Browse templates', to: '/templates' }}
          metrics={[
            { label: 'Template threads', value: posts.length.toString() },
            { label: 'Starter paths', value: templates.length.toString() },
            { label: 'Private data', value: '0' },
          ]}
          icon={<Users className="h-5 w-5" aria-hidden />}
        />

        <section className="container-responsive py-16 sm:py-24">
          <SectionHeader
            eyebrow="Builder notes"
            title="Public discussions around real starter patterns"
            description="Community cards are generated from the real template catalog so the page remains useful without exposing signed-in navigation, private projects or account menus."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {posts.map((post) => (
              <CommunityPostCard key={post.id} post={post} />
            ))}
          </div>
        </section>

        <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
          <div className="container-responsive grid gap-10 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">
                Community principles
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                Share implementation context safely.
              </h2>
              <p className="mt-5 text-base leading-8 text-[var(--ecode-text-secondary)]">
                Public community surfaces should guide builders to docs, templates and support without showing profile
                menus or workspace controls.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Sanitized examples', 'Share architecture decisions without secrets or private repository data.'],
                ['Template feedback', 'Discuss starter gaps and production hardening paths.'],
                ['Workflow notes', 'Document prompts, preview checks and deployment lessons.'],
                ['Support escalation', 'Move private incidents to the right protected support channel.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-[var(--ecode-border)] bg-background p-5">
                  <MessageSquare className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="mt-4 text-base font-semibold text-[var(--ecode-text)]">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container-responsive py-16 sm:py-24">
          <SectionHeader
            eyebrow="Starter paths"
            title="Continue from community into templates"
            description="Use community context to choose the right starter, then continue into a real project workflow."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {templates.slice(0, 4).map((template) => (
              <TemplateCompactCard key={template.id} template={template} />
            ))}
          </div>
        </section>

        <ResourceCta
          title="Join from the public side, build from the product side."
          description="Community remains public and readable. Project creation, private files and account controls stay behind the authenticated product flow."
          primary={{ label: 'Browse templates', to: '/templates' }}
          secondary={{ label: 'Read docs', to: '/docs' }}
        />
      </main>
    </PublicShell>
  );
}

function ResourceHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  metrics,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: { label: string; to: string };
  secondaryAction: { label: string; to: string };
  metrics: { label: string; value: string }[];
  icon: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
      <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
      <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
      <div className="container-responsive relative py-20 sm:py-28">
        <div className="max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
            {icon}
            {eyebrow}
          </span>
          <h1 className="mt-8 max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight text-[var(--ecode-text)] sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--ecode-text-secondary)] sm:text-xl">
            {description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingLinkButton to={primaryAction.to}>{primaryAction.label}</MarketingLinkButton>
            <MarketingLinkButton to={secondaryAction.to} variant="secondary">
              {secondaryAction.label}
            </MarketingLinkButton>
          </div>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5"
            >
              <p className="text-3xl font-bold text-[var(--ecode-text)]">{metric.value}</p>
              <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-[var(--ecode-text-muted)]">
                {metric.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-8 text-[var(--ecode-text-secondary)]">{description}</p>
    </div>
  );
}

function TemplateMarketingCard({ template, featured = false }: { template: PublicTemplateCard; featured?: boolean }) {
  return (
    <article
      className={classNames(
        'flex min-h-[25rem] flex-col rounded-lg border bg-[var(--ecode-surface)] p-6 transition hover:-translate-y-1 hover:shadow-xl',
        featured
          ? 'border-[var(--ecode-accent)]/45 shadow-[0_18px_70px_-42px_rgba(242,98,7,0.85)]'
          : 'border-[var(--ecode-border)]',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--ecode-text-muted)]">
            {template.categoryName}
          </p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{template.name}</h3>
        </div>
        {template.trending ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ecode-accent)] px-3 py-1 text-[11px] font-semibold text-white">
            <Zap className="h-3 w-3" aria-hidden />
            Trending
          </span>
        ) : (
          <span className="rounded-full border border-[var(--ecode-border)] px-3 py-1 text-[11px] font-semibold text-[var(--ecode-text-secondary)]">
            {template.difficulty}
          </span>
        )}
      </div>
      <p className="mt-5 line-clamp-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">
        {template.description}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {template.technologies.slice(0, 4).map((technology) => (
          <span
            key={technology}
            className="rounded-full bg-[var(--ecode-surface-secondary)] px-3 py-1 text-[12px] font-medium text-[var(--ecode-text-secondary)]"
          >
            {technology}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-8">
        <div className="mb-4 flex items-center gap-4 text-[12px] text-[var(--ecode-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-4 w-4" aria-hidden />
            Official
          </span>
          <span className="inline-flex items-center gap-1">
            <Rocket className="h-4 w-4" aria-hidden />
            Free
          </span>
          <span className="inline-flex items-center gap-1">
            <Code2 className="h-4 w-4" aria-hidden />
            IDE-ready
          </span>
        </div>
        <MarketingLinkButton to={`/projects/new?template=${template.slug}`} fullWidth>
          Use template
        </MarketingLinkButton>
      </div>
    </article>
  );
}

function TemplateCompactCard({ template }: { template: PublicTemplateCard }) {
  return (
    <Link
      to={`/projects/new?template=${template.slug}`}
      className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 transition hover:-translate-y-1 hover:border-[var(--ecode-accent)]"
    >
      <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--ecode-text-muted)]">
        {template.categoryName}
      </p>
      <h3 className="mt-3 text-lg font-bold text-[var(--ecode-text)]">{template.name}</h3>
      <p className="mt-3 line-clamp-3 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
        {template.description}
      </p>
      <span className="mt-5 inline-flex items-center text-[13px] font-semibold text-[var(--ecode-accent)]">
        Use starter
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}

function CommunityPostCard({ post }: { post: PublicCommunityPost }) {
  return (
    <article className="flex min-h-[21rem] flex-col rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ecode-surface-secondary)] px-3 py-1 text-[12px] font-semibold text-[var(--ecode-text-secondary)]">
          <BookOpen className="h-3.5 w-3.5 text-[var(--ecode-accent)]" aria-hidden />
          {post.categoryName}
        </span>
        <time className="text-[12px] text-[var(--ecode-text-muted)]" dateTime={post.updatedAt}>
          {post.updatedAt.slice(0, 10)}
        </time>
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{post.title}</h3>
      <p className="mt-4 line-clamp-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">{post.summary}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {post.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-[var(--ecode-border)] px-3 py-1 text-[12px]">
            {tag}
          </span>
        ))}
      </div>
      <Link
        to={`/projects/new?template=${post.templateSlug}`}
        className="mt-auto inline-flex items-center pt-7 text-[13px] font-semibold text-[var(--ecode-accent)]"
      >
        Open related template
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

function ResourceCta({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description: string;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
}) {
  return (
    <section className="container-responsive pb-20 sm:pb-28">
      <div className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-8 text-center sm:p-12">
        <Sparkles className="mx-auto h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
        <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--ecode-text-secondary)]">{description}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <MarketingLinkButton to={primary.to}>{primary.label}</MarketingLinkButton>
          <MarketingLinkButton to={secondary.to} variant="secondary">
            {secondary.label}
          </MarketingLinkButton>
        </div>
      </div>
    </section>
  );
}

function MarketingLinkButton({
  children,
  fullWidth = false,
  to,
  variant = 'primary',
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link
      to={to}
      className={classNames(
        'inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-3 text-[13px] font-semibold transition',
        fullWidth ? 'w-full' : '',
        variant === 'primary'
          ? 'bg-[var(--ecode-accent)] text-white hover:bg-[var(--ecode-accent-hover)]'
          : 'border border-[var(--ecode-border)] bg-transparent text-[var(--ecode-text)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]',
      )}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Link>
  );
}
