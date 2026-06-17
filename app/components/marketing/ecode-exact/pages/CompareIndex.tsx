import { ArrowRight, Bot, Cloud, GitBranch, Rocket, Shield, Sparkles, Zap } from 'lucide-react';

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

const comparisons = [
  {
    name: 'VibeCore vs Replit',
    icon: Sparkles,
    blurb: 'Agentic full-stack builds, managed AI keys and effort-based credits — without per-user key setup.',
  },
  {
    name: 'VibeCore vs Cursor',
    icon: Bot,
    blurb: 'A complete cloud workspace — editor, terminal, preview, deploys — not just an AI editor on your machine.',
  },
  {
    name: 'VibeCore vs GitHub Codespaces',
    icon: Cloud,
    blurb: 'Instant AI app generation and one-click production deploys, with built-in databases and collaboration.',
  },
  {
    name: 'VibeCore vs Bolt',
    icon: Zap,
    blurb:
      'Production-grade runtime, real deployments, teams, billing and enterprise controls on top of fast prototyping.',
  },
];

const reasons = [
  {
    icon: Rocket,
    title: 'Prompt to production',
    description: 'Generate, preview and deploy a full-stack app in minutes — no setup.',
  },
  { icon: Bot, title: 'Managed AI', description: 'Admin-provided models and effort-based credits — users just build.' },
  {
    icon: GitBranch,
    title: 'Real collaboration',
    description: 'Multiplayer editing, comments, presence and shared workspaces.',
  },
  {
    icon: Shield,
    title: 'Enterprise ready',
    description: 'SSO/SAML, single-tenant, VPC peering, audit logs and static egress IPs.',
  },
];

export default function CompareIndex() {
  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <PublicNavbar />
      <main>
        <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <Badge>Comparisons</Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">How VibeCore compares</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-bolt-elements-textSecondary">
            See how VibeCore stacks up against other AI development platforms — from prompt to production.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12">
          <div className="grid gap-5 sm:grid-cols-2">
            {comparisons.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.name} className="transition-colors hover:border-[var(--ecode-accent)]">
                  <CardHeader>
                    <div
                      className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-bolt-elements-background-depth-2"
                      style={{ color: 'var(--ecode-accent)' }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle>{item.name}</CardTitle>
                    <CardDescription>{item.blurb}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <a
                      href="/compare"
                      className="inline-flex items-center gap-1 text-sm font-medium"
                      style={{ color: 'var(--ecode-accent)' }}
                    >
                      See comparison <ArrowRight className="h-4 w-4" />
                    </a>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Why teams choose VibeCore</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.map((reason) => {
              const Icon = reason.icon;
              return (
                <div
                  key={reason.title}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5"
                >
                  <Icon className="h-6 w-6" style={{ color: 'var(--ecode-accent)' }} />
                  <h3 className="mt-3 font-semibold">{reason.title}</h3>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{reason.description}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white"
              style={{ background: 'var(--ecode-accent)' }}
            >
              Start building free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
