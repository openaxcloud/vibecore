import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { supprimerFichiersDuProjet } from '../project-storage.js';
import { PROJECT_EXTERNAL_RESOURCES, teardownProjectExternalResources } from '../project-teardown.js';

/*
 * TROIS FAMILLES QUE LE DÉMONTAGE NE COUVRAIT PAS.
 *
 * Mesuré le 2026-09-07 en démontant à la main, sur la production, ce que le
 * produit aurait laissé derrière lui :
 *
 *   5 volumes de workspace .......... 500 Gi
 *   28 déploiements + 30 services ... applications publiées
 *   428 arbres de fichiers + 208 charges d'instantanés ... 2,1 Go
 *
 * Aucune n'était un démontage MANQUANT : `deleteWorkspace` supprime déjà le PVC,
 * `stopServerApp` supprime déjà Ingress/Service/Deployment/Secret, et les
 * fichiers se suppriment avec `rm`. Ils n'étaient simplement JAMAIS APPELÉS à la
 * suppression d'un projet — la forme exacte d'AUDX-171.
 *
 * Ces tests tiennent donc l'APPEL, pas la capacité. Et les gardes de forme, qui
 * sont la seule protection contre la faute pire que le trou : détruire la
 * mauvaise ressource.
 */

const cible = (extra: Record<string, unknown> = {}) => ({
  id: 'cmtprojet0000000000000000',
  organizationId: 'cmtorg00000000000000000000',
  ...extra,
});

describe('les trois capacités sont APPELÉES, avec la poignée lue sur la ligne', () => {
  it('chaque workspace du projet est démonté, par son identifiant', async () => {
    const demonterWorkspace = vi.fn(async () => undefined);

    const rapport = await teardownProjectExternalResources(
      { demonterWorkspace },
      cible({ workspaceIds: ['ws-0440d49cd8f7ddc9', 'ws-08b0fcc48b1fa5af'] }),
    );

    expect(demonterWorkspace).toHaveBeenCalledTimes(2);
    expect(demonterWorkspace).toHaveBeenCalledWith('ws-0440d49cd8f7ddc9');
    expect(rapport.complete).toBe(true);
  });

  it('chaque application publiée est démontée, par son identifiant', async () => {
    const demonterApplicationPubliee = vi.fn(async () => undefined);

    await teardownProjectExternalResources(
      { demonterApplicationPubliee },
      cible({ deploymentIds: ['cmrk2otiz000a0mcgcr0eu6lx'] }),
    );

    expect(demonterApplicationPubliee).toHaveBeenCalledWith('cmrk2otiz000a0mcgcr0eu6lx');
  });

  it('les fichiers du projet sont supprimés, par l’identifiant du projet', async () => {
    const supprimer = vi.fn(async () => undefined);

    await teardownProjectExternalResources({ supprimerFichiersDuProjet: supprimer }, cible());

    expect(supprimer).toHaveBeenCalledWith('cmtprojet0000000000000000');
  });

  it('l’inventaire couvre les CINQ familles', () => {
    /*
     * Épingle la liste : un ajout ou un retrait silencieux casse ce test au lieu
     * de passer inaperçu. C'est ainsi qu'on a découvert que le volume rapportait
     * `removed: true` sans rien toucher.
     */
    expect(PROJECT_EXTERNAL_RESOURCES.map((r) => r.id)).toEqual([
      'database',
      'object-storage-bucket',
      'workspace-runtime',
      'published-app',
      'project-files',
    ]);
  });
});

