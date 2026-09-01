import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-RUNTIME-GC-DORMANT-001 — l'enonce « le ramasse-miettes ne tourne pas »
 * s'est revele FAUX a la contre-mesure : `workspace.gc` termine toutes les 15
 * minutes dans BullMQ. Mais la crainte sous-jacente est reelle et deja vue :
 * une CronJob suspendue, ou disparue du chart, eteint une tache de fond en
 * silence — personne ne recoit d'erreur, il ne se passe simplement plus rien.
 *
 * Regle 15 : ce qui a ete verifie une fois doit etre tenu. Ce garde-fou
 * epingle la presence des taches de fond et l'interdiction de les livrer
 * suspendues.
 */
const dossier = join(process.cwd(), 'infra/helm/platform/templates');
const fichiers = readdirSync(dossier).filter((n) => /cron/i.test(n) && /\.ya?ml$/.test(n));
const source = fichiers.map((n) => readFileSync(join(dossier, n), 'utf8')).join('\n---\n');

/*
 * Les taches dont l'absence est silencieuse, designees par leur NOM DE JOB —
 * c'est ce que le worker depile, et ce qui apparait dans BullMQ. Toutes
 * mesurees actives en production le 2026-09-01.
 */
const TACHES_ATTENDUES = [
  'workspace.gc',
  'inactivity.gc',
  'deploy.reap',
  'metering.objectStorage',
  'database.maintenance',
  'retention.enforce',
];

describe('BUG-RUNTIME-GC-DORMANT-001 — les taches de fond restent declarees et actives', () => {
  it('le chart declare bien des CronJobs', () => {
    expect(fichiers.length, 'aucun gabarit de CronJob trouve — la recherche a-t-elle fonctionne ?').toBeGreaterThan(0);
    expect(source).toMatch(/kind:\s*CronJob/);
  });

  it.each(TACHES_ATTENDUES)('la tache %s est declaree', (nom) => {
    expect(source).toContain(nom);
  });

  it('aucune tache n’est livree SUSPENDUE ni desactivee par defaut', () => {
    /*
     * Une tache eteinte n'emet AUCUNE erreur : il ne se passe simplement plus
     * rien. C'est exactement la panne silencieuse que le point decrivait, et la
     * raison pour laquelle une preuve live ne suffit pas a le fermer.
     */
    expect(source).not.toMatch(/suspend:\s*true/);
    expect(source, 'une tache est livree "enabled" false').not.toMatch(/"enabled"\s+false/);
  });
});
