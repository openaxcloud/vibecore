/*
 * BUG-SEC-004 — une exception de sécurité sans date n'expire jamais, et une
 * exception à date fixe sans avertissement ferme la chaîne du jour au
 * lendemain. Le 2026-09-03, trois exceptions globales ont échu ensemble : la
 * porte a refusé les 8 images d'un coup, 36 heures sans aucune livraison.
 *
 * Garde de SOURCE (espèce annoncée) : elle vérifie les déclarations, pas le
 * comportement de Trivy. La preuve reste le scan lui-même.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function fichiersDException() {
  return readdirSync(RACINE).filter((n) => n === '.trivyignore' || n.startsWith('.trivyignore.'));
}

/** Lignes de CVE actives, commentaires exclus. */
function cvesActives(fichier) {
  return readFileSync(join(RACINE, fichier), 'utf8')
    .split('\n')
    .filter((l) => /^CVE-/.test(l));
}

describe('exceptions de sécurité — datées et annoncées', () => {
  it('1. toute exception active porte une date d’expiration', () => {
    const fichiers = fichiersDException();

    // Témoin : sans fichier scanné, l'assertion suivante passerait à vide.
    expect(fichiers.length).toBeGreaterThan(1);

    const sansDate = [];

    for (const f of fichiers) {
      for (const ligne of cvesActives(f)) {
        if (!/\bexp:\d{4}-\d{2}-\d{2}\b/.test(ligne)) {
          sansDate.push(`${f} → ${ligne}`);
        }
      }
    }

    expect(sansDate).toEqual([]);
  });

  it('2. le fichier GLOBAL ne porte aucune exception active', () => {
    /*
     * Une exception globale couvre les 8 images à la fois : son échéance les
     * ferme toutes ensemble. C'est exactement ce qui s'est produit. Les
     * exceptions vivent désormais par image, où leur portée est bornée.
     */
    expect(cvesActives('.trivyignore')).toEqual([]);
  });

  it('3. chaque exception porte le nom EXACT d’un service du déploiement', () => {
    /*
     * Le nom du fichier doit correspondre a `${service}` tel que la boucle de
     * scan le lit dans `/tmp/services.json`. Le 2026-09-03, trois exceptions
     * etaient nommees en tirets — `ai-gateway`, `workspace-manager`,
     * `preview-proxy` — alors que les services s'appellent `aiGateway`,
     * `workspaceManager`, `previewProxy`. Elles n'ont JAMAIS ete chargees : le
     * deploiement a echoue sur ces trois images exactement, pendant que les
     * cinq autres passaient. Un fichier d'exception mal nomme est silencieux —
     * il n'echoue pas, il ne fait rien.
     */
    const SERVICES = [
      'admin',
      'aiGateway',
      'api',
      'previewProxy',
      'screenshotter',
      'web',
      'worker',
      'workspaceAgent',
      'workspaceManager',
    ];

    const inconnus = fichiersDException()
      .filter((f) => f !== '.trivyignore')
      .map((f) => f.replace('.trivyignore.', ''))
      .filter((s) => !SERVICES.includes(s));

    expect(inconnus).toEqual([]);
  });

  it('4. le déploiement avertit AVANT l’échéance', () => {
    const wf = readFileSync(join(RACINE, '.github', 'workflows', 'deploy-main.yml'), 'utf8');

    expect(wf).toMatch(/Alerte sur les exceptions de s.curit. proches de l'.ch.ance/);
    // L'avertissement doit précéder la porte, sinon il arrive après le refus.
    expect(wf.indexOf('Alerte sur les exceptions')).toBeLessThan(wf.indexOf('Vulnerability gate'));
  });
});
