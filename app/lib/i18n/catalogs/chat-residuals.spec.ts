import { describe, expect, it } from 'vitest';
import {
  chatResidualsEn,
  chatResidualsFr,
  formatAgentRepairDiagnostic,
  formatChatResidualsCopy,
  formatChatResidualsDate,
  getChatResidualsCopy,
  getConnectionFailureReasonLabel,
  getReconnectionReasonLabel,
  localizePersistedProgressMessage,
} from './chat-residuals';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('chat residuals catalogue', () => {
  it('keeps strict EN/FR key and interpolation parity with English fallback', () => {
    expect(Object.keys(chatResidualsFr).sort()).toEqual(Object.keys(chatResidualsEn).sort());

    for (const key of Object.keys(chatResidualsEn) as Array<keyof typeof chatResidualsEn>) {
      expect(chatResidualsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(chatResidualsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(chatResidualsFr[key]), key).toEqual(interpolationTokens(chatResidualsEn[key]));
    }

    expect(getChatResidualsCopy('es-MX')['chatResiduals.generate.action']).toBe('Generate app');
  });

  it('formats copy, dates, and safe repair diagnostics without exposing raw English errors', () => {
    expect(
      formatChatResidualsCopy(chatResidualsFr['chatResiduals.connectionResolved.success'], {
        provider: 'GitHub',
        account: 'avi@example.test',
      }),
    ).toBe('GitHub est connecté avec le compte avi@example.test.');

    const diagnostic = formatAgentRepairDiagnostic('fr', 'validation', 'Unexpected token (12:4) secret=raw');

    expect(diagnostic).toBe('La validation du code a échoué. Ligne 12, colonne 4.');
    expect(diagnostic).not.toContain('Unexpected token');
    expect(diagnostic).not.toContain('secret=raw');
    expect(formatChatResidualsDate('not-an-iso-date', 'fr')).toBe('Date indisponible');
  });

  it('localizes connector reason codes and masks unknown provider diagnostics', () => {
    expect(getConnectionFailureReasonLabel('fr', 'scope_mismatch')).toBe(
      'Les autorisations accordées ne couvrent pas les besoins de l’agent.',
    );
    expect(getConnectionFailureReasonLabel('fr', 'RAW_UPSTREAM_FAILURE')).toBe('La connexion n’a pas pu être établie.');
    expect(getReconnectionReasonLabel('fr', 'token_expired')).toBe('Le jeton d’accès a expiré.');
    expect(getReconnectionReasonLabel('fr', undefined)).toBe('Reconnectez ce service pour continuer.');
  });

  it('remaps persisted API progress copy on a live locale switch but preserves arbitrary content', () => {
    expect(localizePersistedProgressMessage('Generating Response', 'fr')).toBe('Génération de la réponse');
    expect(localizePersistedProgressMessage('Génération de la réponse', 'en')).toBe('Generating Response');
    expect(localizePersistedProgressMessage('pnpm build --filter @vibecore/web', 'fr')).toBe(
      'pnpm build --filter @vibecore/web',
    );
  });
});
