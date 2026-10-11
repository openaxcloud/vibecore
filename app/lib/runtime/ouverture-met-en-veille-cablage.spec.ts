import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Décision d'Avi du 2026-10-11 : ouvrir un second projet met l'autre espace d'un
 * client gratuit en veille. L'API ne le fait que sur l'INTENTION d'ouverture
 * (`metadata.ouverture`), jamais sur l'auto-réparation d'un onglet resté ouvert —
 * sinon deux onglets sur deux projets s'endormiraient l'un l'autre en boucle
 * (épinglé côté API par services/api/src/tests/ouverture-met-en-veille.spec.ts).
 *
 * Ces deux sites d'appel sont exactement ce qu'un nettoyage « anodin » casserait
 * sans un seul test rouge (règle 15) : retirer le drapeau du montage rendrait la
 * mise en veille inopérante ; l'ajouter à l'auto-réparation ramènerait le ping-pong.
 */

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

describe('câblage de l’ouverture qui met l’autre espace en veille', () => {
  const fournisseur = lire('./ProjectWorkspaceProvider.tsx');
  const adaptateur = lire('../../../packages/runtime-remote/src/index.ts');

  it('le montage de l’IDE démarre l’espace AVEC l’intention d’ouverture', () => {
    expect(fournisseur).toMatch(
      /runtime\.startWorkspace\(\{\s*id: sessionId,\s*metadata: \{ projectId, workspaceId, ouverture: true \},\s*\}\)/,
    );
  });

  it('il mentionne le projet mis en veille, discrètement, dans le journal de l’espace', () => {
    const demarrage = fournisseur.indexOf('runtime.startWorkspace({');
    const mention = fournisseur.indexOf("clientStoresServicesText('clientRuntime.workspace.otherProjectSlept'");

    expect(demarrage).toBeGreaterThan(-1);
    expect(mention).toBeGreaterThan(demarrage);
    expect(fournisseur.slice(demarrage, mention)).toContain('workbenchStore.appendWorkspaceLog(');
  });

  it('l’auto-réparation de l’adaptateur redémarre SANS intention d’ouverture', () => {
    // Contrôle positif : la mesure trouve bien l'appel d'auto-réparation.
    expect(adaptateur).toContain('this.#reprovisionPromise = this.startWorkspace({ id: this.#workspaceId })');
    expect(adaptateur).not.toMatch(/ouverture\s*:/);
  });
});
