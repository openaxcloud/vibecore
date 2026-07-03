import type { MetaFunction } from 'react-router';
import DPA from './ecode-exact/pages/DPA';
import Legal from './ecode-exact/pages/Legal';
import Privacy from './ecode-exact/pages/Privacy';
import ReportAbuse from './ecode-exact/pages/ReportAbuse';
import Security from './ecode-exact/pages/Security';
import StudentDPA from './ecode-exact/pages/StudentDPA';
import Subprocessors from './ecode-exact/pages/Subprocessors';
import Terms from './ecode-exact/pages/Terms';
import { socialMetaTags } from '~/utils/social-meta';

type LegalPageKey =
  | 'legal'
  | 'terms'
  | 'privacy'
  | 'subprocessors'
  | 'dpa'
  | 'student-dpa'
  | 'security'
  | 'report-abuse';

type LegalPageDefinition = {
  label: string;
  route: string;
  title: string;
  description: string;
};

export const ecodeLegalPages = {
  legal: {
    label: 'Legal',
    route: '/legal',
    title: 'Legal',
    description:
      'Review E-Code legal policies, agreements, data processing terms, security resources, and abuse reporting.',
  },
  terms: {
    label: 'Terms',
    route: '/terms',
    title: 'Terms of Service',
    description: 'The E-Code Terms of Service page copied into the exact E-Code marketing shell.',
  },
  privacy: {
    label: 'Privacy',
    route: '/privacy',
    title: 'Privacy Policy',
    description: 'The E-Code Privacy Policy page copied into the exact E-Code marketing shell.',
  },
  subprocessors: {
    label: 'Subprocessors',
    route: '/subprocessors',
    title: 'Subprocessors',
    description: 'E-Code subprocessors, vendor categories, locations, purposes, and compliance coverage.',
  },
  dpa: {
    label: 'DPA',
    route: '/dpa',
    title: 'Data Processing Addendum',
    description: 'E-Code data processing terms for customers that require a DPA.',
  },
  'student-dpa': {
    label: 'US Student DPA',
    route: '/student-dpa',
    title: 'US Student Data Processing Addendum',
    description: 'E-Code student privacy and education data processing protections.',
  },
  security: {
    label: 'Security',
    route: '/security',
    title: 'Security',
    description: 'E-Code security controls, compliance posture, infrastructure safeguards, and incident response.',
  },
  'report-abuse': {
    label: 'Report Abuse',
    route: '/report-abuse',
    title: 'Report Abuse',
    description: 'Report abuse, malicious code, privacy violations, spam, harassment, or unsafe content on E-Code.',
  },
} as const satisfies Record<LegalPageKey, LegalPageDefinition>;

export function makeEcodeLegalMeta(key: LegalPageKey): MetaFunction {
  const page = ecodeLegalPages[key];

  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function EcodeLegalPage() {
  return <Legal />;
}

export function EcodeTermsPage() {
  return <Terms />;
}

export function EcodePrivacyPage() {
  return <Privacy />;
}

export function EcodeSubprocessorsPage() {
  return <Subprocessors />;
}

export function EcodeDpaPage() {
  return <DPA />;
}

export function EcodeStudentDpaPage() {
  return <StudentDPA />;
}

export function EcodeSecurityPage() {
  return <Security />;
}

export function EcodeReportAbusePage() {
  return <ReportAbuse />;
}
