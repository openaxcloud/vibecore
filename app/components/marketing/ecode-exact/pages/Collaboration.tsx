import {
  Users,
  MousePointer2,
  PencilLine,
  MessageSquare,
  FolderGit2,
  Eye,
  ShieldCheck,
  Rocket,
  GraduationCap,
  Building2,
} from 'lucide-react';
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

export default function Collaboration() {
  const features = [
    {
      icon: MousePointer2,
      title: 'Multiplayer Cursors',
      description: 'See every teammate move through the editor in real time, each with their own color and name.',
    },
    {
      icon: PencilLine,
      title: 'Live Editing',
      description: 'Type together in the same file with conflict-free sync — no refreshing, no overwriting.',
    },
    {
      icon: MessageSquare,
      title: 'Inline Comments',
      description: 'Drop threaded comments on any line of code and resolve discussions where the work happens.',
    },
    {
      icon: FolderGit2,
      title: 'Shared Workspaces',
      description: 'One workspace, one URL. Invite your team and everyone lands in the same running environment.',
    },
    {
      icon: Eye,
      title: 'Live Presence',
      description: 'Know who is online, which file they are viewing, and what the AI agent is doing right now.',
    },
    {
      icon: ShieldCheck,
      title: 'Roles & Permissions',
      description: 'Granular access controls — owner, editor, and viewer roles keep your projects safe.',
    },
  ];

  const useCases = [
    {
      icon: Rocket,
      title: 'Pair Programming',
      description: 'Build features side by side with a teammate or with the E-Code AI agent, all in one session.',
    },
    {
      icon: GraduationCap,
      title: 'Teaching & Onboarding',
      description: 'Guide new developers through a live codebase with shared cursors and inline explanations.',
    },
    {
      icon: Building2,
      title: 'Team Projects',
      description: 'Coordinate a whole team across shared workspaces with clear roles and reviewable comments.',
    },
  ];

  const presenceSignals = [
    {
      title: 'Active Editors',
      description: 'Live avatars show exactly who is typing in the project at any moment.',
    },
    {
      title: 'Follow Mode',
      description: 'Jump to a teammate and follow their cursor through files as they navigate.',
    },
    {
      title: 'Agent Activity',
      description: 'Watch the AI agent plan, edit, and run commands alongside your team in real time.',
    },
    {
      title: 'Comment Threads',
      description: 'Resolve, reopen, and reply to feedback without ever leaving the editor.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-collaboration">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Users className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-collaboration">
                Build together, in real time
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Code, comment, and ship side by side. E-Code brings your whole team — and the AI agent — into one
                shared, always-live workspace.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Real-Time Multiplayer
              </Badge>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Collaboration Features</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mb-2">{feature.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Presence Detail */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Always know who is here</h2>

              <Card>
                <CardHeader>
                  <CardTitle>Presence that keeps everyone in sync</CardTitle>
                  <CardDescription>
                    E-Code surfaces live signals so your team never steps on each other&apos;s work
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  {presenceSignals.map((signal) => (
                    <div key={signal.title}>
                      <h4 className="font-semibold mb-2">{signal.title}</h4>
                      <p className="text-muted-foreground">{signal.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">How teams use it</h2>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {useCases.map((useCase) => {
                const Icon = useCase.icon;
                return (
                  <Card key={useCase.title}>
                    <CardContent className="pt-6">
                      <Icon className="h-10 w-10 mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mb-2">{useCase.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{useCase.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Start building together today</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Spin up a shared workspace, invite your team, and let everyone — including the AI agent — code in the same
              place at the same time.
            </p>
            <button
              className="px-6 py-3 text-primary-foreground rounded-md min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              onClick={() => (window.location.href = '/register')}
              data-testid="button-collaboration-cta"
            >
              Create a Shared Workspace
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
