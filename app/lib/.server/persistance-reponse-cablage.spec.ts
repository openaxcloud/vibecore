/*
 * La garde du CÂBLAGE de `persistance-reponse.ts` : le module seul ne prouve
 * rien de la route. Lit la SOURCE de la route, commentaires neutralisés.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(join(process.cwd(), 'app', 'routes', 'api.chat.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
  .replace(/\/\/.*$/gm, '');

describe('la réponse du serveur est écrite depuis la route de chat', () => {
  it('témoin : le fichier lu est la route de chat', () => {
    expect(ROUTE.length).toBeGreaterThan(50_000);
    expect(ROUTE).toContain('const flushUsage = async');
  });

  it('le texte de CHAQUE segment est accumulé, dans le rappel de fin de segment', () => {
    expect(ROUTE).toMatch(/fichiersEmis \+= compterActionsDeFichier\(content\);\s*contenuDuTour \+= content \?\? '';/);
  });

  it('l’écriture vise la ligne du navigateur : identifiant stable du message, rôle assistant, PUT transcript', () => {
    const bloc = ROUTE.split('const persisterLaReponseDuServeur = async')[1] ?? '';
    expect(bloc.length).toBeGreaterThan(100);

    const corps = bloc.slice(0, 1600);
    expect(corps).toContain('clientId: identifiantDuMessageDeReponse');
    expect(corps).toContain('conversationId: demande?.conversationId');
    expect(corps).toContain('contenu: contenuDuTour');
    expect(corps).toMatch(/\/transcript`/);
    expect(corps).toMatch(/method: 'PUT'/);
    expect(corps).toContain("role: 'assistant'");
    expect(corps).toContain('catch');
  });

  it('LE POINT QUI PORTE LA CORRECTION — appelée au point de sortie commun à toutes les fins de tour', () => {
    const flush = ROUTE.split('const flushUsage = async')[1] ?? '';
    const garde = flush.indexOf('tourDejaFacture = true;');
    const appel = flush.indexOf('await persisterLaReponseDuServeur();');
    const facturation = flush.indexOf('const completionProvider');

    expect(garde, 'garde « une seule fois par tour » introuvable').toBeGreaterThan(-1);
    expect(appel, 'l’écriture de la réponse n’est plus dans flushUsage').toBeGreaterThan(garde);
    expect(facturation, 'témoin : la facturation est bien dans flushUsage').toBeGreaterThan(-1);
    expect(appel, 'l’écriture doit précéder la facturation').toBeLessThan(facturation);
  });
});
