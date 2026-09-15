import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Garde de source : `extractContent` est privee, mais son invariant est trop
 * couteux pour rester non tenu — c'est lui qui a rempli la base de 564 messages
 * vides. Regle 15 : un correctif sans test qui le tienne est non livre.
 */
const source = readFileSync(join(__dirname, 'gateway.ts'), 'utf8');

function corpsExtractContent(): string {
  const debut = source.indexOf('function extractContent(');
  expect(debut, 'extractContent a disparu').toBeGreaterThan(-1);

  const fin = source.indexOf('\n}', debut);
  expect(fin).toBeGreaterThan(debut);

  return source.slice(debut, fin);
}

describe('extractContent ne peut plus echouer en silence', () => {
  it("ne rend JAMAIS '' en dernier recours", () => {
    const corps = corpsExtractContent();

    /*
     * Le defaut d'origine tenait en une ligne : `return '';` a la fin de la
     * fonction. Toute forme non reconnue devenait un message vide persiste.
     */
    expect(corps, "le `return ''` en dernier recours est revenu").not.toMatch(/return\s*''\s*;/);
  });

  it('leve une erreur typee quand aucune forme n’est reconnue', () => {
    expect(corpsExtractContent()).toMatch(/throw new ReponseFournisseurIncomprise/);
  });

  it("un content[] SANS bloc texte est signale, pas rendu comme vide", () => {
    const corps = corpsExtractContent();

    /*
     * Anthropic rend des blocs `thinking` / `tool_use` sans `.text`. Une reponse
     * composee uniquement de ceux-la donnait `''` — exactement le scenario du
     * parametre `thinking` (BUG-AGENT-008).
     */
    expect(corps).toMatch(/blocsTexte\.length === 0/);
    expect(corps).toMatch(/typeof part\?\.text === 'string'/);
  });
});
