import { describe, expect, it } from 'vitest';

import {
  clientStoresServicesEn,
  clientStoresServicesFr,
  clientStoresServicesText,
  formatClientStoresServicesCopy,
  getClientStoresServicesCopy,
} from './client-stores-services';

describe('client stores and services i18n catalog', () => {
  it('keeps strict EN/FR parity and falls back to English', () => {
    expect(Object.keys(clientStoresServicesFr).sort()).toEqual(Object.keys(clientStoresServicesEn).sort());
    expect(getClientStoresServicesCopy('de')).toBe(clientStoresServicesEn);
  });

  it('localizes visible failures while preserving technical identifiers and paths', () => {
    expect(clientStoresServicesText('clientStores.files.remoteChanged', { path: 'src/App.tsx' }, 'fr-FR')).toBe(
      'Le fichier a changé dans l’espace de travail après son chargement : src/App.tsx. Rechargez-le avant d’enregistrer vos modifications.',
    );
    expect(clientStoresServicesText('clientRuntime.workspace.exportFailed', { status: 503 }, 'fr')).toBe(
      'Impossible d’exporter l’archive du projet (HTTP 503).',
    );
    expect(clientStoresServicesFr['clientRuntime.workspace.projectApiUnavailable']).toContain('pnpm run dev');
    expect(clientStoresServicesFr['clientRuntime.messageParser.migrationPathRequired']).toContain('filePath');
  });

  it('never renders an untranslated key when interpolation data is complete', () => {
    const rendered = formatClientStoresServicesCopy(
      clientStoresServicesFr['clientRuntime.webcontainer.previewErrorDetails'],
      {
        location: '/preview?mode=test',
        port: 5173,
        stack: 'TypeError: test',
      },
    );

    expect(rendered).toContain('Erreur de l’aperçu');
    expect(rendered).toContain('/preview?mode=test');
    expect(rendered).toContain('5173');
    expect(rendered).not.toContain('{location}');
  });
});
