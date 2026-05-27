import type { MetaFunction } from '@remix-run/cloudflare';
import { CheckCircle2 } from 'lucide-react';
import { LinkButton, PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [
  { title: 'Pricing - E-Code' },
  { name: 'description', content: 'E-code Free, Pro, Team and Enterprise pricing.' },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    detail: '$0 for learning and small projects.',
    features: ['Starter workspace', 'Public templates', 'Visible quotas before use'],
  },
  {
    name: 'Pro',
    price: '$20',
    detail: '$20 per user monthly for private projects, agents and deploys.',
    features: ['Private projects', 'AI agents', 'Deployments'],
  },
  {
    name: 'Team',
    price: '$40',
    detail: '$40 per user monthly with roles, billing controls and shared secrets.',
    features: ['Roles', 'Billing controls', 'Shared secrets'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    detail: 'Custom security, SSO, audit logs and dedicated GCP architecture.',
    features: ['SAML/OIDC', 'Audit logs', 'Dedicated GCP architecture'],
  },
];

const pricingFaq = [
  {
    question: 'Do annual plans receive a discount?',
    answer: 'Yes. Compute, storage and AI quotas are visible before use so teams can plan costs and guardrails.',
  },
  {
    question: 'How do annual discounts and quotas work?',
    answer: 'Annual billing receives a discount. Compute, storage and AI quotas are visible before use.',
  },
] as const;

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
              {plan.name === 'Pro' || plan.name === 'Team' ? (
                <p className="mt-1 text-xs font-medium uppercase text-bolt-elements-textTertiary">per user / month</p>
              ) : null}
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
                <LinkButton to={plan.name === 'Enterprise' ? '/contact-sales' : 'https://app.e-code.ai/register'}>
                  {plan.name === 'Enterprise' ? 'Contact sales' : 'Start'}
                </LinkButton>
              </div>
            </div>
          ))}
        </div>
        <section className="mt-10">
          <h2 className="text-lg font-semibold">FAQ</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {pricingFaq.map((item) => (
              <article
                key={item.question}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5"
              >
                <h3 className="text-sm font-semibold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </PublicShell>
  );
}
