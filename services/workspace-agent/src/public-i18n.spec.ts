import { describe, expect, it } from 'vitest';

import {
  localizedWorkspaceAgentError,
  workspaceAgentError,
  workspaceAgentLocaleFromHeader,
  workspaceAgentMessage,
} from './public-i18n.js';

describe('workspace-agent public i18n', () => {
  it('negotiates weighted Accept-Language with English fallback', () => {
    expect(workspaceAgentLocaleFromHeader('en;q=0.2, fr-FR;q=0.9')).toBe('fr');
    expect(workspaceAgentLocaleFromHeader('de-DE')).toBe('en');
  });

  it('localizes typed errors while preserving technical values', () => {
    const error = workspaceAgentError('commandTimedOut', {
      code: 'COMMAND_TIMEOUT',
      values: { milliseconds: 45_000 },
    });

    expect(localizedWorkspaceAgentError(error, 'fr', 'commandStreamFailed')).toBe(
      'La commande a dépassé la durée autorisée de 45000 ms.',
    );
    expect(workspaceAgentMessage('previewUnavailable', 'fr', { port: 5173 })).toContain('5173');
    expect(workspaceAgentMessage('invalidPort', 'fr')).toBe('Le port d’aperçu est invalide.');
  });
});
