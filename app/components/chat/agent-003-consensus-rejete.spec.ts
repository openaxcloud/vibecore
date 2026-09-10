import { describe, expect, it } from 'vitest';

import { deriveProgressState } from './ProgressCompilation';
import { isAgentRunDegraded } from './bundled-artifact-state';

/*
 * BUG-AGENT-003 — « les 5 sous-agents parallèles échouent tous, le consensus
 * est rejeté à 0 %, et le run est quand même affiché "Terminé 100 %" ».
 *
 * On reconstitue la forme d'annotation EXACTE décrite par le point, et on
 * mesure l'état affiché. Un test qui relirait le prédicat ne prouverait rien.
 */
const CINQ_VOIES_ECHOUEES = [
  {
    type: 'agentExecution',
    status: 'complete',
    results: Array.from({ length: 5 }, (_unused, index) => ({
      status: 'failed',
      lane: `voie-${index + 1}`,
    })),
    consensus: { outcome: 'REJECTED', agreementScore: 0, threshold: 0.6 },
  },
];

/* Toutes les étapes de compilation ont bien tourné : c'est le piège du point. */
const ETAPES_TOUTES_FINIES = { completedCount: 5, totalCount: 5, hasActiveWork: false };

describe('BUG-AGENT-003 — un run dont toutes les voies échouent ne dit pas « Terminé »', () => {
  it('le run est reconnu comme dégradé', () => {
    expect(isAgentRunDegraded(CINQ_VOIES_ECHOUEES)).toBe(true);
  });

  it("l'état affiché est « terminé avec des erreurs », pas « terminé »", () => {
    const etat = deriveProgressState({
      ...ETAPES_TOUTES_FINIES,
      degraded: isAgentRunDegraded(CINQ_VOIES_ECHOUEES),
    });

    expect(etat).toBe('done-with-issues');
    expect(etat).not.toBe('done');
  });

  it('chacun des trois signaux suffit seul — aucun ne porte le résultat à lui seul', () => {
    const voiesSeules = [{ type: 'agentExecution', results: [{ status: 'failed' }] }];
    const consensusSeul = [{ type: 'agentExecution', consensus: { outcome: 'REJECTED' } }];

    const scoreSeul = [{ type: 'agentExecution', consensus: { agreementScore: 0, threshold: 0.6 } }];

    expect(isAgentRunDegraded(voiesSeules), 'voies échouées').toBe(true);
    expect(isAgentRunDegraded(consensusSeul), 'consensus rejeté').toBe(true);
    expect(isAgentRunDegraded(scoreSeul), 'accord sous le seuil').toBe(true);
  });

  it('contre-épreuve : un run réellement sain reste « terminé »', () => {
    const sain = [
      {
        type: 'agentExecution',
        status: 'complete',
        results: Array.from({ length: 5 }, () => ({ status: 'complete' })),
        consensus: { outcome: 'ACCEPTED', agreementScore: 0.9, threshold: 0.6 },
      },
    ];

    expect(isAgentRunDegraded(sain)).toBe(false);
    expect(deriveProgressState({ ...ETAPES_TOUTES_FINIES, degraded: false })).toBe('done');
  });
});
