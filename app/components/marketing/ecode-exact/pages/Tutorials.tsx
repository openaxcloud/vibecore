import type { LucideIcon } from 'lucide-react';
import { BookOpen, Clock, Wand2, Rocket, Users, Terminal, ArrowRight, Layers, Workflow } from 'lucide-react';
import type { IconType } from 'react-icons';
import { SiPostgresql, SiGithub } from 'react-icons/si';
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

type TutorialLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/**
 * Level pills, kept on-theme: neutral dark surfaces with an orange accent for
 * the most advanced tier so nothing reads as off-brand blue/indigo/purple.
 */
const levelStyles: Record<TutorialLevel, string> = {
  Beginner: 'bg-bolt-elements-background-depth-3 text-muted-foreground border border-bolt-elements-borderColor',
  Intermediate: 'bg-bolt-elements-background-depth-3 text-foreground border border-bolt-elements-borderColor',
  Advanced: 'bg-[#F26207]/12 text-[#F26207] border border-[#F26207]/25',
};

type TutorialIcon = LucideIcon | IconType;

/**
 * Build the docs deep-link for a tutorial or learning-path entry.
 *
 * There is no per-tutorial detail route yet, so every lesson points at the
 * canonical `/docs` page and scrolls to a stable, slugified anchor derived
 * from its title. Centralising the logic keeps every card linking to a real,
 * reachable destination (and makes the slugging unit-testable).
 */
export function tutorialHref(title: string): string {
  const anchor = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return anchor ? `/docs#${anchor}` : '/docs';
}

