import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootSource = readFileSync(join(process.cwd(), 'app/root.tsx'), 'utf8');
const clientEntrySource = readFileSync(join(process.cwd(), 'app/entry.client.tsx'), 'utf8');

describe('React Router document hydration contract', () => {
  it('renders route content directly in body without the legacy root island wrapper', () => {
    expect(rootSource).toMatch(/<body[^>]*>\s*\{children\}/);
    expect(rootSource).not.toContain('id="root"');
  });

  it('hydrates the same document root that the server renders', () => {
    expect(clientEntrySource).toContain('hydrateRoot(document, <HydratedRouter />)');
  });

  it('applies the persisted theme before paint while deferring layout preferences until hydration', () => {
    const inlineThemeStart = rootSource.indexOf('const inlineThemeCode');
    const inlineThemeEnd = rootSource.indexOf('\n`;', inlineThemeStart);
    const inlineThemeSource = rootSource.slice(inlineThemeStart, inlineThemeEnd);

    expect(inlineThemeStart).toBeGreaterThan(-1);
    expect(inlineThemeEnd).toBeGreaterThan(inlineThemeStart);
    expect(inlineThemeSource.match(/setTutorialKitTheme\(\);/g)).toHaveLength(2);
    expect(inlineThemeSource.match(/markDismissedAnnouncement\(\);/g)).toHaveLength(1);
    expect(inlineThemeSource.match(/markSidebarCollapsed\(\);/g)).toHaveLength(1);
    expect(inlineThemeSource).toContain("root.setAttribute('data-ecode-theme-ready', 'true')");
    expect(inlineThemeSource).toContain("performance.mark('ecode-theme-applied')");
    expect(rootSource).toMatch(
      /useEffect\(\(\) => \{\s*document\.documentElement\.setAttribute\('data-ecode-hydrated', 'true'\);\s*window\.dispatchEvent\(new Event\('ecode:hydrated'\)\);\s*\}, \[\]\);/,
    );
  });
});

/**
 * BUG-PERF-I18N-RACINE-001 — le contrat d'hydratation avec le catalogue i18n.
 *
 * Le serveur rend les libellés traduits depuis ses ressources statiques ; le
 * navigateur ne les a plus dans son graphe JavaScript. S'il hydratait sans
 * avoir chargé le JSON de sa langue, React remplacerait chaque libellé par
 * « Unavailable ». Ces gardes tiennent l'ordre : précharger dans <head>,
 * attendre, PUIS hydrater — et hydrater quand même si le JSON manque.
 */
describe('le catalogue i18n de la langue du document', () => {
  const serverEntrySource = readFileSync(join(process.cwd(), 'app/entry.server.tsx'), 'utf8');

  it('est préchargé dans <head>, pour chaque langue ET chaque surface requise, aligné sur le fetch (mode cors)', () => {
    expect(rootSource).toContain('{languesRequises(language).flatMap((langue) =>');
    expect(rootSource).toContain('surfacesRequises(location.pathname).map((surface) => (');
    expect(rootSource).toContain('href={urlDuCatalogue(langue, surface)}');
    expect(rootSource).toContain('crossOrigin="anonymous"');
  });

  it('est attendu AVANT hydrateRoot, et l’échec n’empêche pas d’hydrater', () => {
    const attente = clientEntrySource.indexOf('chargerLesCataloguesDuDocument(lang, window.location.pathname)');
    const hydratation = clientEntrySource.indexOf('hydrateRoot(document, <HydratedRouter />)');

    expect(attente).toBeGreaterThan(-1);
    expect(hydratation).toBeGreaterThan(-1);

    // Un seul appel à hydrateRoot, enfermé dans `hydrater()` — jamais au niveau du module.
    expect(clientEntrySource.match(/hydrateRoot\(/g)).toHaveLength(1);
    expect(clientEntrySource).toContain('function hydrater()');
    expect(clientEntrySource).toMatch(/\.then\(demarrer,\s*\(erreur: unknown\) => \{[\s\S]*demarrer\(\);/);
  });

  it('est recréé côté instance si le registre change, sans divergence d’hydratation', () => {
    /*
     * BUG-PERF-I18N-SURFACE-001 : l'instantané est le JETON du registre, pas un
     * booléen. Un booléen resterait `true` à l'arrivée de la SECONDE tranche, et
     * l'instance i18next ne serait jamais recréée — les clés de la tranche
     * tardive resteraient « Unavailable » à l'écran pour de bon.
     */
    expect(rootSource).toMatch(
      /useSyncExternalStore\(\s*sabonnerAuRegistre,\s*\(\) => jetonDuRegistre\(language\),\s*\(\) => 'public,app',?\s*\)/,
    );
    expect(rootSource).toContain('createI18nInstance(language), [language, catalogueCharge]');
  });

  it('réclame les tranches manquantes à chaque navigation CLIENT — qui ne repasse pas par entry.client', () => {
    expect(rootSource).toMatch(
      /useEffect\(\(\) => \{\s*void chargerLesCataloguesDuDocument\(language, location\.pathname\)[\s\S]*?\}, \[language, location\.pathname\]\);/,
    );
  });

  it('est enregistré côté serveur au chargement du module, avant tout rendu', () => {
    const enregistrement = serverEntrySource.indexOf('enregistrerTousLesCatalogues(RESOURCES);');
    const rendu = serverEntrySource.indexOf('export default async function handleRequest');

    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(rendu);
  });
});
