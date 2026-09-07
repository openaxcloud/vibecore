import { describe, expect, it } from 'vitest';
import { retirerLesBlocsDAction } from './agent-executor.js';

describe('retirerLesBlocsDAction', () => {
  /*
   * LE CAS QUI COMMANDE TOUT. Un role qui vient d'ecrire un fichier TypeScript
   * a mis des accolades DANS son flux. Le repli de `parseJsonObject` cherche la
   * premiere `{` et la derniere `}` : sans decoupe prealable il attrape le CODE.
   */
  it('rend le rapport lisible apres un fichier TypeScript ecrit', () => {
    const flux = [
      'Je pose le panier.',
      '<boltArtifact id="lane" title="lane">',
      '<boltAction type="file" filePath="src/Cart.tsx">',
      'export function Cart() { const a = { x: 1 }; return <div>{a.x}</div>; }',
      '</boltAction>',
      '</boltArtifact>',
      '{"summary":"Panier pose","files":["src/Cart.tsx"],"risks":[],"verification":[]}',
    ].join('\n');

    const reste = retirerLesBlocsDAction(flux);
    expect(reste).not.toContain('export function Cart');
    expect(JSON.parse(reste.slice(reste.indexOf('{'), reste.lastIndexOf('}') + 1)).summary).toBe('Panier pose');
  });

  it('supporte un artefact TRONQUE (flux coupe en plein fichier)', () => {
    const flux = 'Avant.\n<boltArtifact id="l" title="l"><boltAction type="file" filePath="a.ts">const x = {';
    expect(retirerLesBlocsDAction(flux)).toBe('Avant.');
  });

  it("ne touche pas la sortie d'un role qui n'ecrit aucun fichier", () => {
    const flux = '{"summary":"Rien a ecrire","files":[],"risks":[],"verification":[]}';
    expect(retirerLesBlocsDAction(flux)).toBe(flux);
  });
});
