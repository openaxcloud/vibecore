import { describe, expect, it } from 'vitest';

import { boltFileActionsFromContent } from './bolt-file-actions.js';

/*
 * BUG-AGENT-005 — reproduction de la forme EXACTE observée sur l'app déployée
 * (env de test, projet `cmswzyoyv000d0nheglytwpep`, déploiement
 * `cmsx5vkjb02s60nbrh2ss4nux`).
 *
 * Le modèle atteint le plafond de jetons en plein `src/index.css` et repart
 * dans le même message. Il n'y a qu'UN `</boltAction>`, tout à la fin : la
 * capture paresseuse avalait donc le partiel tronqué, la prose, et le balisage
 * de la reprise.
 *
 * Ce que ça donnait dans la feuille livrée : le balisage brut était parsé comme
 * un SÉLECTEUR, si bien que toute la suite héritait du préfixe `.skeleton`. La
 * media query devenait `.skeleton .summary-grid{…}` et ne matchait plus rien —
 * l'app publiée perdait sa mise en page mobile (mesuré : `scrollWidth` 706 pour
 * un viewport de 390), alors que l'aperçu de développement était correct.
 */

const identite = (v: string) => v;

const REPRISE_CSS = [
  '<boltArtifact id="expense-tracker" title="Dépenses">',
  '<boltAction type="file" filePath="src/index.css" contentType="content">',
  '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr)}',
  '.skeleton{background:#eee;',
  '  border',
  "Je continue exactement là où le fichier CSS s'est arrêté, puis je finalise.",
  '',
  '<boltArtifact id="expense-tracker-finish" title="Finalisation">',
  '<boltAction type="file" filePath="src/index.css" contentType="content">',
  '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr)}',
  '.skeleton{background:#eee;border-radius:8px;height:14px}',
  '@media (max-width: 900px){.summary-grid{grid-template-columns:1fr}}',
  '</boltAction>',
  '</boltArtifact>',
].join('\n');

describe('BUG-AGENT-005 — un redémarrage de génération ne doit rien laisser dans le fichier', () => {
  it('ne persiste aucun balisage de plateforme ni prose du modèle', () => {
    const [fichier] = boltFileActionsFromContent(REPRISE_CSS, identite);

    expect(fichier).toBeDefined();
    expect(fichier.content).not.toContain('<boltAction');
    expect(fichier.content).not.toContain('<boltArtifact');
    expect(fichier.content).not.toContain('Je continue exactement');
  });

  it('persiste la ré-émission, pas le partiel tronqué', () => {
    const [fichier] = boltFileActionsFromContent(REPRISE_CSS, identite);

    expect(fichier.content).toContain('@media (max-width: 900px)');
    expect(fichier.content).not.toMatch(/^\s*border$/m);
  });

  it('laisse la media query cibler `.summary-grid` au niveau racine', () => {
    const [fichier] = boltFileActionsFromContent(REPRISE_CSS, identite);
    const media = fichier.content.slice(fichier.content.indexOf('@media'));

    expect(media).toContain('.summary-grid{grid-template-columns:1fr}');
    expect(media).not.toContain('.skeleton .summary-grid');
  });

  it('laisse intact un fichier émis normalement', () => {
    const normal = [
      '<boltArtifact id="ok" title="OK">',
      '<boltAction type="file" filePath="src/app.css" contentType="content">',
      '.a{color:red}',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const [fichier] = boltFileActionsFromContent(normal, identite);

    expect(fichier.path).toBe('src/app.css');
    expect(fichier.content).toBe('.a{color:red}');
  });

  it('retient le chemin du DERNIER ouvrant quand la reprise vise un autre fichier', () => {
    const autreCible = [
      '<boltAction type="file" filePath="src/ancien.css" contentType="content">',
      '.a{color:red}',
      'Je reprends sur un autre fichier.',
      '<boltAction type="file" filePath="src/nouveau.css" contentType="content">',
      '.b{color:blue}',
      '</boltAction>',
    ].join('\n');

    const [fichier] = boltFileActionsFromContent(autreCible, identite);

    expect(fichier.path).toBe('src/nouveau.css');
    expect(fichier.content).toBe('.b{color:blue}');
  });
});
