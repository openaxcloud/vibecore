import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Fournisseurs d'IA dans la console d'administration — LECTURE SEULE.
 *
 * Les quatre cles vivent dans le Secret Kubernetes `vibecore-platform-secrets`.
 * La console doit LIRE cette source, jamais demander une re-saisie : retaper une
 * cle la fait transiter par un presse-papiers, un journal, un transcript — et
 * cree une seconde source de verite qui diverge de la premiere.
 *
 * Ce garde-fou tient les deux invariants qui comptent :
 *   1. l'endpoint n'expose JAMAIS la valeur d'une cle ;
 *   2. il n'existe AUCUN chemin d'ecriture qui accepterait une cle saisie.
 */
const source = readFileSync(join(__dirname, 'app.ts'), 'utf8');

function blocEndpoint(): string {
  const debut = source.indexOf("app.get('/admin/providers/ai'");
  expect(debut, "l'endpoint /admin/providers/ai a disparu").toBeGreaterThan(-1);

  return source.slice(debut, debut + 900);
}

describe('console admin — fournisseurs d’IA en lecture seule', () => {
  it('les quatre fournisseurs demandes par Avi sont declares', () => {
    for (const envVar of [
      'ANTHROPIC_API_KEY',
      'XAI_API_KEY',
      'MOONSHOT_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ]) {
      expect(source, `${envVar} absent du registre`).toContain(envVar);
    }
  });

  it("l'endpoint est protege par requirePlatformAdmin", () => {
    expect(blocEndpoint()).toMatch(/requirePlatformAdmin\(request\)/);
  });

  it('la reponse ne contient JAMAIS la valeur d’une cle', () => {
    const bloc = blocEndpoint();

    /*
     * Le seul acces a la valeur passe par `empreinteCle`, qui ne rend que
     * `configured`, `length` et `last4`. Toute lecture directe de
     * `process.env[...]` rendue telle quelle serait une fuite.
     */
    expect(bloc).toMatch(/\.\.\.empreinteCle\(process\.env\[p\.envVar\]\)/);
    expect(bloc, 'une valeur brute est renvoyee').not.toMatch(/value:\s*process\.env/);
    expect(bloc, 'une cle est renvoyee telle quelle').not.toMatch(/key:\s*process\.env/);
  });

  it('empreinteCle ne rend que l’etat, la longueur et les 4 derniers caracteres', () => {
    const debut = source.indexOf('function empreinteCle(');
    expect(debut).toBeGreaterThan(-1);

    const bloc = source.slice(debut, debut + 700);

    expect(bloc).toMatch(/configured/);
    expect(bloc).toMatch(/length/);
    expect(bloc).toMatch(/slice\(-4\)/);

    // Une cle courte ne doit rien exposer du tout.
    expect(bloc).toMatch(/length >= 8 \? [^:]*slice\(-4\) : null/);
  });

  it('AUCUN chemin d’ecriture n’accepte une cle de fournisseur d’IA saisie a la main', () => {
    /*
     * C'est l'invariant central : si un POST apparait un jour sur cette route,
     * la console redeviendrait un endroit ou l'on recopie une cle.
     */
    expect(source, 'un POST /admin/providers/ai a ete ajoute').not.toContain(
      "app.post('/admin/providers/ai'",
    );
    expect(source).not.toContain("app.put('/admin/providers/ai'");
    expect(source).not.toContain("app.patch('/admin/providers/ai'");
  });
});
