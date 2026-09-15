import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * BUG-DEPLOY-010, suspect n°2 — UNE ÉTAPE TUÉE N'EST PAS UNE RÉUSSITE.
 *
 * Node rend `code === null` quand un processus meurt par SIGNAL. Toute la
 * chaîne écrivait `?? 0` sur ce code : l'agent d'espace de travail dans son
 * `close`, l'API sur les trois chemins `/commands/run`, et le client dans
 * `foldCommandExitCode`. Une commande tuée — OOM du pod, moisson, SIGKILL de
 * délai — remontait donc partout comme un succès, et le déploiement ou l'aperçu
 * continuait sur un travail qui n'avait jamais fini.
 *
 * CE QUI REND CE DÉFAUT SI PERSISTANT : il se répare par bouts. Corriger
 * l'agent seul déplace le zéro dans l'API ; corriger l'API seule le déplace
 * dans le client. Les trois moitiés vont ensemble, et c'est cette garde qui le
 * dit — elle vise LA RÈGLE, pas les sept occurrences du jour (règle 7).
 *
 * Lu commentaires retirés : la prose ci-dessus et celle du produit citent
 * `?? 0` pour expliquer le défaut (règle 5).
 */

const RACINE = join(process.cwd(), '..', '..');

const FICHIERS = ['services/api/src/app.ts', 'services/workspace-agent/src/app.ts', 'app/lib/runtime/command-exit.ts'];

const sources = FICHIERS.map((chemin) => ({
  chemin,
  code: readFileSync(join(RACINE, chemin), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, ''),
}));

describe('aucun code de sortie ne retombe silencieusement à zéro', () => {
  it('les trois fichiers ont bien été lus — sinon ce bloc ne mesure rien', () => {
    /*
     * Contrôle positif (règle 14). Sans lui, un chemin devenu faux rendrait
     * « zéro occurrence » et la garde passerait au vert en ne lisant rien.
     */
    for (const { chemin, code } of sources) {
      expect(code.length, chemin).toBeGreaterThan(200);
      expect(code, chemin).toContain('exitCode');
    }
  });

  it('nulle part `?? 0` sur un code de sortie', () => {
    const motif = /(?:exitCode|\bcode)\s*\?\?\s*0\b/g;

    const fautives = sources.flatMap(({ chemin, code }) => [...code.matchAll(motif)].map((m) => `${chemin} → ${m[0]}`));

    expect(fautives).toEqual([]);
  });

  it('et le contraire est vrai : la chaîne porte bien la réparation', () => {
    /*
     * Une garde qui n'interdit QUE quelque chose passe au vert le jour où le
     * code disparaît. Celle-ci exige aussi que la réparation soit là.
     */
    const api = sources.find((s) => s.chemin.endsWith('api/src/app.ts'))!.code;
    const client = sources.find((s) => s.chemin.endsWith('command-exit.ts'))!.code;
    const agent = sources.find((s) => s.chemin.endsWith('workspace-agent/src/app.ts'))!.code;

    expect(api).toContain('result.code ?? 1');
    expect(client).toContain('event.exitCode ?? (current || 1)');

    // L'agent transmet le code TEL QUEL, avec le signal qui l'a tué.
    expect(agent).toMatch(/exitCode:\s*code,/u);
    expect(agent).toMatch(/signal:\s*signal\s*\?\?\s*undefined,/u);
  });
});
