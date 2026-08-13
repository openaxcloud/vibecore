import { ShieldAlert } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Trust & Safety - E-Code' },
  {
    name: 'description',
    content: 'Prohibited content and conduct on E-Code, how we detect and enforce, child safety, and how to report.',
  },
];

/*
 * Public Trust & Safety policy. Prohibited conduct and enforcement reflect E-Code's
 * real abuse detection (packages/security AbuseSignal: crypto_mining, reverse_shell,
 * malware, etc. → stop_workspace / suspend_org / manual_review) and the strike ladder.
 * Reworded for E-Code — not copied from any other platform.
 */
const page = {
  slug: 'trust-and-safety',
  title: 'Trust & Safety',
  eyebrow: 'Trust',
  description:
    'E-Code is a place to build and ship real software. These rules keep the platform safe for everyone, and explain how we detect abuse, enforce, and let you report problems.',
  kind: 'legal',
  icon: ShieldAlert,
  primaryAction: ['Report a problem', '/report-abuse'],
  secondaryAction: ['Read acceptable use', '/acceptable-use'],
  highlights: ['Clear rules', 'Automated + human review', 'Child safety', 'Report anything'],
  sections: [
    {
      title: 'Prohibited content and conduct',
      body: 'You may not use E-Code to create, host, or distribute content that is illegal or that harms others. This includes attacking other systems and abusing our infrastructure.',
      items: [
        'No illegal content or activity',
        'No malware, phishing, or credential theft',
        'No harassment, hate, or threats',
        'No attacks, scanning, or unauthorized access to other systems',
        'No crypto-mining or compute-only workloads',
      ],
    },
    {
      title: 'Child safety',
      body: 'Child sexual abuse material (CSAM) and any sexualization of minors are strictly prohibited and have zero tolerance. We remove such content, suspend accounts, preserve evidence, and report to the appropriate authorities and NCMEC as required by law.',
      items: ['Zero tolerance for CSAM', 'Immediate removal and suspension', 'Reported to authorities / NCMEC'],
    },
    {
      title: 'How we detect and enforce',
      body: 'We combine automated abuse signals with human review. Runtime signals — such as crypto-mining, reverse shells, malware downloads, port scanning, or credential-testing spikes — can throttle or stop a workspace and open a case a person reviews. Confirmed violations move up the strike ladder.',
      items: [
        'Automated runtime abuse signals',
        'Workspace throttle or stop on serious signals',
        'Human review before lasting action',
        'Escalation via the strike system',
      ],
    },
    {
      title: 'How to report',
      body: 'If you see content or behavior that breaks these rules, tell us. Reports go to a real intake that our team reviews. Urgent safety issues are prioritized.',
      items: [
        'Use Report Abuse for content/conduct',
        'Use the Security page for vulnerabilities',
        'Urgent safety issues are prioritized',
      ],
    },
    {
      title: 'Appeals',
      body: 'Enforcement can be appealed. If you think we got it wrong, email our appeals inbox with your account email and the details, and a person will review it.',
      items: ['Email appeals@e-code.ai', 'Include account email and context', 'Every appeal is reviewed'],
    },
  ],
} satisfies MarketingPageDefinition;

export default function TrustAndSafetyPage() {
  return <MarketingStaticPage page={page} />;
}
