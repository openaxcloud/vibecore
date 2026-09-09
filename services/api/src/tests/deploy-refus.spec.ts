import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { laverDetailDeRefus, refusalDetail } from '../deploy-refus.js';

/*
 * BUG-DEPLOY-STATIC-FAIL-001 — deux exigences qui tirent en sens opposé, et la
 * garde tient les deux :
 *
 *   - DIRE pourquoi le déploiement n'a pas démarré (règle 13 : ne jamais
 *     masquer la sortie d'erreur de la commande dont on lit le résultat) ;
 *   - NE PAS DIRE la valeur d'un secret (règle 12), alors même que les erreurs
 *     d'infrastructure transportent des URL signées.
 */

describe('le détail d’un refus dit quelque chose', () => {
  it('nomme le code et le statut, pas seulement le message', () => {
    const erreur = Object.assign(new Error('workspace not ready'), { code: 'WS_NOT_READY', statusCode: 503 });

    expect(refusalDetail(erreur)).toBe('WS_NOT_READY — HTTP 503 — workspace not ready');
  });

  it('accepte une chaîne, un objet porteur de message, et n’invente rien sur `null`', () => {
    expect(refusalDetail('connect ECONNREFUSED')).toBe('connect ECONNREFUSED');
    expect(refusalDetail({ message: 'agent gone' })).toBe('agent gone');
    expect(refusalDetail(null)).toBe('');
    expect(refusalDetail(undefined)).toBe('');
  });

  it('tient sur une ligne : un journal ne se noie pas dans une pile', () => {
    const long = refusalDetail(new Error('build step failed '.repeat(400)));

    expect(long.length).toBeLessThanOrEqual(241);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('et il ne dit JAMAIS un secret', () => {
  /*
   * Chaque cas vient d'une forme réelle d'erreur d'infrastructure. On vérifie
   * l'ABSENCE de la valeur, jamais sa présence — c'est la seule assertion qui
   * ne fasse pas fuir ce qu'elle mesure.
   */
  const SECRET = 'sk-live-4f9a2c7e18b640d3ae5f0c9127384bde';

  it('efface la chaîne de requête d’une URL, où voyagent les jetons', () => {
    const lave = laverDetailDeRefus(`fetch failed: https://agent.internal/build?token=${SECRET}&ttl=60`);

    expect(lave).not.toContain(SECRET);
    expect(lave).toContain('https://agent.internal/build');
  });

  it('efface un en-tête `Bearer`', () => {
    const lave = laverDetailDeRefus(`401 on Authorization: Bearer ${SECRET}`);

    expect(lave).not.toContain(SECRET);
    expect(lave).toContain('401');
  });

  it('efface toute suite assez longue pour ÊTRE un jeton, même sans étiquette', () => {
    const lave = laverDetailDeRefus(`handshake rejected (${SECRET})`);

    expect(lave).not.toContain(SECRET);
    expect(lave).toContain('handshake rejected');
  });

  it('laisse intact ce qui n’est pas un secret — sinon le détail ne sert plus à rien', () => {
    expect(laverDetailDeRefus('connect ECONNREFUSED 10.4.2.11:8080')).toBe('connect ECONNREFUSED 10.4.2.11:8080');
    expect(laverDetailDeRefus('AGENT_UNREACHABLE')).toBe('AGENT_UNREACHABLE');
  });

  it('passe aussi par `refusalDetail`, pas seulement par le laveur', () => {
    const erreur = Object.assign(new Error(`GET https://agent.internal/x?sig=${SECRET} failed`), { statusCode: 502 });

    expect(refusalDetail(erreur)).not.toContain(SECRET);
    expect(refusalDetail(erreur)).toContain('HTTP 502');
  });
});

/*
 * La garde qui empêche le silence de revenir.
 *
 * Le défaut n'était pas une ligne : c'était CINQ retours nus au même endroit,
 * tous repliés en un seul message par l'appelant. Corriger les cinq ne protège
 * de rien si le sixième s'écrit demain sans code. On lit donc la source (règle
 * 5 : commentaires retirés) et on refuse tout `{ handled: false }` muet.
 */
describe('aucun abandon muet dans le seam de build en pod', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'src/app.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  const debut = SOURCE.indexOf('const realBuildStaticInWorkspacePod');
  const fin = SOURCE.indexOf('const buildStaticInWorkspacePod =', debut);
  const SEAM = debut === -1 || fin === -1 ? '' : SOURCE.slice(debut, fin);

  const abandons = [...SEAM.matchAll(/return \{ handled: false[^}]*\}/gu)].map((m) => m[0]);

  it('le seam a bien été lu — sinon ce bloc ne mesure rien', () => {
    // Contrôle positif (règle 14) : cinq points d'abandon connus au moment d'écrire.
    expect(debut, 'realBuildStaticInWorkspacePod introuvable').toBeGreaterThan(0);
    expect(abandons.length, 'les abandons ont disparu de la lecture').toBeGreaterThanOrEqual(5);
  });

  it('chaque abandon dit POURQUOI', () => {
    const muets = abandons.filter((abandon) => !abandon.includes('refusal:'));

    expect(muets).toEqual([]);
  });

  /*
   * On ne bannit pas TOUT `catch {}` : la sonde de fichier de verrouillage en
   * contient un légitime, où l'absence EST le résultat lu, pas une erreur
   * masquée. La règle 13 vise la commande dont on lit le résultat — ici, celle
   * qui décide d'abandonner. Un `catch` qui renonce doit dire pourquoi.
   */
  it('aucun `catch` muet ne décide d’un abandon', () => {
    const muets = [...SEAM.matchAll(/\}\s*catch\s*\{[\s\S]{0,400}?return \{ handled: false/gu)].map((m) => m[0]);

    expect(muets).toEqual([]);
  });
});
