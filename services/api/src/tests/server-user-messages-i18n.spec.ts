import { describe, expect, it } from 'vitest';

import { appPublicCopy, localizeAppPublicMessage } from '../app-public-copy.js';
import { validateRestoreTarget } from '../database-rollback-service.js';
import { deployProviderConfigError } from '../deployments.js';
import { localizeScheduledRunText, validateSchedule } from '../scheduled-tasks.js';

describe('server-owned user messages', () => {
  it('renders business validation in French while keeping technical identifiers intact', () => {
    expect(deployProviderConfigError('vercel', {}, 'fr')?.message).toBe(
      'Le déploiement vers Vercel nécessite la configuration suivante : VERCEL_DEPLOY_HOOK_URL. Contactez votre administrateur.',
    );

    expect(validateSchedule({ cron: '* * * * *', timezone: 'UTC', planKey: 'free', locale: 'fr' }).error).toContain(
      'votre offre',
    );

    expect(
      validateRestoreTarget({
        enabled: true,
        entitlement: { allowed: true, retentionDays: 28 },
        targetTimestampMs: 0,
        nowMs: 29 * 24 * 60 * 60 * 1000,
        locale: 'fr',
      }),
    ).toMatchObject({ ok: false, code: 'TARGET_TOO_OLD', message: expect.stringContaining('28 jours') });
  });

  it('localizes persisted scheduler framing without translating commands or user output', () => {
    const english = [
      '$ # scheduled task "Nightly API" (deployment) — 1 step(s)',
      '',
      '$ npm run commit',
      'User output stays English',
      '$ # execution error: The scheduled workflow has no steps to run.',
      '… [truncated: 42 more bytes]',
    ].join('\n');
    const french = localizeScheduledRunText(english, 'fr');

    expect(french).toContain('tâche planifiée « Nightly API » (déploiement) — 1 étape(s)');
    expect(french).toContain('$ npm run commit');
    expect(french).toContain('User output stays English');
    expect(french).toContain('erreur d’exécution : Le workflow planifié ne contient aucune étape à exécuter.');
    expect(french).toContain('42 octets supplémentaires');
  });

  it('translates canonical deployment failures and never exposes a catalogue key', () => {
    const english = appPublicCopy('SERVER_SNAPSHOT_AGENT_UNREACHABLE', 'en');
    const localized = localizeAppPublicMessage(english, 'fr');

    expect(localized).toEqual({
      matched: true,
      value: 'Impossible de joindre l’espace de travail pour capturer l’application.',
    });
    expect(localized.value).not.toContain('SERVER_SNAPSHOT');
  });
});
