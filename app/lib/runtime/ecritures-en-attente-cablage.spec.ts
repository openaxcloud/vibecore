import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA0928-RUNTIME-ID-PROJET — les SITES D'APPEL, tenus sur le code source.
 *
 * Le module sait garder et rejouer ; l'avis sait parler. Rien de cela ne sert si
 * le fournisseur ne rejoue pas au bon moment, ou si l'envoi ne consulte pas le
 * drapeau de quota. Ces trois ordres sont exactement ce qu'un réordonnancement
 * « anodin » casserait sans un seul test rouge (voir BUG-CREATE-004, règle 15).
 */

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

function position(source: string, fragment: string): number {
  const index = source.indexOf(fragment);
  expect(index, `introuvable : ${fragment}`).toBeGreaterThan(-1);

  return index;
}

describe('câblage des écritures en attente', () => {
  const fournisseur = lire('./ProjectWorkspaceProvider.tsx');

  it('le fournisseur recharge la file du projet au début du démarrage', () => {
    expect(position(fournisseur, 'definirProjetCourant(projectId)')).toBeLessThan(
      position(fournisseur, 'await runtime.boot()'),
    );
  });

  it('le rejeu vient APRÈS le reseed (sinon il est effacé) et AVANT l’aperçu', () => {
    const rejeu = position(fournisseur, 'await rejouerDansLeWorkspace(projectId, runtime)');

    expect(rejeu).toBeGreaterThan(position(fournisseur, 'await reseedWorkspacePreservingOnFailure('));
    expect(rejeu).toBeGreaterThan(position(fournisseur, "await workbenchStore.loadRuntimeFiles('.')"));
    expect(rejeu).toBeLessThan(position(fournisseur, 'void workbenchStore.startPreviewServer()'));
  });

  it('un démarrage refusé pour quota lève le drapeau que l’envoi consulte', () => {
    const echec = position(fournisseur, "console.error('Workspace start failed:', error)");

    expect(position(fournisseur, 'demarrageRefusePourQuotaStore.set(isWorkspaceQuotaError(error))')).toBeGreaterThan(
      echec,
    );
  });

  it('l’envoi à l’agent consulte le drapeau AVANT de lancer quoi que ce soit', () => {
    const chat = lire('../../components/chat/Chat.client.tsx');
    const envoi = position(chat, 'const sendMessage = async (');
    const garde = position(chat, 'if (projectIdeMode && demarrageRefusePourQuotaStore.get())');

    expect(garde).toBeGreaterThan(envoi);
    expect(garde).toBeLessThan(position(chat.slice(envoi), 'runAnimation();') + envoi);
  });

  it('l’avis est monté au-dessus du composeur de l’IDE', () => {
    const baseChat = lire('../../components/chat/BaseChat.tsx');

    expect(position(baseChat, '{projectIdeMode && <AvisEcrituresEnAttente />}')).toBeLessThan(
      position(baseChat, '<ChatBox'),
    );
  });
});
