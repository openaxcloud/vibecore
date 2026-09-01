import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-CREATE-002 — le rejet de quota est produit, mais n'était atteignable
 * par AUCUN clic : le seul signal (« ! ») était posé sur la pastille
 * « espace de travail », dont le clic ouvrait la vue `terminal` (le Shell),
 * alors que le message est rendu dans la vue `problems`.
 *
 * Le test s'ancre sur le CODE (jamais sur la prose de l'inventaire) et vérifie
 * les DEUX moitiés : la source du message ET sa destination. Retirer l'une ou
 * l'autre doit faire rougir ce fichier.
 */

const racine = join(__dirname, '..', '..', '..');
const baseChat = readFileSync(join(racine, 'app/components/chat/BaseChat.tsx'), 'utf8');
const diagnostics = readFileSync(join(racine, 'app/lib/stores/diagnostics.ts'), 'utf8');

describe('BUG-CREATE-002 — le rejet de quota mène quelque part', () => {
  it('MOITIÉ 1 (destination) — le message de quota est bien poussé dans les diagnostics', () => {
    /*
     * Sans ça, router le clic vers « Problèmes » ouvrirait un panneau VIDE.
     * C'est la vérification d'existence de ce que le correctif prétend atteindre.
     */
    expect(diagnostics).toMatch(/addDiagnostic\(\s*'error',\s*quotaWarning/);
  });

  it('MOITIÉ 1 bis (destination) — la vue « problems » rend bien les diagnostics', () => {
    expect(baseChat).toMatch(/active === 'problems'|'problems'/);
    expect(baseChat).toContain('ProjectBottomTerminalView');
  });

  it('MOITIÉ 2 (chemin) — la pastille qui porte le « ! » du quota ouvre « problems », pas le Shell', () => {
    const pastille = baseChat.match(
      /className="bolt-project-statusbar-pill bolt-project-statusbar-workspace"[\s\S]{0,4000}?<\/button>/,
    );
    expect(pastille, 'pastille « espace de travail » introuvable — le sélecteur a bougé').not.toBeNull();

    const bloc = pastille![0];

    // La pastille porte bien le signal de quota…
    expect(bloc).toMatch(/quotaWarning \|\| billingUpgradePrompt/);

    // …et son clic route vers la vue qui contient le message.
    expect(bloc).toMatch(/openBottomTerminal\([^)]*quotaWarning[^)]*'problems'/);

    // Contre-épreuve : le clic ne doit PLUS mener inconditionnellement au Shell.
    expect(bloc).not.toMatch(/onClick=\{\(\) => openBottomTerminal\('terminal'\)\}/);
  });

  it('MOITIÉ 2 bis (lisibilité) — le message lui-même est exposé sans avoir à ouvrir un panneau', () => {
    const pastille = baseChat.match(
      /className="bolt-project-statusbar-pill bolt-project-statusbar-workspace"[\s\S]{0,4000}?<\/button>/,
    )![0];

    expect(pastille).toMatch(/title=\{quotaWarning \|\|/);
    expect(pastille).toMatch(/aria-label=\{quotaWarning \|\|/);
  });
});
