import { describe, expect, it } from 'vitest';

import {
  publicDeclaredDeployTarget,
  publicDetectedDeployTarget,
  publicPendingDeployTarget,
} from '../deploy-target-public.js';

describe('public deployment target detection', () => {
  it('localizes pending and declared configurations without exposing a command', () => {
    expect(publicPendingDeployTarget('fr')).toMatchObject({
      reasonCode: 'WORKSPACE_PENDING',
      reason: expect.stringContaining('espace de travail'),
      pending: true,
    });
    expect(publicDeclaredDeployTarget('fr')).toMatchObject({
      reasonCode: 'DECLARED_RUN',
      reason: expect.stringContaining('déclarées'),
      pending: false,
    });
  });

  it('localizes detected server and static targets', () => {
    expect(
      publicDetectedDeployTarget(
        { mode: 'server', framework: 'nextjs', reason: 'internal detail that must not escape' },
        'fr',
      ),
    ).toMatchObject({ reasonCode: 'SERVER_DETECTED', reason: 'Serveur nextjs détecté.' });

    expect(
      publicDetectedDeployTarget(
        { mode: 'static', framework: 'static', reason: 'internal detail that must not escape' },
        'fr',
      ),
    ).toMatchObject({ reasonCode: 'STATIC_DETECTED', reason: 'Site statique détecté (sans serveur).' });
  });

  it('masks an undecidable detector error in both languages', () => {
    const internal = 'database host secret and runtime trace';
    const french = publicDetectedDeployTarget(
      { mode: 'unknown', framework: 'unknown', reason: internal, error: internal },
      'fr',
    );

    expect(french).toMatchObject({ reasonCode: 'UNDETERMINED', errorCode: 'DEPLOY_TARGET_UNDETERMINED' });
    expect(JSON.stringify(french)).not.toContain(internal);
    expect(french.reason).toContain('n’a pas pu déterminer');

    const english = publicDetectedDeployTarget(
      { mode: 'unknown', framework: 'unknown', reason: internal, error: internal },
      'en',
    );
    expect(JSON.stringify(english)).not.toContain(internal);
    expect(english.reason).toContain('could not determine');
  });
});
