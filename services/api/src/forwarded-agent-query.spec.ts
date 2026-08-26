import { describe, expect, it } from 'vitest';

import { forwardedAgentQuery } from './forwarded-agent-query.js';

/**
 * Régression BUG-TERM-001 (cause « dérive de sessions »).
 *
 * Le proxy WebSocket de l'API reconstruisait l'URL amont à partir d'un chemin
 * constant, en jetant la query du client. `sessionId` n'atteignait donc jamais
 * l'agent, qui générait un id neuf à chaque connexion : aucun reattach, un shell
 * de plus par reconnexion, et le plafond `maxSessions` (8) atteint en quelques
 * minutes — constaté en réel : 21 `bash -i` orphelins et une tempête de 429.
 */
describe('forwardedAgentQuery', () => {
  it('propage sessionId, cols et rows', () => {
    const q = forwardedAgentQuery({ sessionId: 'terminal-42', cols: '120', rows: '30' });

    const params = new URLSearchParams(q.replace(/^&/, ''));

    expect(params.get('sessionId')).toBe('terminal-42');
    expect(params.get('cols')).toBe('120');
    expect(params.get('rows')).toBe('30');
  });

  it('préfixe par & par défaut et par ? quand aucun query param ne précède', () => {
    expect(forwardedAgentQuery({ sessionId: 'abc' }).startsWith('&')).toBe(true);
    expect(forwardedAgentQuery({ sessionId: 'abc' }, '?')).toBe('?sessionId=abc');
  });

  /** Le token est re-minté par saut : relayer celui du client serait une fuite. */
  it('ne propage JAMAIS le token du client', () => {
    const q = forwardedAgentQuery({ sessionId: 'abc', token: 'session_SECRET' });

    expect(q).not.toContain('SECRET');
    expect(q).not.toContain('token=');
  });

  /** `managed` n'est lu que par l'API (quota) ; l'agent ne le connaît pas. */
  it('ne propage pas les clés hors liste blanche', () => {
    const q = forwardedAgentQuery({ sessionId: 'abc', managed: '1', evil: '../../etc' });

    expect(q).not.toContain('managed');
    expect(q).not.toContain('evil');
    expect(q).not.toContain('etc');
  });

  it('échappe les valeurs au lieu de les injecter brutes', () => {
    const q = forwardedAgentQuery({ sessionId: 'a&b=c d' });

    expect(q).not.toContain('a&b=c d');
    expect(new URLSearchParams(q.replace(/^&/, '')).get('sessionId')).toBe('a&b=c d');
  });

  it('rend une chaîne vide quand il n’y a rien à propager', () => {
    expect(forwardedAgentQuery(undefined)).toBe('');
    expect(forwardedAgentQuery(null)).toBe('');
    expect(forwardedAgentQuery({})).toBe('');
    expect(forwardedAgentQuery('pas un objet')).toBe('');
    expect(forwardedAgentQuery({ sessionId: '' })).toBe('');
  });

  it('prend la première valeur quand un param est répété', () => {
    const q = forwardedAgentQuery({ sessionId: ['premier', 'second'] });

    expect(new URLSearchParams(q.replace(/^&/, '')).get('sessionId')).toBe('premier');
  });
});
