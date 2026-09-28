import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fournisseurInapte } from './aptitude-fournisseur';
import { compterActionsDeFichier, responseEmittedFileAction } from '~/utils/response-file-actions';

const RACINE = join(__dirname, '..', '..', '..', '..');
const SOURCE_ROUTE = readFileSync(join(RACINE, 'app/routes/api.chat.ts'), 'utf8');

function compter(aiguille: string): number {
  return SOURCE_ROUTE.split(aiguille).length - 1;
}

/**
 * POURQUOI CE FICHIER EXISTE.
 *
 * `aptitude-fournisseur.ts` portait son critère depuis son écriture et n'était
 * importé QUE par son propre spec. Une règle juste que rien n'appelle ne
 * protège de rien : la plateforme continuait de compter comme une réussite un
 * fournisseur qui répond `200`, produit du texte et n'écrit aucun fichier.
 *
 * Le spec du module tient la DÉCISION. Celui-ci tient le CÂBLAGE — la moitié
 * qui manquait, et la seule que rien ne rendait rouge.
 */
describe('le compte de fichiers est un compte, pas un drapeau', () => {
  const DEUX = `
    <boltAction type="file" filePath="src/App.tsx">a</boltAction>
    <boltAction type='shell'>npm i</boltAction>
    <boltAction filePath="src/main.tsx" type="file">b</boltAction>
  `;

  it('compte chaque action de fichier, et ignore les autres types', () => {
    expect(compterActionsDeFichier(DEUX)).toBe(2);
  });

  it('le prédicat DÉRIVE du compte : pas de seconde régularité qui puisse diverger', () => {
    expect(responseEmittedFileAction(DEUX)).toBe(true);
    expect(responseEmittedFileAction('<boltAction type="shell">npm i</boltAction>')).toBe(false);
    expect(compterActionsDeFichier('<boltAction type="shell">npm i</boltAction>')).toBe(0);
  });

  it('texte vide ou absent : zéro, pas une exception', () => {
    expect(compterActionsDeFichier('')).toBe(0);
    expect(compterActionsDeFichier(undefined as unknown as string)).toBe(0);
  });

  it('le compte alimente réellement le critère d’inaptitude', () => {
    const constat = (fichiersEcrits: number) => ({
      modeConstruction: true,
      fichiersEcrits,
      termine: true,
    });

    expect(fournisseurInapte(constat(compterActionsDeFichier(DEUX)))).toBe(false);
    expect(fournisseurInapte(constat(compterActionsDeFichier('juste de la prose')))).toBe(true);
  });
});

describe('la route de chat applique réellement le critère', () => {
  it('témoin positif : le fichier lu est bien la route de chat', () => {
    expect(SOURCE_ROUTE.length).toBeGreaterThan(50_000);
    expect(compter('onFinish')).toBeGreaterThanOrEqual(1);
  });

  it('le critère est importé ET appelé — pas seulement importé', () => {
    expect(SOURCE_ROUTE.includes("from '~/lib/.server/llm/aptitude-fournisseur'")).toBe(true);
    expect(compter('fournisseurInapte(constatDuTour)')).toBe(1);
  });

  it('le constat porte les TROIS faits, chacun depuis sa vraie source', () => {
    const bloc = SOURCE_ROUTE.split('const constatDuTour: ConstatDeTour = {')[1] ?? '';
    expect(bloc.length).toBeGreaterThan(50);

    const corps = bloc.slice(0, 1500);

    // Un refus explicite de fichiers n'est pas une construction : il n'établit rien.
    expect(corps.includes("modeConstruction: chatMode === 'build' && !fichiersRefuses,")).toBe(true);
    expect(corps.includes('fichiersEcrits: fichiersEmis,')).toBe(true);
    expect(corps.includes("termine: finishReason === 'stop',")).toBe(true);
  });

  it('un tour inapte N’ÉCARTE JAMAIS le fournisseur pour tout le pod — portée : la requête', () => {
    /*
     * Décision du 2026-09-28, qui REMPLACE celle du 10/09 que ce test épinglait :
     * mesuré en production, une demande de plan « n'écris aucun fichier » avait
     * écarté Anthropic 300 s pour tous les utilisateurs du pod. Le constat reste
     * journalisé, mais il ne touche plus la table partagée.
     */
    const bloc = SOURCE_ROUTE.split('if (fournisseurInapte(constatDuTour)')[1] ?? '';
    expect(bloc.length).toBeGreaterThan(50);

    const corps = bloc.slice(0, bloc.indexOf('\n            }\n'));
    expect(corps.includes('chat.fournisseur.sterile')).toBe(true);
    expect(corps.includes("portee: 'requete'")).toBe(true);
    expect(corps.includes('markProviderUnhealthy(')).toBe(false);
    expect(compter("'sterile'")).toBe(0);
  });

  it('un échec de flux n’écarte le fournisseur pour le pod QUE s’il porte sur la clé', () => {
    const bloc = SOURCE_ROUTE.split('const kind = classifyProviderFailure(error);')[1] ?? '';
    expect(bloc.length).toBeGreaterThan(50);

    const corps = bloc.slice(0, 1400);
    expect(corps.includes('if (echecDeCle(kind)) {')).toBe(true);
    expect(compter('markProviderUnhealthy(')).toBe(1);
  });

  it('le compte remplace le drapeau PARTOUT : une seule vérité pour un seul fait', () => {
    /*
     * Le drapeau `emittedFileAction` et le compte auraient pu coexister — c'est
     * exactement le motif « deux vérités pour un fait » qui produit un constat
     * faux au premier refactor. On exige qu'il ne reste plus rien de l'ancien.
     */
    expect(compter('emittedFileAction')).toBe(0);
    expect(compter('fichiersEmis += compterActionsDeFichier(content);')).toBe(1);
    expect(compter('fichiersEmis > 0')).toBeGreaterThanOrEqual(2);
  });
});
