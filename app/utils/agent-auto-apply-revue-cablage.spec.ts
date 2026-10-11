/**
 * LE BRANCHEMENT DE `propositionsAMontrer`.
 *
 * La règle est tenue par agent-auto-apply.spec.ts ; elle ne protège de rien si
 * le chat ne l'appelle pas. Les deux endroits qui décidaient d'afficher la file
 * de revue la vidaient avec l'application automatique : `return []` dans la
 * file, `!projectAutoApply` dans la condition de rendu.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/chat/BaseChat.tsx', import.meta.url), 'utf8');

describe('la file de revue du chat passe par propositionsAMontrer', () => {
  it('la file elle-même', () => {
    expect(source).toContain('() => propositionsAMontrer(proposals, Boolean(autoApplyEnabled)),');
  });

  it('la condition de rendu', () => {
    expect(source).toContain(
      'projectIdeMode && propositionsAMontrer(pendingAgentPatchProposals, projectAutoApply).length > 0;',
    );
    expect(source).not.toContain('projectIdeMode && !projectAutoApply && pendingAgentPatchProposals.length > 0');
  });
});
