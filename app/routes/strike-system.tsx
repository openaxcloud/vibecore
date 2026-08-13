import { Gavel } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Strike system - E-Code' },
  {
    name: 'description',
    content: 'How E-Code moderation strikes work: the warning-to-suspension ladder, expiry, and how to appeal.',
  },
];

/*
 * Public, plain-language explanation of the moderation strike ladder that E-Code
 * actually enforces (services/api/src/strike-system.ts): Warning → Community
 * restriction → Account suspension, strikes expire after 180 days, appeals go to
 * a real inbox. Reworded for E-Code — not copied from any other platform.
 */
const page = {
  slug: 'strike-system',
  title: 'Strike system',
  eyebrow: 'Legal',
  description:
    'When a project or account breaks our Acceptable Use Policy or Terms, we apply moderation strikes on a clear, escalating ladder. This page explains what each step means and how to appeal.',
  kind: 'legal',
  icon: Gavel,
  primaryAction: ['Report abuse', '/report-abuse'],
  secondaryAction: ['Read acceptable use', '/acceptable-use'],
  highlights: ['Warning first', 'Escalates on repeat', 'Strikes expire', 'Appeal any action'],
  sections: [
    {
      title: 'How strikes escalate',
      body: 'Most issues start with a warning. Repeated or more serious violations move up the ladder. A single severe violation (for example illegal content, or using the platform to attack others) can jump straight to account suspension.',
      items: [
        '1 strike — Warning: a notice that content or conduct broke our rules',
        '3 strikes — Community restriction: your workspace and IDE keep working, but public posting and app sharing are paused',
        '4 strikes — Account suspension: sign-in is blocked and associated apps may be removed',
        'Severe violations can escalate immediately, skipping earlier steps',
      ],
    },
    {
      title: 'Strikes expire',
      body: 'Strikes are not permanent. An individual strike stops counting toward escalation after 180 days, so a first mistake does not follow you forever once you are back in good standing.',
      items: ['180-day expiry per strike', 'Good standing restored automatically', 'History kept for audit only'],
    },
    {
      title: 'What triggers a strike',
      body: 'Strikes follow real violations of our Acceptable Use Policy, Terms of Service, or Trust & Safety rules — not normal building. Automated abuse signals (for example crypto-mining, reverse shells, or mass credential testing) can also open a case that a human reviews.',
      items: ['Acceptable Use / Terms violations', 'Trust & Safety violations', 'Confirmed automated-abuse signals'],
    },
    {
      title: 'How to appeal',
      body: 'If you believe an action was a mistake, you can appeal. Email our appeals inbox with your account email, the action you are contesting, and why you think it was wrong. We review every appeal.',
      items: [
        'Email appeals@e-code.ai',
        'Include your account email',
        'Describe the contested action',
        'We review each case',
      ],
    },
  ],
} satisfies MarketingPageDefinition;

export default function StrikeSystemPage() {
  return <MarketingStaticPage page={page} />;
}
