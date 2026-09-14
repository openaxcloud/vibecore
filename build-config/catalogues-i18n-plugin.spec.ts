import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cataloguesI18nPlugin,
  cataloguesJson,
  codeDuModuleVirtuel,
  empreinte,
  ID_MODULE_VIRTUEL,
  LANGUES,
  nomDeFichier,
  PREFIXE_DEV,
  type Ressources,
  urlsBuild,
  urlsDev,
} from './catalogues-i18n-plugin';

/**
 * BUG-PERF-I18N-RACINE-001 — ce que le plugin doit tenir, indépendamment du
 * contenu réel des catalogues (qui est éprouvé par `runtime-resources.spec.ts`
 * et, sur l'artefact, par `scripts/verifier-chemin-critique.ts`).
 */

const RESSOURCES: Ressources = {
  en: { translation: { 'root.loadingPage': 'Loading page', 'common.unavailable': 'Unavailable' } },
  fr: { translation: { 'root.loadingPage': 'Chargement de la page', 'common.unavailable': 'Indisponible' } },
  es: { translation: { 'root.loadingPage': 'Cargando página' } },
  ar: { translation: { 'root.loadingPage': 'جارٍ تحميل الصفحة' } },
};

type Hook<T> = T extends (...args: infer A) => infer R ? (this: unknown, ...args: A) => R : never;

function pluginPret(command: 'build' | 'serve', ssr = false, ressources = RESSOURCES) {
  const plugin = cataloguesI18nPlugin({ evaluer: () => Promise.resolve(ressources) });
  const configResolved = plugin.configResolved as Hook<typeof plugin.configResolved>;
  configResolved.call(plugin, { command, base: '/', build: { ssr } } as never);

  return plugin;
}

async function charger(plugin: ReturnType<typeof pluginPret>, id: string) {
  const load = plugin.load as Hook<typeof plugin.load>;

  return load.call(plugin, id) as Promise<string | undefined>;
}

describe('catalogues i18n — un JSON par langue', () => {
  it('l’empreinte dépend du contenu, et de rien d’autre', () => {
    const json = cataloguesJson(RESSOURCES);

    expect(empreinte(json.fr)).toBe(empreinte(JSON.stringify(RESSOURCES.fr.translation)));
    expect(empreinte(json.fr)).not.toBe(empreinte(json.en));
    expect(empreinte(json.fr)).toMatch(/^[0-9a-f]{10}$/);
  });

  it('le nom de fichier porte la langue et l’empreinte — deux builds tombent sur la même URL', () => {
    const json = cataloguesJson(RESSOURCES);

    expect(nomDeFichier('fr', json.fr)).toBe(`assets/catalogue-fr-${empreinte(json.fr)}.json`);
    expect(urlsBuild('/', json).fr).toBe(`/${nomDeFichier('fr', json.fr)}`);
    expect(urlsBuild('/sous-chemin/', json).fr).toBe(`/sous-chemin/${nomDeFichier('fr', json.fr)}`);
  });

  it('changer UNE valeur change l’URL — sinon un navigateur garderait 1 an un catalogue périmé', () => {
    const modifie: Ressources = {
      ...RESSOURCES,
      fr: { translation: { ...RESSOURCES.fr.translation, 'root.loadingPage': 'Chargement…' } },
    };

    expect(urlsBuild('/', cataloguesJson(modifie)).fr).not.toBe(urlsBuild('/', cataloguesJson(RESSOURCES)).fr);
    expect(urlsBuild('/', cataloguesJson(modifie)).en).toBe(urlsBuild('/', cataloguesJson(RESSOURCES)).en);
  });

  it('le JSON émis se relit tel quel', () => {
    const json = cataloguesJson(RESSOURCES);

    for (const langue of LANGUES) {
      expect(JSON.parse(json[langue])).toEqual(RESSOURCES[langue].translation);
    }
  });

  it('résout le module virtuel et lui seul', () => {
    const plugin = pluginPret('serve');
    const resolveId = plugin.resolveId as Hook<typeof plugin.resolveId>;

    expect(resolveId.call(plugin, ID_MODULE_VIRTUEL, undefined, {} as never)).toBe(`\0${ID_MODULE_VIRTUEL}`);
    expect(resolveId.call(plugin, './autre-chose', undefined, {} as never)).toBeUndefined();
  });

  it('en dev, les URL pointent sur le middleware ; au build, sur les assets empreintés', async () => {
    const dev = await charger(pluginPret('serve'), `\0${ID_MODULE_VIRTUEL}`);
    expect(dev).toBe(codeDuModuleVirtuel(urlsDev('/')));
    expect(dev).toContain(`${PREFIXE_DEV}fr.json`);

    const build = await charger(pluginPret('build'), `\0${ID_MODULE_VIRTUEL}`);
    expect(build).toBe(codeDuModuleVirtuel(urlsBuild('/', cataloguesJson(RESSOURCES))));
    expect(build).toContain('/assets/catalogue-fr-');
    expect(build).not.toContain(PREFIXE_DEV);

    expect(await charger(pluginPret('build'), 'un-autre-module.ts')).toBeUndefined();
  });

  it('le build CLIENT émet les quatre JSON aux noms exacts que le module virtuel annonce', async () => {
    const plugin = pluginPret('build');
    const emis: Array<{ fileName: string; source: string }> = [];
    const generateBundle = plugin.generateBundle as Hook<typeof plugin.generateBundle>;

    await generateBundle.call(
      { emitFile: (f: { fileName: string; source: string }) => emis.push(f) },
      {} as never,
      {} as never,
      false,
    );

    const urls = urlsBuild('/', cataloguesJson(RESSOURCES));

    expect(emis.map((f) => `/${f.fileName}`).sort()).toEqual(Object.values(urls).sort());
    expect(JSON.parse(emis.find((f) => f.fileName.includes('-fr-'))!.source)).toEqual(RESSOURCES.fr.translation);
  });

  it('le build SSR n’émet RIEN — il ne fait que nommer, sinon deux fichiers se disputeraient le même nom', async () => {
    const plugin = pluginPret('build', true);
    const emis: unknown[] = [];
    const generateBundle = plugin.generateBundle as Hook<typeof plugin.generateBundle>;

    await generateBundle.call({ emitFile: (f: unknown) => emis.push(f) }, {} as never, {} as never, false);

    expect(emis).toHaveLength(0);
    expect(await charger(plugin, `\0${ID_MODULE_VIRTUEL}`)).toContain('/assets/catalogue-fr-');
  });

  it('n’évalue les catalogues qu’UNE fois par build, quel que soit le nombre de hooks', async () => {
    let evaluations = 0;

    const plugin = cataloguesI18nPlugin({
      evaluer: () => {
        evaluations += 1;
        return Promise.resolve(RESSOURCES);
      },
    });

    const configResolved = plugin.configResolved as Hook<typeof plugin.configResolved>;
    configResolved.call(plugin, { command: 'build', base: '/', build: { ssr: false } } as never);

    await charger(plugin, `\0${ID_MODULE_VIRTUEL}`);
    await charger(plugin, `\0${ID_MODULE_VIRTUEL}`);

    const generateBundle = plugin.generateBundle as Hook<typeof plugin.generateBundle>;
    await generateBundle.call({ emitFile: () => undefined }, {} as never, {} as never, false);

    expect(evaluations).toBe(1);
  });
});

