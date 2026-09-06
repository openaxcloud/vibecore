import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * DEUX MÉCANISMES, tenus séparément.
 *
 * 1. LE DOUBLE DE TEST était infidèle. TypeScript ne signale rien quand un
 *    double déclare MOINS de paramètres que son interface : une méthode à un
 *    paramètre reste assignable à une signature à deux. `countDeployments` du
 *    double ignorait donc `since`, et rendait un total À VIE.
 *
 *    Conséquence : tout test du quota écrit contre lui était VERT quel que soit
 *    le comportement de production.
 *
 * 2. LE SITE D'APPEL doit transmettre la borne de période. C'est lui le
 *    mécanisme qui se défait : le vrai magasin peut être parfait et l'appelant
 *    oublier `periodStart`. Le commentaire du magasin nomme le défaut — sans
 *    `since`, « un total monotone à vie qui finit par verrouiller tous les
 *    déploiements ».
 *
 * Les deux sont ancrés sur du CODE, pas sur de la prose : réécrire un
 * commentaire ne fait passer aucun de ces tests au vert.
 */
const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), 'utf8');

describe('quota de déploiements — comptage par période', () => {
  it('LE DOUBLE accepte une borne de période, comme son interface', () => {
    const double = lire('src/tests/test-api-store.ts');
    const signature = double.match(/async countDeployments\(([^)]*)\)/)?.[1] ?? '';

    expect(signature, 'sans `since`, le double jette silencieusement l’argument').toContain('since');
  });

  it('LE DOUBLE écarte les constructions ratées, comme le vrai magasin', () => {
    const double = lire('src/tests/test-api-store.ts');
    const corps = double.slice(double.indexOf('async countDeployments('));
    const bloc = corps.slice(0, corps.indexOf('\n  async ', 10));

    expect(bloc, 'FAILED ne consomme pas de quota').toContain('FAILED');
    expect(bloc, 'CANCELED non plus').toContain('CANCELED');
  });

  it('L’INTERFACE et le VRAI MAGASIN s’accordent sur la borne', () => {
    expect(lire('src/store.ts')).toMatch(/countDeployments\(organizationId: string, since\?: Date\)/);
    expect(lire('src/prisma-store.ts')).toMatch(/async countDeployments\(organizationId: string, since\?: Date\)/);
  });

  /*
   * LE SITE D'APPEL. C'est le test qui manquait : rien ne tenait le fait que
   * `app.ts` transmette la borne. Le retirer reproduirait exactement le défaut
   * décrit par le magasin, sans qu'aucun test ne rougisse.
   */
  it('LE SITE D’APPEL transmet la borne de période', () => {
    const app = lire('src/app.ts');

    expect(app, 'la borne doit être résolue').toContain('const periodStart = await resolveUsagePeriodStart(organizationId);');
    expect(app, 'et TRANSMISE au comptage').toContain('store.countDeployments(organizationId, periodStart)');
  });

  /*
   * Le contraste avec les instantanés est délibéré et vérifié : `countSnapshots`
   * ne prend PAS de borne — interface, magasin et site d'appel s'accordent —
   * parce que c'est un plafond à vie assumé. Ce test empêche qu'on « aligne »
   * les deux par symétrie apparente sans décision.
   */
  it('les instantanés restent SANS borne — asymétrie voulue, pas oubli', () => {
    expect(lire('src/store.ts')).toMatch(/countSnapshots\(organizationId: string\): Promise<number>/);
  });
});
