import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estAbandonDeRequete, IMPORT_REQUEST_TIMEOUT_MS } from './import-delai';

/*
 * Règle 5 — ancrer sur du CODE, pas sur la prose qui l'entoure.
 */
function sansCommentaires(source: string) {
  return source
    .split('\n')
    .filter((ligne) => {
      const nu = ligne.trimStart();
      return !nu.startsWith('*') && !nu.startsWith('/*') && !nu.startsWith('//');
    })
    .join('\n');
}

const ROUTES = ['app/routes/import-github.tsx', 'app/routes/import-zip.tsx'] as const;

describe('le budget client couvre le travail réel du serveur', () => {
  /*
   * Règle 6 — les deux moitiés doivent rester couplées. Si quelqu'un rabaisse
   * ce budget sous les 120 s de `git clone`, le client se remet à raccrocher
   * avant le serveur et le message générique revient.
   */
  it('dépasse les 120 s que `git clone` s’autorise côté serveur', () => {
    expect(IMPORT_REQUEST_TIMEOUT_MS).toBeGreaterThan(120_000);
  });

  it('reste sous les 180 s de `proxy-read-timeout` de l’ingress', () => {
    /* Au-delà, c'est nginx qui coupe : un budget plus grand serait un mensonge. */
    expect(IMPORT_REQUEST_TIMEOUT_MS).toBeLessThan(180_000);
  });
});

describe('estAbandonDeRequete — un abandon n’est pas une réponse', () => {
  it('reconnaît la forme MESURÉE de `AbortSignal.timeout` (DOMException TimeoutError)', async () => {
    /*
     * On ne recopie pas la forme : on la reproduit. Un `fetch` vers un serveur
     * qui ne répond jamais, coupé par le même mécanisme que la production.
     */
    const { createServer } = await import('node:http');
    const serveur = createServer(() => {});
    await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', () => resoudre()));

    const port = (serveur.address() as { port: number }).port;

    try {
      await fetch(`http://127.0.0.1:${port}/lent`, { signal: AbortSignal.timeout(150) });
      throw new Error('le fetch aurait dû être abandonné');
    } catch (erreur) {
      expect(erreur).not.toBeInstanceOf(Response);
      expect(estAbandonDeRequete(erreur)).toBe(true);
    } finally {
      serveur.close();
    }
  });

  it('reconnaît une annulation explicite (AbortError)', () => {
    expect(estAbandonDeRequete(Object.assign(new Error('annulé'), { name: 'AbortError' }))).toBe(true);
  });

  it('ne prend PAS une réponse du serveur pour un abandon', () => {
    /* Un 504 rendu par l'API est une `Response` : il se lit par son statut. */
    expect(estAbandonDeRequete(new Response(null, { status: 504 }))).toBe(false);
    expect(estAbandonDeRequete(new Response(null, { status: 500 }))).toBe(false);
  });

  it('ne casse pas sur une erreur quelconque', () => {
    expect(estAbandonDeRequete(new Error('autre chose'))).toBe(false);
    expect(estAbandonDeRequete(undefined)).toBe(false);
    expect(estAbandonDeRequete(null)).toBe(false);
    expect(estAbandonDeRequete('une chaîne')).toBe(false);
  });
});

/*
 * LA garde du correctif (règle 15). Elle est statique et non comportementale
 * pour une raison mesurée : `apiRequest` pose TOUJOURS un signal quand la route
 * n'en passe pas — le sien, à 30 s. Une assertion « la requête part avec un
 * AbortSignal » restait donc verte après le retrait du correctif : elle ne
 * gardait rien. Ce qui distingue les deux mondes, c'est QUEL budget est posé,
 * et cela ne se lit pas sur un `AbortSignal` — mais cela se lit dans le code.
 */
describe('GARDE — les deux routes d’import posent le budget long', () => {
  it.each(ROUTES)('%s passe explicitement IMPORT_REQUEST_TIMEOUT_MS à apiRequest', (chemin) => {
    const code = sansCommentaires(readFileSync(join(process.cwd(), chemin), 'utf8'));

    expect(code).toContain('signal: AbortSignal.timeout(IMPORT_REQUEST_TIMEOUT_MS)');
  });

  it.each(ROUTES)('%s traite un abandon comme un délai dépassé, pas comme un échec', (chemin) => {
    const code = sansCommentaires(readFileSync(join(process.cwd(), chemin), 'utf8'));

    expect(code).toContain('estAbandonDeRequete(error)');
    expect(code).toContain("actionError('timeout'");
  });

  it('le retrait des commentaires a bien retiré quelque chose (règle 14)', () => {
    const brut = readFileSync(join(process.cwd(), ROUTES[0]), 'utf8');

    expect(brut.length).toBeGreaterThan(sansCommentaires(brut).length);
  });
});
