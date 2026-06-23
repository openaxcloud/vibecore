import { BookOpen, Clock, Sparkles, Rocket, Database, Users, GitBranch, Terminal, ArrowRight } from 'lucide-react';
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

const levelStyles: Record<TutorialLevel, string> = {
  Beginner: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  Intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  Advanced: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
};

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
  const tutorials = [
    {
      icon: Sparkles,
      title: 'Build a full-stack app with the AI agent',
      level: 'Beginner' as TutorialLevel,
      duration: '15 min',
      description:
        'Go from a single prompt to a working full-stack app while the AI agent writes, runs and fixes the code for you.',
    },
    {
      icon: Rocket,
      title: 'Deploy to production',
      level: 'Beginner' as TutorialLevel,
      duration: '10 min',
      description:
        'Ship your project to a live URL in one click and learn how custom domains and environment variables work.',
    },
    {
      icon: Database,
      title: 'Connect a database',
      level: 'Intermediate' as TutorialLevel,
      duration: '20 min',
      description: 'Provision a Postgres database, model your schema and wire it into your app with type-safe queries.',
    },
    {
      icon: Users,
      title: 'Real-time collaboration',
      level: 'Intermediate' as TutorialLevel,
      duration: '18 min',
      description: 'Invite teammates into your workspace and edit, run and review code together with live presence.',
    },
    {
      icon: Terminal,
      title: 'Master the integrated terminal',
      level: 'Intermediate' as TutorialLevel,
      duration: '12 min',
      description:
        'Run scripts, manage processes and use the package manager inside your cloud workspace like a local shell.',
    },
    {
      icon: GitBranch,
      title: 'Git workflows & GitHub sync',
      level: 'Advanced' as TutorialLevel,
      duration: '25 min',
      description:
        'Branch, commit and push from inside the editor, then connect a GitHub repo for two-way sync and pull requests.',
    },
  ];

  const learningPaths = [
    {
      icon: Sparkles,
      title: 'From Idea to App',
      description:
        'Start with nothing but a prompt and finish with a deployed product. Perfect for first-time builders.',
      steps: ['Build with the AI agent', 'Iterate on your design', 'Deploy to production'],
    },
    {
      icon: Database,
      title: 'Full-Stack Foundations',
      description: 'Learn the core building blocks of a production app — data, APIs and authentication.',
      steps: ['Connect a database', 'Add an API layer', 'Secure with auth'],
    },
    {
      icon: Users,
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
              <BookOpen className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-tutorials">
                Tutorials
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Learn to build, deploy and collaborate with the AI agent — one short, hands-on lesson at a time.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Step-by-step, no setup required
              </Badge>
            </div>
          </div>
        </section>

        {/* Tutorials Grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Browse Tutorials</h2>

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
                        <Icon className="h-10 w-10 mb-2" style={{ color: 'var(--ecode-accent)' }} />
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`text-[12px] ${levelStyles[tutorial.level]}`}>{tutorial.level}</Badge>
                          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {tutorial.duration}
                          </span>
                        </div>
                        <CardTitle className="text-lg">{tutorial.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <p className="text-[13px] text-muted-foreground">{tutorial.description}</p>
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
              <h2 className="text-3xl font-bold mb-4">Learning Paths</h2>
              <p className="text-[15px] text-muted-foreground">
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
                        <Icon className="h-10 w-10 mb-2" style={{ color: 'var(--ecode-accent)' }} />
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
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to start building?</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Open a workspace and let the AI agent turn your first idea into a running app in minutes.
            </p>
            <button
              className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-md min-h-[44px] hover:opacity-90"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              onClick={() => (window.location.href = '/')}
              data-testid="button-tutorials-start"
            >
              Start building
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
