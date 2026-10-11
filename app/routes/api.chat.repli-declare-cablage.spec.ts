import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * LE REPLI EST CELUI DE LA CARTE, ET IL EST DIT.
 *
 * Mesuré le 2026-09-28 en production (projet `cmukvgycf00cp0nf94j2l71js`) : un
 * tour choisi en `claude-opus-5` a été servi par `gpt-4.1` — premier maillon
 * d'une chaîne codée en dur, alors que la carte de routage déclare sa propre
 * ligne `fallback` — et rien ne le disait à l'utilisateur. Ce fichier tient le
 * BRANCHEMENT : les fonctions pures ont leurs propres specs.
 */
const neutraliser = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

const route = neutraliser(readFileSync(join(__dirname, 'api.chat.ts'), 'utf8'));
const flux = neutraliser(readFileSync(join(__dirname, '../lib/.server/llm/stream-text.ts'), 'utf8'));

describe('la route transmet le repli de la carte et DÉCLARE la bascule', () => {
  it('témoin positif : les deux fichiers lus sont les bons', () => {
    expect(route.length).toBeGreaterThan(50_000);
    expect(flux).toMatch(/export async function streamText\(/u);
  });

  it('le repli vient de `agentRoute.fallback` — `null` quand la carte n’en déclare pas', () => {
    expect(route).toMatch(/const repliDeCarte = agentRoute\s*\?\s*agentRoute\.fallback/u);
    expect(route).toMatch(/:\s*null\s*:\s*undefined;/u);
  });

  it('les DEUX appels au modèle — initial et continuation — reçoivent le repli et le rappel', () => {
    expect(route.split('repliDeCarte,\n').length - 1).toBe(2);
    expect(route.split('onBasculeFournisseur: declarerBascule,').length - 1).toBe(2);
  });

  it('la bascule écrit une annotation sur le message : l’utilisateur la voit', () => {
    const bloc = route.split('const declarerBascule = (')[1] ?? '';
    expect(bloc.length).toBeGreaterThan(50);
    expect(bloc.slice(0, 1200)).toMatch(/dataStream\.writeMessageAnnotation\(\{\s*type: 'basculeFournisseur'/u);
  });

  it('un tour basculé est facturé sur la ligne de repli de la carte', () => {
    expect(route).toMatch(/basculeVersRepli && agentRoute\.fallback\s*\?\s*agentRoute\.fallback\.lineKey/u);
  });

  it('`streamText` passe la chaîne de la carte au choix du fournisseur et appelle le rappel', () => {
    expect(flux).toMatch(/chaine: props\.repliDeCarte \? \[props\.repliDeCarte\] : \[\]/u);
    expect(flux).toMatch(/props\.onBasculeFournisseur\?\.\(/u);
  });
});
