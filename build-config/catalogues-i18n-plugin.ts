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

/*
 * Import RELATIF assumé : ce module est chargé par `vite.config.ts` lui-même,
 * donc par esbuild AVANT que `resolve.alias` n'existe — un `~/` n'y résout pas.
 * Et la classification ne peut pas être recopiée ici : elle doit être LA MÊME
 * qu'à l'exécution, sinon le build émet des tranches que le client ne sait pas
 * recomposer. `surfaces.spec.ts` tient la liste, ce fichier la consomme.
 */
// eslint-disable-next-line no-restricted-imports
import { repartirParSurface, SURFACES, type Surface } from '../app/lib/i18n/surfaces';

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

export function nomDeFichier(langue: Langue, surface: Surface, json: string): string {
  return `assets/catalogue-${langue}-${surface}-${empreinte(json)}.json`;
}

/** Le JSON de chaque couple (langue, surface) — c'est ce que le navigateur télécharge. */
export function cataloguesJson(ressources: Ressources): Record<Langue, Record<Surface, string>> {
  const json = {} as Record<Langue, Record<Surface, string>>;

  for (const langue of LANGUES) {
    const tranches = repartirParSurface(ressources[langue].translation);
    json[langue] = {} as Record<Surface, string>;

    for (const surface of SURFACES) {
      json[langue][surface] = JSON.stringify(tranches[surface]);
    }
  }

  return json;
}

export type Urls = Record<Langue, Record<Surface, string>>;

export function urlsDev(base: string): Urls {
  const urls = {} as Urls;

  for (const langue of LANGUES) {
    urls[langue] = {} as Record<Surface, string>;

    for (const surface of SURFACES) {
      urls[langue][surface] = `${base.replace(/\/$/, '')}${PREFIXE_DEV}${langue}-${surface}.json`;
    }
  }

  return urls;
}

export function urlsBuild(base: string, json: Record<Langue, Record<Surface, string>>): Urls {
  const urls = {} as Urls;

  for (const langue of LANGUES) {
    urls[langue] = {} as Record<Surface, string>;

    for (const surface of SURFACES) {
      urls[langue][surface] = `${base.replace(/\/$/, '')}/${nomDeFichier(langue, surface, json[langue][surface])}`;
    }
  }

  return urls;
}

export function codeDuModuleVirtuel(urls: Urls): string {
  return `export const URLS = ${JSON.stringify(urls)};\n`;
}

function estUneLangue(candidat: string): candidat is Langue {
  return (LANGUES as readonly string[]).includes(candidat);
}

function estUneSurface(candidat: string): candidat is Surface {
  return (SURFACES as readonly string[]).includes(candidat);
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
  let jsonParLangue: Promise<Record<Langue, Record<Surface, string>>> | undefined;

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
        for (const surface of SURFACES) {
          this.emitFile({
            type: 'asset',
            fileName: nomDeFichier(langue, surface, json[langue][surface]),
            source: json[langue][surface],
          });
        }
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(PREFIXE_DEV, (req, res, next) => {
        const nom = (req.url ?? '').replace(/^\//, '').replace(/\.json(\?.*)?$/, '');
        const separateur = nom.indexOf('-');
        const langue = separateur === -1 ? nom : nom.slice(0, separateur);
        const surface = separateur === -1 ? '' : nom.slice(separateur + 1);

        if (!estUneLangue(langue) || !estUneSurface(surface)) {
          next();
          return;
        }

        server
          .ssrLoadModule(`/${MODULE_RESSOURCES}`)
          .then((module) => {
            const ressources = (module as { RESOURCES: Ressources }).RESOURCES;
            const tranches = repartirParSurface(ressources[langue].translation);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(tranches[surface]));
          })
          .catch(next);
      });
    },
  };
}
