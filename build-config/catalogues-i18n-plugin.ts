/**
 * BUG-PERF-I18N-RACINE-001 — un catalogue JSON par langue, émis au build.
 *
 * POURQUOI UN PLUGIN ET PAS UN DÉCOUPAGE ROLLUP. Chaque fichier de
 * `app/lib/i18n/catalogs/` porte `xEn` ET `xFr` dans le MÊME module, et
 * Rollup ne scinde jamais un module : un chunk « français » importerait
 * `catalogs/chat.ts` avec ses deux langues, gain nul. Le build ÉVALUE donc
 * `runtime-resources.ts` (via `tsx`, hors du graphe Rollup) et sérialise
 * chaque langue en JSON. Le navigateur ne télécharge que le sien.
 *
 * DÉTERMINISME. `react-router build` lance DEUX builds Vite — client puis SSR —
 * et `root.tsx` (rendu par le SSR) doit connaître l'URL que le client ira
 * chercher pour la précharger dans `<head>`. Le nom porte l'empreinte du
 * contenu : les deux builds évaluent les mêmes catalogues, donc calculent la
 * même URL, sans fichier de liaison entre eux. Seul le build CLIENT émet
 * l'asset ; le SSR ne fait que nommer.
 *
 * EN DEV, un middleware sert le JSON depuis `ssrLoadModule` : toujours frais,
 * jamais mis en cache.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';

export const LANGUES = ['en', 'fr', 'es', 'ar'] as const;
export type Langue = (typeof LANGUES)[number];
export type Catalogue = Record<string, string>;
export type Ressources = Record<Langue, { translation: Catalogue }>;

export const ID_MODULE_VIRTUEL = 'virtual:catalogues-i18n';

const ID_RESOLU = `\0${ID_MODULE_VIRTUEL}`;

/** Préfixe des URL servies par le middleware de dev. */
export const PREFIXE_DEV = '/__catalogues-i18n/';

/** Le module évalué au build — le SEUL importeur autorisé hors serveur et tests. */
export const MODULE_RESSOURCES = 'app/lib/i18n/runtime-resources.ts';

export function empreinte(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 10);
}

export function nomDeFichier(langue: Langue, json: string): string {
  return `assets/catalogue-${langue}-${empreinte(json)}.json`;
}

export function cataloguesJson(ressources: Ressources): Record<Langue, string> {
  const json = {} as Record<Langue, string>;

  for (const langue of LANGUES) {
    json[langue] = JSON.stringify(ressources[langue].translation);
  }

  return json;
}

export function urlsDev(base: string): Record<Langue, string> {
  const urls = {} as Record<Langue, string>;

  for (const langue of LANGUES) {
    urls[langue] = `${base.replace(/\/$/, '')}${PREFIXE_DEV}${langue}.json`;
  }

  return urls;
}

export function urlsBuild(base: string, json: Record<Langue, string>): Record<Langue, string> {
  const urls = {} as Record<Langue, string>;

  for (const langue of LANGUES) {
    urls[langue] = `${base.replace(/\/$/, '')}/${nomDeFichier(langue, json[langue])}`;
  }

  return urls;
}

export function codeDuModuleVirtuel(urls: Record<Langue, string>): string {
  return `export const URLS = ${JSON.stringify(urls)};\n`;
}

function estUneLangue(candidat: string): candidat is Langue {
  return (LANGUES as readonly string[]).includes(candidat);
}

async function evaluerAvecTsx(): Promise<Ressources> {
  const { tsImport } = await import('tsx/esm/api');
  const url = pathToFileURL(resolve(process.cwd(), MODULE_RESSOURCES)).href;
  const module = (await tsImport(url, import.meta.url)) as { RESOURCES: Ressources };

  return module.RESOURCES;
}

export interface OptionsDuPlugin {
  /** Remplace l'évaluation `tsx` — pour les tests du plugin. */
  evaluer?: () => Promise<Ressources>;
}

export function cataloguesI18nPlugin(options: OptionsDuPlugin = {}): Plugin {
  const evaluer = options.evaluer ?? evaluerAvecTsx;

  let config: ResolvedConfig;
  let jsonParLangue: Promise<Record<Langue, string>> | undefined;

  const obtenirJson = () => {
    jsonParLangue ??= evaluer().then(cataloguesJson);

    return jsonParLangue;
  };

  return {
    name: 'vibecore:catalogues-i18n',

    configResolved(resolue) {
      config = resolue;
    },

    resolveId(id) {
      return id === ID_MODULE_VIRTUEL ? ID_RESOLU : undefined;
    },

    async load(id) {
      if (id !== ID_RESOLU) {
        return undefined;
      }

      if (config.command !== 'build') {
        return codeDuModuleVirtuel(urlsDev(config.base));
      }

      return codeDuModuleVirtuel(urlsBuild(config.base, await obtenirJson()));
    },

    async generateBundle() {
      if (config.command !== 'build' || config.build.ssr) {
        return;
      }

      const json = await obtenirJson();

      for (const langue of LANGUES) {
        this.emitFile({ type: 'asset', fileName: nomDeFichier(langue, json[langue]), source: json[langue] });
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(PREFIXE_DEV, (req, res, next) => {
        const langue = (req.url ?? '').replace(/^\//, '').replace(/\.json(\?.*)?$/, '');

        if (!estUneLangue(langue)) {
          next();
          return;
        }

        server
          .ssrLoadModule(`/${MODULE_RESSOURCES}`)
          .then((module) => {
            const ressources = (module as { RESOURCES: Ressources }).RESOURCES;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(ressources[langue].translation));
          })
          .catch(next);
      });
    },
  };
}
