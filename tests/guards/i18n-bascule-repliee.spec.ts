import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-CI-010 — la porte « French i18n live audit » n'a JAMAIS été verte
 * (0 succès sur 50 runs). Cause mesurée le 2026-09-01, pas supposée :
 *
 *   - 3 shards sur 4 passent (desktop-1440, desktop-1024, tablet-768).
 *   - `mobile-390` échoue puis dépasse les 90 min et fait annuler le run.
 *   - Mesure live sur `/invitations/accept` : la bascule de langue est
 *     PRÉSENTE dans le DOM aux 3 largeurs, VISIBLE à 1440 et 768, repliée
 *     dans le menu à 390.
 *   - La porte exigeait une bascule VISIBLE partout, ce qu'Avi a clos comme
 *     NON-défaut, et payait 15 s d'attente morte par route et par langue.
 *
 * Ce garde-fou est au niveau source : il vérifie que l'invariant reste un
 * VRAI invariant (présence exigée), et non un `skip` déguisé.
 */

const spec = readFileSync(join(__dirname, '..', 'e2e', 'i18n-french-live.spec.ts'), 'utf8');

describe('BUG-CI-010 — invariant de bascule adapté à la largeur', () => {
  it('sous 768 px, la porte exige toujours la PRÉSENCE de la bascule', () => {
    expect(spec).toMatch(/languageSwitchDomCount/);
    expect(spec).toMatch(/\.soft\(\s*languageSwitchDomCount[\s\S]{0,160}?\.toBeGreaterThan\(0\)/);
  });

  it("ce n'est pas un skip déguisé — aucune branche ne saute l'audit", () => {
    const bloc = spec.match(/function basculeRepliee\([\s\S]{0,400}?\n\}/)![0];
    expect(bloc).not.toMatch(/test\.skip|testInfo\.skip/);

    // Au-dessus du seuil, la visibilité reste exigée.
    expect(spec).toMatch(/`\$\{path\} \(\$\{theme\}\) visible global language switch`/);

    // La coque IDE garde son invariant inverse.
    expect(spec).toMatch(/la coque IDE ne remonte PAS de bascule de langue globale/);
  });

  it("l'attente morte de 15 s est supprimée là où la visibilité ne vient jamais", () => {
    const attente = spec.match(/if \(basculeRepliee\(page, path\)\) \{[\s\S]{0,700}?\n  \}/)![0];
    expect(attente).toMatch(/not\.toHaveCount\(0/);
    expect(attente).not.toMatch(/toBeVisible/);
  });

  it('le seuil est celui mesuré (768), pas une valeur inventée', () => {
    expect(spec).toMatch(/const LARGEUR_REPLI_BASCULE = 768;/);
  });
});
