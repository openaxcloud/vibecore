import type { MetaFunction } from '@remix-run/cloudflare';
import { CheckCircle2 } from 'lucide-react';
import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Pricing - VibeCore' }];

const plans = [
  {
    name: 'Free',
    price: '$0',
    detail: 'One active workspace, limited projects and public templates.',
    features: ['1 workspace', 'Limited AI tokens', 'Small runtime'],
  },
  {
    name: 'Pro',
    price: '$29',
    detail: 'More projects, stronger models, private previews and deployments.',
    features: ['More storage', 'Private previews', 'Deployments'],
  },
  {
    name: 'Team',
    price: '$99',
    detail: 'Org members, collaboration, shared billing and audit logs.',
    features: ['Team members', 'Audit logs', 'Shared billing'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    detail: 'SSO, SCIM, custom quotas, audit export and private deployment.',
    features: ['SAML/OIDC', 'SCIM', 'Premium support'],
  },
];

export default function PricingPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Pricing</h1>
        <p className="mt-3 max-w-2xl text-sm text-bolt-elements-textSecondary">
          Plans map directly to backend-enforced quotas for projects, runtime, AI, storage, previews and collaboration.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
            >
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-2 text-3xl font-semibold">{plan.price}</p>
              <p className="mt-3 min-h-16 text-sm text-bolt-elements-textSecondary">{plan.detail}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <LinkButton to={plan.name === 'Enterprise' ? '/contact-sales' : '/signup'}>
                  {plan.name === 'Enterprise' ? 'Contact sales' : 'Start'}
                </LinkButton>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