describe('les gardes de forme — détruire la mauvaise ressource est pire que le trou', () => {
  it('un identifiant de workspace hors motif fait ÉCHOUER, il ne tente rien', async () => {
    const demonterWorkspace = vi.fn(async () => undefined);

    const rapport = await teardownProjectExternalResources(
      { demonterWorkspace },
      cible({ workspaceIds: ['pas-un-workspace'] }),
    );

    expect(demonterWorkspace).not.toHaveBeenCalled();
    expect(rapport.complete).toBe(false);
    expect(rapport.failed).toContain('workspace-runtime');
  });

  it('un identifiant vide aussi', async () => {
    const demonterWorkspace = vi.fn(async () => undefined);

    const rapport = await teardownProjectExternalResources({ demonterWorkspace }, cible({ workspaceIds: [''] }));

    expect(demonterWorkspace).not.toHaveBeenCalled();
    expect(rapport.failed).toContain('workspace-runtime');
  });

  it('un identifiant de déploiement hors motif fait ÉCHOUER', async () => {
    const demonterApplicationPubliee = vi.fn(async () => undefined);

    const rapport = await teardownProjectExternalResources(
      { demonterApplicationPubliee },
      cible({ deploymentIds: ['../evasion'] }),
    );

    expect(demonterApplicationPubliee).not.toHaveBeenCalled();
    expect(rapport.failed).toContain('published-app');
  });

  it('un échec de démontage est RAPPORTÉ, pas avalé', async () => {
    const demonterWorkspace = vi.fn(async () => {
      throw new Error('le manager est injoignable');
    });

    const rapport = await teardownProjectExternalResources(
      { demonterWorkspace },
      cible({ workspaceIds: ['ws-0440d49cd8f7ddc9'] }),
    );

    expect(rapport.failed).toContain('workspace-runtime');
    expect(rapport.outcomes.find((o) => o.resource === 'workspace-runtime')?.error).toMatch(/injoignable/);
  });

  it('un projet SANS workspace ni déploiement ne tente rien et ne rougit pas', async () => {
    /*
     * La contre-épreuve dans l'autre sens : la majorité des projets n'ont aucune
     * ressource vive. Faire échouer leur suppression serait un défaut pire que
     * celui qu'on corrige.
     */
    const demonterWorkspace = vi.fn(async () => undefined);
    const demonterApplicationPubliee = vi.fn(async () => undefined);

    const rapport = await teardownProjectExternalResources({ demonterWorkspace, demonterApplicationPubliee }, cible());

    expect(demonterWorkspace).not.toHaveBeenCalled();
    expect(demonterApplicationPubliee).not.toHaveBeenCalled();
    expect(rapport.complete).toBe(true);
  });
});

describe('la suppression des fichiers, sur un vrai arbre', () => {
  let racine = '';
  let avant: string | undefined;

  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), 'trous-'));
    avant = process.env.PROJECT_STORAGE_DIR;
    process.env.PROJECT_STORAGE_DIR = racine;
  });

  afterEach(() => {
    rmSync(racine, { recursive: true, force: true });

    if (avant === undefined) {
      delete process.env.PROJECT_STORAGE_DIR;
    } else {
      process.env.PROJECT_STORAGE_DIR = avant;
    }
  });

  it('supprime l’arbre du projet ET ses archives d’instantanés', async () => {
    /*
     * Les deux arbres, parce que les instantanés ne vivent PAS sous le projet :
     * c'est ce qui laissait 825 Mo derrière chaque suppression.
     */
    const id = 'cmtprojet0000000000000000';
    mkdirSync(join(racine, id, 'src'), { recursive: true });
    writeFileSync(join(racine, id, 'src', 'App.tsx'), 'x');
    mkdirSync(join(racine, '_objects', 'snapshots', id), { recursive: true });
    writeFileSync(join(racine, '_objects', 'snapshots', id, 'a.zip'), 'x');

    await supprimerFichiersDuProjet(id);

    expect(existsSync(join(racine, id))).toBe(false);
    expect(existsSync(join(racine, '_objects', 'snapshots', id))).toBe(false);
  });

  it('ne touche PAS le voisin', async () => {
    const id = 'cmtprojet0000000000000000';
    const voisin = 'cmtvoisin0000000000000000';
    mkdirSync(join(racine, id), { recursive: true });
    mkdirSync(join(racine, voisin), { recursive: true });

    await supprimerFichiersDuProjet(id);

    expect(existsSync(join(racine, voisin))).toBe(true);
  });

  it('REFUSE un identifiant hors motif plutôt que de supprimer', async () => {
    /*
     * `..` sous la racine partagée effacerait les fichiers de TOUS les projets.
     * On lève, on ne tente pas.
     */
    for (const mauvais of ['', '..', '../..', 'a/b']) {
      await expect(supprimerFichiersDuProjet(mauvais)).rejects.toThrow(/hors motif/);
    }
  });

  it('est idempotent : un projet déjà parti ne fait pas échouer', async () => {
    await expect(supprimerFichiersDuProjet('cmtjamaiscree00000000000')).resolves.toBeUndefined();
  });
});
