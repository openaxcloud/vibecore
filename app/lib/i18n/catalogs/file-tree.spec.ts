import { describe, expect, it } from 'vitest';

import { fileTreeEn, fileTreeFr } from './file-tree';

describe('file-tree translation catalog', () => {
  it('uses the reviewed French workspace runtime terminology without changing English', () => {
    expect(fileTreeFr.empty.workspaceUnavailableDescription).toBe(
      'L’environnement d’exécution de l’espace de travail s’est arrêté ou n’a pas démarré. Reconnectez-vous pour charger les fichiers du projet.',
    );
    expect(fileTreeFr.empty.workspaceUnavailableDescription).not.toMatch(/\bruntime\b/iu);
    expect(fileTreeEn.empty.workspaceUnavailableDescription).toBe(
      'The workspace runtime stopped or failed to start. Reconnect to load your project files.',
    );
  });
});
