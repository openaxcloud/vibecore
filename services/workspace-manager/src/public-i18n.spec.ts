import { describe, expect, it } from 'vitest';

import {
  localizeWorkspaceManagerMessage,
  workspaceManagerLocaleFromHeader,
  workspaceManagerMessage,
} from './public-i18n.js';

describe('workspace-manager public i18n', () => {
  it('uses weighted Accept-Language negotiation with English fallback', () => {
    expect(workspaceManagerLocaleFromHeader('en;q=0.2, fr-FR;q=0.9')).toBe('fr');
    expect(workspaceManagerLocaleFromHeader('de-DE')).toBe('en');
  });

  it('translates exact platform copy and leaves runtime or user output untouched', () => {
    expect(localizeWorkspaceManagerMessage(workspaceManagerMessage('workspaceNotFound'), 'fr')).toBe(
      'Espace de travail introuvable.',
    );
    expect(localizeWorkspaceManagerMessage(workspaceManagerMessage('previewAccessDenied'), 'fr')).toBe(
      'Accès à l’aperçu refusé.',
    );
    expect(localizeWorkspaceManagerMessage('npm ERR! user-generated-build-output', 'fr')).toBe(
      'npm ERR! user-generated-build-output',
    );
  });
});