/**
 * Le renderer Electron passe par SA propre config Vite (`vite-electron.config.ts`,
 * script `electron:build:renderer`). Mesuré sur le job « linux desktop build » de
 * la PR #535 : sans le plugin, Rollup refuse `virtual:catalogues-i18n` et le
 * build de bureau tombe. Toute config qui construit `app/` doit porter le plugin.
 */
describe('chaque config Vite qui construit app/ porte le plugin', () => {
  it.each(['vite.config.ts', 'vite-electron.config.ts'])('%s', (nom) => {
    const code = readFileSync(join(process.cwd(), nom), 'utf8');

    expect(code).toContain("from './build-config/catalogues-i18n-plugin'");
    expect(code).toContain('cataloguesI18nPlugin(),');

    // Règle 14 : la config doit bien construire app/ (elle charge le plugin React Router).
    expect(code).toContain('reactRouter()');
  });
});

/**
 * `services/screenshotter` lance `vitest --run` sans config propre et hérite de
 * `vite.config.ts` : un chemin de setup RELATIF y est résolu depuis le dossier
 * du paquet et « n'existe pas » (mesuré sur « Install, test, build, scan »,
 * PR #535, tête `e135688d`). Les chemins doivent être absolus, et le setup
 * réservé à la racine du dépôt.
 */
describe('le setup vitest des catalogues survit à un paquet sans config propre', () => {
  const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

  it('résout les fichiers de setup en absolu, depuis le dossier de la config', () => {
    expect(config).toContain("globalSetup: [join(RACINE_DU_DEPOT, 'app/lib/i18n/catalogues-vitest.global.ts')]");
    expect(config).toContain("setupFiles: [join(RACINE_DU_DEPOT, 'app/lib/i18n/catalogues-pour-vitest.ts')]");
    expect(config).not.toMatch(/(?:globalSetup|setupFiles): \['\.\//);
    expect(config).toContain('dirname(fileURLToPath(import.meta.url))');
  });

  it('ne les applique qu’à la racine du dépôt — un paquet de services/ n’a ni `~/` ni catalogues', () => {
    expect(config).toContain('normalizePath(process.cwd()) === normalizePath(RACINE_DU_DEPOT)');
    expect(config).toContain('...SETUP_I18N_VITEST,');
  });
});
