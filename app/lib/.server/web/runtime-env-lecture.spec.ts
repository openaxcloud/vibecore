import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isWebFetchToolEnabled } from './web-fetch-tool';

/*
 * LE PIÈGE, MESURÉ SUR LE BUILD DE PRODUCTION LOCAL — pas déduit de la lecture.
 *
 * Une sonde posée dans `readRedisUrl`, sur le bundle SSR servi par
 * `react-router-serve`, a rendu :
 *
 *     {"event":"probe.redisUrl","envArg":"undefined","processHasKey":false,
 *      "processLen":0,"resolvedLen":0}
 *
 * pendant que `/proc/<pid>/environ` du processus qui servait la page portait
 * bien `REDIS_URL` (longueur 23). `vite-plugin-node-polyfills`
 * (`vite.config.ts`, `globals.process = true`) injecte un `process` de
 * navigateur dans le bundle SSR : son `env` est `{}`.
 *
 * Une lecture `process.env.X` nue rend donc `undefined` DANS LE POD WEB, même
 * quand Kubernetes a posé la variable. Le plafond partagé retombait alors sur
 * le compteur par pod, et le drapeau de l'outil ne pouvait pas être levé —
 * deux correctifs inertes, sans un seul test rouge.
 *
 * `globalThis.process` n'est pas réécrit par le polyfill : c'est ce que lit
 * `readRuntimeEnv`, et c'est la seule lecture autorisée ici.
 *
 * Ce test lit la SOURCE (règle 5 : ancrer sur du code, jamais sur de la prose),
 * comme `api.chat.web-reference-cablage.spec.ts`.
 */

const DIR = join(process.cwd(), 'app/lib/.server/web');

/**
 * `NODE_ENV` est la seule exception légitime : `vite.config.ts` l'inline au
 * build (`define: { 'process.env.NODE_ENV': … }`), donc elle ne dépend pas du
 * `process` d'exécution.
 */
const AUTORISE = /^NODE_ENV$/;

function sourcesServeur(): Array<{ nom: string; texte: string }> {
  return readdirSync(DIR)
    .filter((nom) => nom.endsWith('.ts') && !nom.endsWith('.spec.ts'))
    .map((nom) => ({ nom, texte: readFileSync(join(DIR, nom), 'utf8') }));
}

/** Retire commentaires de bloc et de ligne : un piège EXPLIQUÉ n'est pas un piège commis. */
function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('lecture d’environnement dans les modules serveur de la référence web', () => {
  it('témoin positif : le scanner voit bien les fichiers et sait repérer une lecture nue', () => {
    const fichiers = sourcesServeur();

    // Sans ce témoin, un « 0 occurrence » pourrait venir d'un dossier vide (règle 14).
    expect(fichiers.length).toBeGreaterThanOrEqual(6);
    expect(fichiers.map((f) => f.nom)).toContain('rate-limit-redis.server.ts');

    // Le scanner doit voir les DEUX formes qui ont réellement mordu.
    expect(sansCommentaires('const a = process.env.REDIS_URL;')).toContain('process.env.REDIS_URL');
    expect(sansCommentaires('const e = typeof process !== "undefined" ? process.env : undefined;')).toContain(
      'process.env',
    );

    // …et ne pas voir ce qui n'est que commenté.
    expect(sansCommentaires('/* process.env.REDIS_URL */\nconst a = 1;')).not.toContain('process.env');
  });

  it('aucun module ne lit `process.env` nu (hors NODE_ENV, inlinée au build)', () => {
    const fautes: string[] = [];

    for (const { nom, texte } of sourcesServeur()) {
      const code = sansCommentaires(texte);
      const motif = /process\s*\.\s*env/g;

      for (let m = motif.exec(code); m; m = motif.exec(code)) {
        const suite = code.slice(m.index + m[0].length);
        const propriete = /^\s*\??\s*(?:\.\s*([A-Za-z0-9_$]+)|\[\s*['"`]([A-Za-z0-9_$]+)['"`]\s*\])/.exec(suite);

        /*
         * Pas de propriété derrière = l'objet entier est capturé (`const e =
         * process.env`, `? process.env :`, un argument…). C'est la forme qui a
         * laissé passer le défaut la première fois : l'alias est aussi vide que
         * la lecture directe.
         */
        if (!propriete) {
          fautes.push(`${nom} → process.env capturé en entier`);
          continue;
        }

        const cle = propriete[1] ?? propriete[2];

        if (!AUTORISE.test(cle)) {
          fautes.push(`${nom} → process.env.${cle}`);
        }
      }
    }

    expect(fautes).toEqual([]);
  });

  it('les deux lecteurs d’environnement passent bien par readRuntimeEnv', () => {
    const redis = readFileSync(join(DIR, 'rate-limit-redis.server.ts'), 'utf8');
    const outil = readFileSync(join(DIR, 'web-fetch-tool.ts'), 'utf8');

    expect(redis).toContain("import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';");
    expect(redis).toContain("readRuntimeEnv('REDIS_URL')");
    expect(outil).toContain("import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';");
    expect(outil).toContain("readRuntimeEnv('ECODE_WEB_FETCH_TOOL_ENABLED')");
  });

  it('l’argument explicite garde la priorité sur l’environnement du processus', () => {
    vi.stubEnv('ECODE_WEB_FETCH_TOOL_ENABLED', '1');

    // Lecture d'environnement : sans argument, la variable du processus décide.
    expect(isWebFetchToolEnabled()).toBe(true);

    // Un env explicite qui dit « vide » ne doit PAS être écrasé par le processus.
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: '' })).toBe(false);

    vi.unstubAllEnvs();
    expect(isWebFetchToolEnabled()).toBe(false);
  });
});
