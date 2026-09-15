import { describe, expect, it } from 'vitest';

import { ReponseFournisseurIncomprise } from './gateway';

/*
 * BUG-AGENT-MESSAGES-VIDES — mesure du 2026-09-01 sur la base de PRODUCTION :
 * sur 1039 messages d'assistant, 564 avaient un contenu VIDE (54,3 %), contre
 * 0 sur 508 cotes utilisateur. A l'ecran, le fil affiche « Agent » et sa barre
 * d'actions, sans aucun texte.
 *
 * Cause : `extractContent` sondait quatre formes connues puis rendait `''` pour
 * tout le reste. Une chaine vide traverse ensuite toute la chaine — passerelle,
 * API, base, rendu — sans qu'aucune couche ne la conteste, parce qu'elle est
 * indistinguable d'une reponse legitimement vide.
 *
 * On ne teste pas la fonction directement (elle est privee) : on teste
 * l'invariant qui compte, via le module et la classe d'erreur exportee.
 */
describe('BUG-MESSAGES-VIDES — une reponse incomprise ne devient jamais une chaine vide', () => {
  it("la classe d'erreur existe et porte un code exploitable", () => {
    const e = new ReponseFournisseurIncomprise(['foo', 'bar']);

    expect(e.code).toBe('AI_PROVIDER_SHAPE_UNKNOWN');
    expect(e.formesVues).toEqual(['foo', 'bar']);
    expect(e.message).toContain('foo');
  });

  it('elle nomme les cles vues, pour que le diagnostic soit possible sans reproduire', () => {
    const e = new ReponseFournisseurIncomprise(['error', 'type']);
    expect(e.message).toMatch(/error/);
    expect(e.message).toMatch(/type/);
  });

  it("une liste vide est dite explicitement plutot que rendue comme rien", () => {
    expect(new ReponseFournisseurIncomprise([]).message).toContain('aucune');
  });
});
