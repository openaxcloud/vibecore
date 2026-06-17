import {
  Activity,
  CheckCircle,
  Server,
  Boxes,
  Rocket,
  Bot,
  LayoutDashboard,
  Database,
  CalendarCheck,
} from 'lucide-react';
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

export default function StatusPage() {
  const components = [
    {
      icon: Server,
      name: 'API',
      description: 'REST and GraphQL endpoints powering the platform',
      uptime: '99.99%',
    },
    {
      icon: Boxes,
      name: 'Workspaces',
      description: 'Cloud development environments and runtimes',
      uptime: '99.98%',
    },
    {
      icon: Rocket,
      name: 'Deployments',
      description: 'Build pipelines and hosting infrastructure',
      uptime: '99.97%',
    },
    {
      icon: Bot,
      name: 'AI Agent',
      description: 'Code generation and autonomous assistance',
      uptime: '99.96%',
    },
    {
      icon: LayoutDashboard,
      name: 'Dashboard',
      description: 'Web console and project management UI',
      uptime: '100.00%',
    },
    {
      icon: Database,
      name: 'Database',
      description: 'Managed Postgres and persistent storage',
      uptime: '99.99%',
    },
  ];

  const uptimeWindows = [
    { label: 'Last 24 hours', value: '100.00%' },
    { label: 'Last 7 days', value: '99.99%' },
    { label: 'Last 30 days', value: '99.98%' },
    { label: 'Last 90 days', value: '99.98%' },
  ];

  // Static presentational uptime bars — 90 days, all operational.
  const uptimeDays = Array.from({ length: 90 }, (_, index) => index);

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-status">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Activity className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-status">
                System Status
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Real-time status and uptime for all E-Code services
              </p>

              <div className="flex items-center justify-center gap-3 rounded-lg border border-green-600/30 bg-green-600/10 px-6 py-4 max-w-md mx-auto">
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                <span className="text-[15px] font-semibold text-green-700 dark:text-green-400">
                  All systems operational
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Components */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Components</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {components.map((component) => {
                const Icon = component.icon;
                return (
                  <Card key={component.name}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3">
                          <Icon className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                          <div>
                            <h3 className="font-semibold">{component.name}</h3>
                            <p className="text-[13px] text-muted-foreground">{component.description}</p>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
                        >
                          Operational
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>{component.uptime} uptime over 90 days</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* 90-day uptime summary */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">90-Day Uptime</h2>

            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Overall Availability</CardTitle>
                  <CardDescription>Aggregate uptime across all E-Code services</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap gap-1" aria-hidden="true">
                    {uptimeDays.map((day) => (
                      <span
                        key={day}
                        className="h-8 flex-1 min-w-[3px] rounded-sm bg-green-600/70"
                        title="Operational"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>90 days ago</span>
                    <span>99.98% uptime</span>
                    <span>Today</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
                    {uptimeWindows.map((window) => (
                      <div key={window.label} className="text-center">
                        <p className="text-2xl font-bold text-green-600">{window.value}</p>
                        <p className="text-[13px] text-muted-foreground">{window.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Recent incidents */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Recent Incidents</h2>

            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="flex flex-col items-center text-center p-12">
                  <CalendarCheck className="h-12 w-12 text-green-600 mb-4" />
                  <h3 className="font-semibold mb-2">No incidents reported</h3>
                  <p className="text-[15px] text-muted-foreground max-w-xl">
                    All systems have been running smoothly. There are no incidents to report over the past 90 days.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
