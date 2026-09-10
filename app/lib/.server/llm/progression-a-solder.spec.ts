import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { creerSuiviDeProgression } from './progression-a-solder';
import type { ProgressAnnotation } from '~/types/context';

function annonce(label: string, status: 'in-progress' | 'complete'): ProgressAnnotation {
  return { type: 'progress', label, status, order: 0, message: `${label}:${status}` };
}

describe('solder les étapes de progression restées ouvertes', () => {
  it("écrit tout ce qu'on lui donne, sans rien retenir en route", () => {
    const ecrites: ProgressAnnotation[] = [];
    const suivi = creerSuiviDeProgression((a) => ecrites.push(a));

    suivi.ecrire(annonce('summary', 'in-progress'));
    suivi.ecrire(annonce('summary', 'complete'));

    expect(ecrites.map((a) => `${a.label}:${a.status}`)).toEqual(['summary:in-progress', 'summary:complete']);
  });

  it('une étape soldée normalement ne reste pas ouverte', () => {
    const suivi = creerSuiviDeProgression(() => {});
    suivi.ecrire(annonce('summary', 'in-progress'));
    suivi.ecrire(annonce('summary', 'complete'));

    expect(suivi.etiquettesOuvertes()).toEqual([]);
    expect(suivi.solderRestantes(() => annonce('x', 'complete'))).toBe(0);
  });

  it('LE CAS MESURÉ : `summary` ouverte, `createSummary` échoue, `context` jamais ouverte', () => {
    const ecrites: ProgressAnnotation[] = [];
    const suivi = creerSuiviDeProgression((a) => ecrites.push(a));

    suivi.ecrire(annonce('summary', 'in-progress'));

    /* createSummary rejette ici : le `complete` de `summary` n'est jamais écrit. */

    const soldees = suivi.solderRestantes((etiquette) => annonce(etiquette, 'complete'));

    expect(soldees).toBe(1);
    expect(ecrites.map((a) => `${a.label}:${a.status}`)).toEqual(['summary:in-progress', 'summary:complete']);
    expect(suivi.etiquettesOuvertes()).toEqual([]);
  });

  it("solde DANS L'ORDRE D'OUVERTURE, ce que le client affiche de haut en bas", () => {
    const ecrites: string[] = [];
    const suivi = creerSuiviDeProgression((a) => ecrites.push(`${a.label}:${a.status}`));

    suivi.ecrire(annonce('summary', 'in-progress'));
    suivi.ecrire(annonce('context', 'in-progress'));
    suivi.solderRestantes((etiquette) => annonce(etiquette, 'complete'));

    expect(ecrites).toEqual(['summary:in-progress', 'context:in-progress', 'summary:complete', 'context:complete']);
  });

  it('est idempotent : un second solde n’écrit plus rien', () => {
    const ecrites: string[] = [];
    const suivi = creerSuiviDeProgression((a) => ecrites.push(a.label));

    suivi.ecrire(annonce('summary', 'in-progress'));
    expect(suivi.solderRestantes((e) => annonce(e, 'complete'))).toBe(1);
    expect(suivi.solderRestantes((e) => annonce(e, 'complete'))).toBe(0);
    expect(ecrites).toEqual(['summary', 'summary']);
  });

  it('une étape ré-ouverte après solde est de nouveau suivie', () => {
    const suivi = creerSuiviDeProgression(() => {});
    suivi.ecrire(annonce('context', 'in-progress'));
    suivi.solderRestantes((e) => annonce(e, 'complete'));
    suivi.ecrire(annonce('context', 'in-progress'));

    expect(suivi.etiquettesOuvertes()).toEqual(['context']);
  });
});

describe('la route de chat utilise réellement ce suivi', () => {
  const SOURCE = readFileSync(join(__dirname, '..', '..', '..', 'routes', 'api.chat.ts'), 'utf8');

  function compter(aiguille: string): number {
    return SOURCE.split(aiguille).length - 1;
  }

  it('témoin positif : le fichier lu est bien la route de chat', () => {
    expect(SOURCE.length).toBeGreaterThan(50_000);
    expect(compter('API_CHAT_PROGRESS_LABELS.summary')).toBeGreaterThanOrEqual(2);
  });

  it('le suivi est créé une fois et branché sur le flux', () => {
    expect(
      SOURCE.includes(
        'const progressionDuContexte = creerSuiviDeProgression((annotation) => dataStream.writeData(annotation));',
      ),
    ).toBe(true);
  });

  it('les DEUX étapes du bloc passent par le suivi, aucune n’écrit en direct', () => {
    /*
     * La garde qui compte : une écriture directe qui contournerait le suivi ne
     * serait pas comptée, donc pas soldée — exactement le défaut d'origine.
     * On exige que chaque étiquette du bloc soit écrite via `ecrire`, et
     * qu'aucune ne le soit via `dataStream.writeData`.
     */
    const blocsDuSuivi = SOURCE.split('progressionDuContexte.ecrire({')
      .slice(1)
      .map((bloc) => bloc.slice(0, 200));

    for (const etiquette of ['summary', 'context']) {
      const viaSuivi = blocsDuSuivi.filter((bloc) =>
        bloc.includes(`label: API_CHAT_PROGRESS_LABELS.${etiquette},`),
      ).length;

      /* Une ouverture et une fermeture, toutes deux par le suivi. */
      expect(viaSuivi, `étiquette ${etiquette} : ${viaSuivi} écriture(s) via le suivi`).toBe(2);
    }

    const blocsDirects = SOURCE.split('dataStream.writeData({');

    const etiquettesEcritesEnDirect = blocsDirects
      .slice(1)
      .map((bloc) => bloc.slice(0, 200))
      .filter(
        (bloc) =>
          bloc.includes('API_CHAT_PROGRESS_LABELS.summary') || bloc.includes('API_CHAT_PROGRESS_LABELS.context'),
      );

    expect(etiquettesEcritesEnDirect).toEqual([]);
  });

  it('le chemin d’échec solde ce qui reste, sans nommer les étiquettes', () => {
    expect(compter('progressionDuContexte.solderRestantes(')).toBe(1);

    const catchBloc = SOURCE.split('} catch (contextError) {')[1] ?? '';
    expect(catchBloc.length).toBeGreaterThan(100);
    expect(catchBloc.slice(0, 2000).includes('progressionDuContexte.solderRestantes(')).toBe(true);
  });
});
