import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { etatDeConnexionBarre } from './connexion-barre-etat';

/*
 * BUG-QA0928-COSMETIQUES, point 3 — la barre d'état affichait « Connected » en
 * vert, infobulle « Workspace connection healthy », juste à côté de « Workspace
 * Error — The workspace could not be started. ». Reproduit le 30/09 sur la pile
 * locale réelle (mode remote-kubernetes, quota gratuit plein) :
 * `docs/bugs/qa-2026-09-28/repro-barre-etat-connexion.mjs`.
 *
 * La pastille n'avait que trois issues ; un workspace en erreur tombait dans la
 * dernière, « connecté ».
 */

const base = { enLigne: true, chargement: false, statutWorkspace: undefined, etatRuntime: 'running' };

describe('pastille de connexion de la barre d’état', () => {
  it('un workspace en erreur ne s’annonce jamais « connecté »', () => {
    expect(etatDeConnexionBarre({ ...base, etatRuntime: 'error' })).toBe('error');
    expect(etatDeConnexionBarre({ ...base, statutWorkspace: 'FAILED', etatRuntime: 'error' })).toBe('error');
  });

  it('l’erreur l’emporte sur un statut « starting » resté en place — comme dans `workspaceUiState`', () => {
    expect(etatDeConnexionBarre({ ...base, statutWorkspace: 'STARTING', etatRuntime: 'error' })).toBe('error');
  });

  it('hors ligne reste prioritaire : le navigateur ne joint plus rien du tout', () => {
    expect(etatDeConnexionBarre({ ...base, enLigne: false, etatRuntime: 'error' })).toBe('offline');
  });

  it('les trois issues d’avant sont inchangées', () => {
    expect(etatDeConnexionBarre({ ...base, enLigne: false })).toBe('offline');
    expect(etatDeConnexionBarre({ ...base, chargement: true, etatRuntime: 'starting' })).toBe('reconnecting');
    expect(etatDeConnexionBarre({ ...base, statutWorkspace: 'PENDING', etatRuntime: 'starting' })).toBe('reconnecting');
    expect(etatDeConnexionBarre(base)).toBe('connected');
  });

  it('BaseChat décide avec CETTE fonction, nourrie de l’état runtime qui porte l’erreur', () => {
    const source = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');

    expect(source).toMatch(/etatDeConnexionBarre\(\{[^}]*etatRuntime:\s*runtimeUiState/su);
  });
});
