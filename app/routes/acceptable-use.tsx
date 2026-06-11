import type { MetaFunction } from '@remix-run/cloudflare';
import { ShieldCheck } from 'lucide-react';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [{ title: 'Acceptable use - E-Code' }];

const page = {
  slug: 'acceptable-use',
  title: 'Acceptable use policy',
  eyebrow: 'Legal',
  description:
    'The public E-Code acceptable use policy for safe project generation, runtime usage, AI workflows and abuse response.',
  kind: 'legal',
  icon: ShieldCheck,
  primaryAction: ['Report abuse', '/report-abuse'],
  secondaryAction: ['Review security', '/security'],
  highlights: ['No attacks', 'No credential abuse', 'No hidden miners', 'No unauthorized background services'],
  sections: [
    {
      title: 'Workspace safety',
      body: 'Do not use workspaces to attack systems, evade rate limits, mine cryptocurrency, exfiltrate secrets or run unapproved background services.',
      items: ['No scanning or exploitation', 'No rate-limit evasion', 'No crypto mining', 'No secret exfiltration'],
    },
    {
      title: 'AI usage boundaries',
      body: 'AI tools must stay within authorized projects and may not be used to bypass access controls or leak provider credentials.',
      items: [
        'Authorized projects only',
        'Respect access controls',
        'Protect provider credentials',
        'Preserve auditability',
      ],
    },
    {
      title: 'Abuse response',
      body: 'Abuse events can result in workspace suspension, organization restrictions and audit escalation.',
      items: ['Workspace suspension', 'Organization restrictions', 'Audit escalation', 'Support review'],
    },
  ],
} satisfies MarketingPageDefinition;

export default function AcceptableUsePage() {
  return <MarketingStaticPage page={page} />;
}
