import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-DEVSTART-STARVED-BY-REVIEW-001 — l'interface affichait
 * « Start application — Done » alors que `npm run dev` n'avait JAMAIS tourné,
 * et l'aperçu restait sur `preview.proxy.unreachable` (incident live du 24/08).
 *
 * Cause : quand des propositions de correctif étaient ouvertes pour l'artefact,
 * l'action `start` était sautée — et `skipAction` marque l'action « complete ».
 * Le démarrage était donc annoncé réussi sans avoir eu lieu.
 *
 * Le correctif est en DEUX moitiés indissociables : mémoriser le `start` sauté,
 * puis le relancer quand la file de revue se vide. Retirer l'une des deux
 * ramène le bug en silence, et `#deferredStartArtifacts` n'était gardé par
 * AUCUN test — il n'apparaissait que dans son implémentation.
 *
 * Garde au niveau source : le champ est privé dans un store volumineux, et ce
 * qu'il faut protéger est le COUPLAGE des deux moitiés, pas une valeur.
 */
const source = readFileSync(join(__dirname, 'workbench.ts'), 'utf8');

describe('BUG-DEVSTART — un start sauté est relancé, jamais annoncé comme fait', () => {
  it('MOITIÉ 1 — un `start` sauté pour cause de revue est MÉMORISÉ', () => {
    expect(source).toMatch(
      /if \(data\.action\.type === 'start'\) \{[\s\S]{0,200}?#deferredStartArtifacts\.add\(artifactId\)/,
    );
  });

  it('MOITIÉ 2 — il est RELANCÉ quand la file de revue se vide', () => {
    const drain = source.match(/#maybeRunDeferredStart\(artifactId: string\) \{[\s\S]{0,900}?\n  \}/);
    expect(drain, '#maybeRunDeferredStart introuvable — la relance a disparu').not.toBeNull();

    const bloc = drain![0];
    expect(bloc).toMatch(/#deferredStartArtifacts\.delete\(artifactId\)/);
    expect(bloc, 'le serveur de dev n’est plus relancé').toMatch(/startPreviewServer\(\)/);
  });

  it('la relance est bien APPELÉE, pas seulement définie', () => {
    const appels = source.match(/this\.#maybeRunDeferredStart\(/g) ?? [];
    expect(appels.length, '#maybeRunDeferredStart est défini mais jamais appelé').toBeGreaterThan(0);
  });

  it("une proposition ÉCHOUÉE ne doit pas affamer le démarrage pour toujours", () => {
    /*
     * Régression connue : réutiliser #hasOpenAgentPatchProposalsForArtifact ici
     * traiterait un correctif 'failed' comme encore ouvert, et le serveur de dev
     * ne démarrerait jamais. Seuls 'pending' et 'applying' doivent bloquer.
     */
    const drain = source.match(/#maybeRunDeferredStart\(artifactId: string\) \{[\s\S]{0,900}?\n  \}/)![0];

    expect(drain).toMatch(/'pending'/);
    expect(drain).toMatch(/'applying'/);
    expect(drain, 'le prédicat trop large réintroduit la famine').not.toMatch(
      /#hasOpenAgentPatchProposalsForArtifact/,
    );
  });
});
