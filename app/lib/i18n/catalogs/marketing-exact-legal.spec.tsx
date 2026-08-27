import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { marketingExactDpaEn, marketingExactDpaFr } from './marketing-exact-dpa';
import { marketingExactReportAbuseEn, marketingExactReportAbuseFr } from './marketing-exact-report-abuse';
import { marketingExactStudentDpaEn, marketingExactStudentDpaFr } from './marketing-exact-student-dpa';
import { marketingExactSubprocessorsEn, marketingExactSubprocessorsFr } from './marketing-exact-subprocessors';

import Dpa from '~/components/marketing/ecode-exact/pages/DPA';
import ReportAbuse from '~/components/marketing/ecode-exact/pages/ReportAbuse';
import StudentDpa from '~/components/marketing/ecode-exact/pages/StudentDPA';
import Subprocessors from '~/components/marketing/ecode-exact/pages/Subprocessors';
import { createI18nInstance } from '~/lib/i18n/runtime';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact legal marketing catalogs', () => {
  it.each([
    ['report abuse', marketingExactReportAbuseEn, marketingExactReportAbuseFr],
    ['subprocessors', marketingExactSubprocessorsEn, marketingExactSubprocessorsFr],
    ['DPA', marketingExactDpaEn, marketingExactDpaFr],
    ['student DPA', marketingExactStudentDpaEn, marketingExactStudentDpaFr],
  ])('keeps complete EN/FR structural parity for %s', (_name, english, french) => {
    expect(leafPaths(french)).toEqual(leafPaths(english));
  });

  it.each([
    [<ReportAbuse key="report-abuse" />, 'Signaler un abus', 'Envoyer un signalement', 'Report Abuse'],
    [
      <Subprocessors key="subprocessors" />,
      'Sous-traitants ultérieurs',
      'Notre engagement en matière de protection des données',
      'Current Subprocessors',
    ],
    [<Dpa key="dpa" />, 'Accord de traitement des données', '1. Définitions', '1. Definitions'],
    [
      <StudentDpa key="student-dpa" />,
      'Accord de traitement des données des élèves',
      'Protection renforcée de la vie privée des élèves',
      'Enhanced Student Privacy Protections',
    ],
  ])(
    'renders each legal page in French without its English headline',
    (page, headline, supportingCopy, englishCopy) => {
      const markup = renderInFrench(page);

      expect(markup).toContain(headline);
      expect(markup).toContain(supportingCopy);
      expect(markup).not.toContain(englishCopy);

      if (page.type !== ReportAbuse) {
        expect(markup).toContain('septembre 2025');
        expect(markup).not.toContain('September 2025');
      }
    },
  );
});
