import { Trash2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Deleting your data - E-Code' },
  {
    name: 'description',
    content:
      'How to export or delete your E-Code data yourself, the grace period, and what is removed versus retained.',
  },
];

/*
 * Public data-deletion policy. Describes E-Code's real self-serve flow: /account-data
 * (POST /account/deletion → 14-day grace + cancel; GET /account/data-export). Reworded
 * for E-Code. Exact statutory retention windows should be reviewed by counsel.
 */
const page = {
  slug: 'deleting-your-data',
  title: 'Deleting your data',
  eyebrow: 'Legal',
  description:
    'You own your data on E-Code. You can export it or delete your account yourself, on your own schedule. This page explains how it works, the grace period, and what happens to your data.',
  kind: 'legal',
  icon: Trash2,
  primaryAction: ['Manage your data', '/account-settings/data'],
  secondaryAction: ['Read the Privacy Policy', '/privacy'],
  highlights: ['Self-serve', '14-day grace', 'Export first', 'Permanent after grace'],
  sections: [
    {
      title: 'Export your data',
      body: 'Before deleting anything, you can download a copy of your account data — your profile, organizations, projects, and preferences — from the Data & privacy page. Secrets and access tokens are never included in the export.',
      items: ['Download from Data & privacy', 'Profile, orgs, projects, preferences', 'Secrets and tokens excluded'],
    },
    {
      title: 'Delete your account yourself',
      body: 'Account deletion is self-serve: go to Data & privacy, request deletion, and confirm. No support ticket is required. Your request schedules the account for permanent deletion.',
      items: ['Data & privacy → Request account deletion', 'Type-to-confirm', 'No ticket needed'],
    },
    {
      title: '14-day grace period',
      body: 'Deletion does not happen instantly. Your account enters a 14-day grace window during which you can cancel and keep everything. After the grace period, deletion proceeds and is permanent.',
      items: ['14 days to change your mind', 'Cancel any time during the window', 'Permanent after the grace period'],
    },
    {
      title: 'What is deleted, what is retained',
      body: 'Deletion removes your personal content — projects, files, and profile — from our active systems. A limited set of records may be retained where the law requires it (for example billing and tax records, or security/audit logs), and backups age out on their normal cycle.',
      items: [
        'Personal content and projects removed',
        'Legally-required records may be retained',
        'Backups expire on their normal cycle',
        'See the Privacy Policy for data-subject rights',
      ],
    },
  ],
} satisfies MarketingPageDefinition;

export default function DeletingYourDataPage() {
  return <MarketingStaticPage page={page} />;
}