export default function Tutorials() {
  const tutorials: Array<{
    icon: TutorialIcon;
    title: string;
    level: TutorialLevel;
    duration: string;
    description: string;
  }> = [
    {
      icon: Wand2,
      title: 'Build a full-stack app with the AI agent',
      level: 'Beginner',
      duration: '15 min',
      description:
        'Go from a single prompt to a working full-stack app while the AI agent writes, runs and fixes the code for you.',
    },
    {
      icon: Rocket,
      title: 'Deploy to production',
      level: 'Beginner',
      duration: '10 min',
      description:
        'Ship your project to a live URL in one click and learn how custom domains and environment variables work.',
    },
    {
      icon: SiPostgresql,
      title: 'Connect a database',
      level: 'Intermediate',
      duration: '20 min',
      description: 'Provision a Postgres database, model your schema and wire it into your app with type-safe queries.',
    },
    {
      icon: Users,
      title: 'Real-time collaboration',
      level: 'Intermediate',
      duration: '18 min',
      description: 'Invite teammates into your workspace and edit, run and review code together with live presence.',
    },
    {
      icon: Terminal,
      title: 'Master the integrated terminal',
      level: 'Intermediate',
      duration: '12 min',
      description:
        'Run scripts, manage processes and use the package manager inside your cloud workspace like a local shell.',
    },
    {
      icon: SiGithub,
      title: 'Git workflows & GitHub sync',
      level: 'Advanced',
      duration: '25 min',
      description:
        'Branch, commit and push from inside the editor, then connect a GitHub repo for two-way sync and pull requests.',
    },
  ];

  const learningPaths: Array<{
    icon: TutorialIcon;
    title: string;
    description: string;
    steps: string[];
  }> = [
    {
      icon: Wand2,
      title: 'From Idea to App',
      description:
        'Start with nothing but a prompt and finish with a deployed product. Perfect for first-time builders.',
      steps: ['Build with the AI agent', 'Iterate on your design', 'Deploy to production'],
    },
    {
      icon: Layers,
      title: 'Full-Stack Foundations',
      description: 'Learn the core building blocks of a production app — data, APIs and authentication.',
      steps: ['Connect a database', 'Add an API layer', 'Secure with auth'],
    },
    {
      icon: Workflow,
      title: 'Ship as a Team',
      description: 'Collaborate, review and release together with the workflows real engineering teams rely on.',
      steps: ['Real-time collaboration', 'Git & GitHub sync', 'Production deploys'],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-tutorials">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span
                className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-5 ring-1 ring-[#F26207]/25"
                style={{ backgroundColor: 'rgba(242, 98, 7, 0.12)' }}
              >
                <BookOpen className="h-7 w-7" style={{ color: 'var(--ecode-accent)' }} />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-tutorials">
                Tutorials
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Learn to build, deploy and collaborate with the AI agent — one short, hands-on lesson at a time.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Step-by-step, no setup required
              </Badge>
            </div>

            {/* Real product capture: the workspace every tutorial happens in */}
            <figure className="relative mt-12 max-w-5xl mx-auto">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-2 text-[11px] sm:text-[13px] text-muted-foreground font-medium truncate">
                    E-Code Workspace
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide.png"
                  alt="The E-Code workspace used throughout the tutorials: the AI Agent panel, code editor, file tree and live preview side by side"
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-tutorials-ide"
                />
              </div>
              <figcaption className="mt-3 text-center text-[11px] sm:text-[13px] text-muted-foreground px-1">
                Every lesson runs in the same browser-based workspace — no local setup required.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Tutorials Grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">Browse Tutorials</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tutorials.map((tutorial) => {
                const Icon = tutorial.icon;
                return (
                  <a
                    key={tutorial.title}
                    href={tutorialHref(tutorial.title)}
                    className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ ['--tw-ring-color' as string]: 'var(--ecode-accent)' }}
                    data-testid="link-tutorial"
                  >
                    <Card className="flex flex-col h-full transition-shadow group-hover:shadow-md">
                      <CardHeader>
                        <span
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl mb-3 ring-1 ring-[#F26207]/20"
                          style={{ backgroundColor: 'rgba(242, 98, 7, 0.1)' }}
                        >
                          <Icon className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                        </span>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`text-[12px] ${levelStyles[tutorial.level]}`}>{tutorial.level}</Badge>
                          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {tutorial.duration}
                          </span>
                        </div>
                        <CardTitle className="mkt-h3">{tutorial.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <p className="mkt-body text-muted-foreground">{tutorial.description}</p>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* Learning Paths */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold mb-4">Learning Paths</h2>
              <p className="mkt-lead text-muted-foreground">
                Follow a guided sequence of tutorials to build a complete skill set, from your first prompt to shipping
                with a team.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {learningPaths.map((path) => {
                const Icon = path.icon;
                return (
                  <a
                    key={path.title}
                    href={tutorialHref(path.title)}
                    className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ ['--tw-ring-color' as string]: 'var(--ecode-accent)' }}
                    data-testid="link-learning-path"
                  >
                    <Card className="flex flex-col h-full transition-shadow group-hover:shadow-md">
                      <CardHeader>
                        <span
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl mb-3 ring-1 ring-[#F26207]/20"
                          style={{ backgroundColor: 'rgba(242, 98, 7, 0.1)' }}
                        >
                          <Icon className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                        </span>
                        <CardTitle>{path.title}</CardTitle>
                        <CardDescription>{path.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <ol className="space-y-3">
                          {path.steps.map((step, index) => (
                            <li key={step} className="flex items-center gap-3 text-[13px]">
                              <span
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                                style={{ backgroundColor: 'var(--ecode-accent)' }}
                              >
                                {index + 1}
                              </span>
                              <span>{step}</span>
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

        {/* CTA */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-12 sm:px-12 sm:py-16 text-center">
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[36rem] max-w-full bg-gradient-to-r from-[#F26207]/25 to-[#F99D25]/25 blur-3xl pointer-events-none" />
              <div className="relative">
                <h2 className="mkt-h2 font-bold mb-4">Ready to start building?</h2>
                <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Open a workspace and let the AI agent turn your first idea into a running app in minutes — free to
                  start, no credit card required.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 text-white rounded-md min-h-[44px] w-full sm:w-auto hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: 'var(--ecode-accent)' }}
                    href="/signup"
                    data-testid="button-tutorials-start"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-foreground hover:bg-bolt-elements-background-depth-3 transition-colors"
                    href="/dashboard"
                    data-testid="link-tutorials-dashboard"
                  >
                    Open dashboard
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
