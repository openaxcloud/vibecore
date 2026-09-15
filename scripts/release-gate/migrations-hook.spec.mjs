import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * Le hook de migration Prisma doit ÉCHOUER VITE ET PARLER quand il bloque.
 *
 * Mesuré le 2026-09-04, run 1453 : premier rollout portant la migration 0086,
 * `helm upgrade --atomic --timeout 10m` en « context deadline exceeded »,
 * rollback automatique, et rien à lire — le hook avait le même délai (600 s)
 * que Helm, donc les deux expiraient ensemble et le rollback emportait le Job.
 * Un `ALTER TABLE` qui attend un verrou tenu ailleurs (transaction d'import
 * ouverte, session « idle in transaction ») attend sans limite.
 *
 * Mesuré en local : avec `lock_timeout` passé par le paramètre `options` de
 * l'URL, `prisma migrate deploy` échoue en 7 s sur l'erreur Postgres 55P03
 * (« canceling statement due to lock timeout ») au lieu de bloquer.
 */

const RACINE = join(new URL('.', import.meta.url).pathname, '..', '..');
const GABARIT = readFileSync(join(RACINE, 'infra/helm/platform/templates/migrations-job.yaml'), 'utf8');

/** Le YAML du Job, les directives Helm neutralisées. */
function job() {
  const texte = GABARIT.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, '')
    .replace(/^\{\{-?[^}]*-?\}\}\s*$/gm, '')
    .replace(/\{\{[^}]*\}\}/g, 'X');

  return parse(texte);
}

const HELM_TIMEOUT_SECONDES = 600;

describe('hook de migration Prisma', () => {
  it('expire AVANT Helm, pour que l’échec soit le sien et qu’il reste lisible', () => {
    const delai = job().spec.activeDeadlineSeconds;

    expect(delai).toBeGreaterThan(0);
    expect(delai).toBeLessThan(HELM_TIMEOUT_SECONDES);
  });

  it('pose un lock_timeout sur la connexion de migration, quelle que soit la forme de l’URL', () => {
    const script = job().spec.template.spec.containers[0].command.at(-1);
    const reecriture = script.match(/case "\$DATABASE_URL" in[\s\S]*?export DATABASE_URL/)?.[0];

    expect(reecriture, 'la réécriture de DATABASE_URL est introuvable dans le hook').toBeDefined();

    // Exécutée telle quelle, sur des URL factices : aucun secret n'est en jeu.
    const resultat = (url) =>
      spawnSync('sh', ['-c', `${reecriture}; printf '%s' "$DATABASE_URL"`], {
        encoding: 'utf8',
        env: { DATABASE_URL: url, PATH: process.env.PATH },
      }).stdout;

    expect(resultat('postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db?options=-c%20lock_timeout%3D60000');
    expect(resultat('postgresql://u:p@h/db?sslmode=require')).toBe(
      'postgresql://u:p@h/db?sslmode=require&options=-c%20lock_timeout%3D60000',
    );

    // Une URL qui porte déjà ses options n'est pas touchée.
    expect(resultat('postgresql://u:p@h/db?options=-c%20x')).toBe('postgresql://u:p@h/db?options=-c%20x');
  });

  it('n’affiche jamais l’URL : elle porte le mot de passe', () => {
    const script = job().spec.template.spec.containers[0].command.at(-1);

    expect(script).not.toMatch(/echo[^\n]*\$DATABASE_URL/);
    expect(script).not.toMatch(/echo[^\n]*\$\{DATABASE_URL/);
  });
});
