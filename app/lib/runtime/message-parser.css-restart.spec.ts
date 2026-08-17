import { describe, expect, it, vi } from 'vitest';

import { StreamingMessageParser } from './message-parser';

/*
 * BUG-AGENT-005 — reproduction de la forme EXACTE observée sur l'app déployée.
 *
 * Au plafond de jetons en plein `src/index.css`, le modèle repart dans le même
 * message. Le fichier livré (identique dans le workspace et dans le storage,
 * projet `cmswzyoyv000d0nheglytwpep`) contenait :
 *
 *   …border-radius:8px;height:14px}
 *   borderJe continue exactement là où le fichier CSS s'est arrêté, …
 *   <boltArtifact id="expense-tracker-finish" title="…">
 *   <boltAction type="file" filePath="src/index.css" contentType="content">
 *   :root{--primary: …
 *
 * L'effet est pire qu'une pollution : ce texte brut est parsé comme un
 * SÉLECTEUR, donc toutes les règles qui suivent héritent du préfixe
 * `.skeleton` (le dernier sélecteur ouvert). La media query livrée devient
 * `.skeleton .summary-grid{grid-template-columns:1fr}` et ne matche plus rien —
 * l'app publiée perd tout son responsive alors que l'aperçu DEV est correct.
 *
 * Deux différences avec le cas déjà couvert (BUG-AGENT-004, App.tsx) :
 *   - la troncature tombe au MILIEU d'un token (`border` -> `borderJe continue`),
 *   - un `<boltArtifact>` s'intercale AVANT le `<boltAction>` de reprise.
 *
 * Ce test vérifie que la détection de redémarrage tient malgré ces deux points.
 */

function contenuLivrePour(sortie: string, chemin: string): string | undefined {
  const onActionClose = vi.fn();

  const parser = new StreamingMessageParser({
    callbacks: { onActionOpen: vi.fn(), onActionClose, onActionStream: vi.fn() },
  });

  parser.parse('assistant-css-restart', sortie);

  const appels = onActionClose.mock.calls.filter(([data]) => data?.action?.filePath === chemin);

  return appels.length ? appels[appels.length - 1][0].action.content : undefined;
}

const SORTIE_TRONQUEE_PUIS_REPRISE = [
  '<boltArtifact id="expense-tracker" title="Tableau de bord de dépenses">',
  '<boltAction type="file" filePath="src/index.css" contentType="content">',
  '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}',
  '.skeleton{background:linear-gradient(90deg,#eee 25%,#ddd 50%,#eee 75%);',
  // Troncature au milieu d'un token, exactement comme en réel.
  '  border',
  "Je continue exactement là où le fichier CSS s'est arrêté, puis je finalise.",
  '',
  '<boltArtifact id="expense-tracker-finish" title="Finalisation">',
  '<boltAction type="file" filePath="src/index.css" contentType="content">',
  '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}',
  '.skeleton{background:#eee;border-radius:8px;height:14px}',
  '@media (max-width: 900px){.summary-grid{grid-template-columns:1fr}}',
  '</boltAction>',
  '</boltArtifact>',
].join('\n');

describe("BUG-AGENT-005 — le balisage de reprise ne doit jamais atterrir dans le CSS", () => {
  it('ne livre aucun balisage de plateforme dans le fichier', () => {
    const contenu = contenuLivrePour(SORTIE_TRONQUEE_PUIS_REPRISE, 'src/index.css') ?? '';

    expect(contenu).not.toContain('<boltAction');
    expect(contenu).not.toContain('<boltArtifact');
    expect(contenu).not.toContain('Je continue exactement');
  });

  it('livre la ré-émission, pas le partiel tronqué', () => {
    const contenu = contenuLivrePour(SORTIE_TRONQUEE_PUIS_REPRISE, 'src/index.css') ?? '';

    expect(contenu).toContain('@media (max-width: 900px)');
    expect(contenu).not.toMatch(/border$/m);
  });

  it("laisse la media query cibler `.summary-grid`, pas `.skeleton .summary-grid`", () => {
    /*
     * Le cœur du défaut : si le balisage survit dans le fichier, le sélecteur
     * ouvert juste avant (`.skeleton`) absorbe tout ce qui suit. On vérifie donc
     * que la règle responsive reste bien au niveau racine.
     */
    const contenu = contenuLivrePour(SORTIE_TRONQUEE_PUIS_REPRISE, 'src/index.css') ?? '';
    const media = contenu.slice(contenu.indexOf('@media'));

    expect(media).toContain('.summary-grid{grid-template-columns:1fr}');
    expect(media).not.toContain('.skeleton .summary-grid');
  });
});
