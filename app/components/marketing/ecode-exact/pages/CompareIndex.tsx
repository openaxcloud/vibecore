import { ArrowRight, Bot, Cloud, GitBranch, Rocket, Scale, Shield, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { comparePages } from '~/components/marketing/EcodeMarketingPages';
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

/*
 * Per-competitor card icons; falls back to a generic Scale icon for any slug
 * not listed here so the card list can't drift from comparePages.
 */
const compareIcons: Record<string, LucideIcon> = {
  'github-codespaces': Cloud,
  glitch: Sparkles,
  heroku: Zap,
  codesandbox: Bot,
  'aws-cloud9': Cloud,
};

/*
 * Derive the comparison cards from comparePages so every card links to a real
 * detail page (/compare/<slug>) and competitors without a page can't appear.
 */
const comparisons = Object.values(comparePages).map((page) => ({
  slug: page.slug,
  name: page.title,
  icon: compareIcons[page.slug] ?? Scale,
  blurb: page.description,
}));

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
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">How E-Code compares</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-bolt-elements-textSecondary">
            See how E-Code stacks up against other AI development platforms — from prompt to production.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12">
          <div className="grid gap-5 sm:grid-cols-2">
            {comparisons.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.slug} className="transition-colors hover:border-[var(--ecode-accent)]">
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
                      href={`/compare/${item.slug}`}
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
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Why teams choose E-Code</h2>
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
