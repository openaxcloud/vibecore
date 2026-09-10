import { describe, expect, it } from 'vitest';

import { StreamingMessageParser } from './message-parser';

/*
 * BUG-AGENT-004 / BUG-AGENT-005 — au plafond de jetons, le modèle poursuit
 * DANS le même message : de la prose, puis un artefact tout neuf qui ré-émet
 * le fichier. Tant que `insideAction` restait vrai, cette prose ET le balisage
 * littéral étaient écrits COMME CONTENU DE FICHIER.
 *
 * En CSS le dégât est visible : `<boltArtifact …>` devient un sélecteur et la
 * feuille de style entière cesse de s'appliquer — c'est BUG-AGENT-005, l'appli
 * déployée perd tout son responsive.
 *
 * On MESURE ce qui sort du parser, on ne relit pas la garde.
 */
function contenuLivre(chunks: string[]): Record<string, string> {
  const fichiers: Record<string, string> = {};
  const parser = new StreamingMessageParser({
    callbacks: {
      onActionClose: ({ action }) => {
        if (action.type === 'file') {
          fichiers[action.filePath] = action.content;
        }
      },
    },
  });

  let cumul = '';

  for (const c of chunks) {
    cumul += c;
    parser.parse('msg-1', cumul);
  }

  return fichiers;
}

const OUVERTURE =
  '<boltArtifact id="a1" title="app" type="bundled">' +
  '<boltAction type="file" filePath="src/index.css">';

describe('BUG-AGENT-005 — le balisage plateforme ne doit jamais finir dans le CSS', () => {
  it('redémarrage avec <boltAction seul : la prose et la reprise sont écartées', () => {
    const f = contenuLivre([
      OUVERTURE + ':root { --a: 1px; }\n.card { color: red;',
      '\n\nJe continue la génération du fichier.\n\n' +
        '<boltAction type="file" filePath="src/index.css">' +
        ':root { --a: 1px; }\n.card { color: red; }\n</boltAction></boltArtifact>',
    ]);

    const css = f['src/index.css'];
    expect(css, 'aucun fichier livré').toBeDefined();
    expect(css).not.toMatch(/boltAction|boltArtifact/);
    expect(css).not.toMatch(/Je continue la génération/);
    expect(css).toContain('.card { color: red; }');
  });

  it('redémarrage avec <boltArtifact AVANT <boltAction : le balisage ne fuit pas non plus', () => {
    const f = contenuLivre([
      OUVERTURE + ':root { --a: 1px; }\n.card { color: red;',
      '\n\nJe continue.\n\n' +
        '<boltArtifact id="a2" title="app" type="bundled">' +
        '<boltAction type="file" filePath="src/index.css">' +
        ':root { --a: 1px; }\n.card { color: blue; }\n</boltAction></boltArtifact>',
    ]);

    const css = f['src/index.css'];
    expect(css, 'aucun fichier livré').toBeDefined();

    /*
     * Le point dur : `<boltArtifact …>` en tête de ligne devient un SÉLECTEUR
     * CSS valide pour l'analyseur du navigateur, et tout ce qui suit dans le
     * bloc est avalé. C'est ce qui a fait perdre le responsive.
     */
    expect(css, 'balisage plateforme écrit dans le CSS').not.toMatch(/boltArtifact/);
    expect(css).not.toMatch(/boltAction/);
    expect(css).not.toMatch(/Je continue/);
  });

  it('troncature SÈCHE (aucune reprise) : pas de balise fermante partielle dans le fichier', () => {
    const f = contenuLivre([OUVERTURE + '.card { color: red; }\n</bo']);

    // Rien ne se ferme, donc rien n'est livré par onActionClose — c'est correct :
    // un fichier incomplet ne doit pas être présenté comme complet.
    expect(f['src/index.css']).toBeUndefined();
  });
});
