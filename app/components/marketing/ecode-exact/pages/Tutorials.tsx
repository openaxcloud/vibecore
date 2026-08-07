import { ArrowRight, BookOpen, Clock, Layers, Rocket, Terminal, Users, Wand2, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { SiGithub, SiPostgresql } from 'react-icons/si';

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
import {
  formatGuidesPoliciesInteger,
  formatTutorialDuration,
  getMarketingExactGuidesPoliciesCopy,
  type LearningPathId,
  type TutorialId,
  type TutorialLevelId,
} from '~/lib/i18n/catalogs/marketing-exact-guides-policies';

type TutorialIcon = LucideIcon | IconType;

const LEVEL_STYLES: Record<TutorialLevelId, string> = {
  beginner: 'border border-border bg-muted text-muted-foreground',
  intermediate: 'border border-border bg-surface-solid text-foreground',
  advanced: 'border border-primary/25 bg-primary/10 text-primary',
};

const TUTORIAL_ICONS: Record<TutorialId, TutorialIcon> = {
  agent: Wand2,
  deploy: Rocket,
  database: SiPostgresql,
  collaboration: Users,
  terminal: Terminal,
  git: SiGithub,
};

const TUTORIAL_HREFS: Record<TutorialId, string> = {
  agent: '/docs#build-a-full-stack-app-with-the-ai-agent',
  deploy: '/docs#deploy-to-production',
  database: '/docs#connect-a-database',
  collaboration: '/docs#real-time-collaboration',
  terminal: '/docs#master-the-integrated-terminal',
  git: '/docs#git-workflows-and-github-sync',
};

const TUTORIAL_MINUTES: Record<TutorialId, number> = {
  agent: 15,
  deploy: 10,
  database: 20,
  collaboration: 18,
  terminal: 12,
  git: 25,
};

const LEARNING_PATH_ICONS: Record<LearningPathId, TutorialIcon> = {
  idea: Wand2,
  fullStack: Layers,
  team: Workflow,
};

const LEARNING_PATH_HREFS: Record<LearningPathId, string> = {
  idea: '/docs#from-idea-to-app',
  fullStack: '/docs#full-stack-foundations',
  team: '/docs#ship-as-a-team',
};

export function tutorialHref(title: string): string {
  const anchor = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return anchor ? `/docs#${anchor}` : '/docs';
}

export default function Tutorials() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactGuidesPoliciesCopy(language).exactTutorials;

  const tutorials = copy.tutorials.items.map((tutorial) => ({
    ...tutorial,
    href: TUTORIAL_HREFS[tutorial.id],
    icon: TUTORIAL_ICONS[tutorial.id],
    levelLabel: copy.tutorials.levels[tutorial.level],
    minutes: TUTORIAL_MINUTES[tutorial.id],
  }));

  const learningPaths = copy.paths.items.map((path) => ({
    ...path,
    href: LEARNING_PATH_HREFS[path.id],
    icon: LEARNING_PATH_ICONS[path.id],
  }));

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-tutorials">
      <PublicNavbar />

      <main className="flex-1">
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <BookOpen className="h-7 w-7" aria-hidden />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-tutorials">
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

            <figure className="relative mt-12 max-w-5xl mx-auto">
              <div
                className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative overflow-hidden rounded-xl border border-border bg-surface-solid shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2.5 sm:px-4">
                  <span className="flex gap-2" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  </span>
                  <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground sm:text-[13px]">
                    {copy.figure.workspaceLabel}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide.png"
                  alt={copy.figure.imageAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block h-auto w-full"
                  data-testid="img-tutorials-ide"
                />
              </div>
              <figcaption className="mt-3 px-1 text-center text-[11px] text-muted-foreground sm:text-[13px]">
                {copy.figure.caption}
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">{copy.tutorials.title}</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tutorials.map((tutorial) => {
                const Icon = tutorial.icon;

                return (
                  <a
                    key={tutorial.id}
                    href={tutorial.href}
                    className="group block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                    data-testid="link-tutorial"
                  >
                    <Card className="flex h-full min-w-0 flex-col transition-shadow group-hover:shadow-md">
                      <CardHeader className="min-w-0">
                        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                          <Badge
                            className={`max-w-full whitespace-normal text-center text-[12px] ${LEVEL_STYLES[tutorial.level]}`}
                          >
                            {tutorial.levelLabel}
                          </Badge>
                          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            {formatTutorialDuration(tutorial.minutes, language)}
                          </span>
                        </div>
                        <CardTitle className="mkt-h3 break-words">{tutorial.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <p className="mkt-body break-words text-muted-foreground">{tutorial.description}</p>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold mb-4">{copy.paths.title}</h2>
              <p className="mkt-lead text-muted-foreground">{copy.paths.description}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {learningPaths.map((path) => {
                const Icon = path.icon;

                return (
                  <a
                    key={path.id}
                    href={path.href}
                    className="group block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2"
                    data-testid="link-learning-path"
                  >
                    <Card className="flex h-full min-w-0 flex-col transition-shadow group-hover:shadow-md">
                      <CardHeader className="min-w-0">
                        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <CardTitle className="break-words">{path.title}</CardTitle>
                        <CardDescription className="break-words">{path.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <ol className="space-y-3">
                          {path.steps.map((step, index) => (
                            <li key={step} className="flex min-w-0 items-center gap-3 text-[13px]">
                              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
                                {formatGuidesPoliciesInteger(index + 1, language)}
                              </span>
                              <span className="min-w-0 break-words">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-muted px-6 py-12 text-center sm:px-12 sm:py-16">
              <div
                className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 bg-gradient-to-r from-primary/25 to-primary/5 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative">
                <h2 className="mkt-h2 font-bold mb-4">{copy.cta.title}</h2>
                <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">{copy.cta.description}</p>
                <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <a
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                    href="/signup"
                    data-testid="button-tutorials-start"
                  >
                    {copy.cta.primary}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-solid px-6 py-3 text-foreground transition-colors hover:bg-surface-hover-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                    href="/dashboard"
                    data-testid="link-tutorials-dashboard"
                  >
                    {copy.cta.secondary}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
