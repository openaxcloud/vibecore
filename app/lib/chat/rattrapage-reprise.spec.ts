import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  contenuARattraper,
  estUneCoupureReseau,
  identifiantServeurDuMessage,
  planDeRattrapage,
  rattrapageEncoreOuvert,
  RATTRAPAGE_DUREE_MAX_MS,
  sansReflexion,
} from './rattrapage-reprise';

const REFLEXION = (texte: string) => `<div class="__boltThought__">${texte}</div>\n`;

describe("l'identifiant serveur d'un message", () => {
  it("suit la règle de l'API : aimsg_ + 32 hex du SHA-256 de <conversation>:<clientId>", async () => {
    const attendu = `aimsg_${createHash('sha256').update('conv-1:msg-abc').digest('hex').slice(0, 32)}`;

    expect(await identifiantServeurDuMessage('conv-1', 'msg-abc')).toBe(attendu);
  });

  it('garde tel quel un identifiant déjà serveur', async () => {
    expect(await identifiantServeurDuMessage('conv-1', 'aimsg_0123')).toBe('aimsg_0123');
  });

  it("l'API calcule toujours son identifiant de la même façon (sinon le rattrapage chercherait sous un nom que personne n'écrit)", () => {
    const source = readFileSync('services/api/src/app.ts', 'utf8');

    expect(source).toContain(
      "return `aimsg_${createHash('sha256').update(`${conversationId}:${clientId}`).digest('hex').slice(0, 32)}`;",
    );
    expect(source).toMatch(/if \(existingIds\.has\(clientId\)\) \{\s*return clientId;/);
  });
});

describe('le contenu à reprendre', () => {
  it('prend la version du serveur quand elle PROLONGE la nôtre', () => {
    expect(contenuARattraper('Bonjour, je', 'Bonjour, je construis.')).toBe('Bonjour, je construis.');
  });

  it('refuse une version qui ne la prolonge pas (régénérée, éditée)', () => {
    expect(contenuARattraper('Bonjour, je', 'Salut, je construis.')).toBeNull();
  });

  it('refuse une version plus courte ou égale', () => {
    expect(contenuARattraper('Bonjour, je construis.', 'Bonjour, je')).toBeNull();
    expect(contenuARattraper('Bonjour', 'Bonjour')).toBeNull();
    expect(contenuARattraper('Bonjour', undefined)).toBeNull();
  });

  it('ignore le raisonnement, que le serveur n’enregistre pas, et le GARDE dans le résultat', () => {
    const local = `${REFLEXION('Je réfléchis.')}Bonjour, je`;

    expect(contenuARattraper(local, 'Bonjour, je construis.')).toBe(`${local} construis.`);
  });

  it('referme un raisonnement coupé avant d’ajouter la réponse', () => {
    const local = '<div class="__boltThought__">Je réfléch';

    expect(sansReflexion(local)).toEqual({ texte: '', reflexionOuverte: true });
    expect(contenuARattraper(local, 'Voici.')).toBe(`${local}</div>\nVoici.`);
  });

  it('retire plusieurs blocs de raisonnement entrelacés', () => {
    expect(sansReflexion(`A${REFLEXION('r1')}B${REFLEXION('r2')}C`)).toEqual({ texte: 'ABC', reflexionOuverte: false });
  });
});

describe('le plan de rattrapage', () => {
  it('COMPLÈTE la réponse commencée, sous son identifiant local', async () => {
    const idUtilisateur = await identifiantServeurDuMessage('c', 'u1');

    const plan = await planDeRattrapage(
      'c',
      [
        { id: 'u1', role: 'user', content: 'Fais une app' },
        { id: 'a1', role: 'assistant', content: 'Je' },
      ],
      [
        { id: idUtilisateur, role: 'user', content: 'Fais une app' },
        { id: 'aimsg_x', role: 'assistant', content: 'Je construis.' },
      ],
    );

    expect(plan).toEqual({ type: 'completer', messageId: 'a1', contenu: 'Je construis.' });
  });

  it('AJOUTE la réponse quand la coupure est tombée avant le premier mot', async () => {
    const idUtilisateur = await identifiantServeurDuMessage('c', 'u1');

    const plan = await planDeRattrapage(
      'c',
      [{ id: 'u1', role: 'user', content: 'Fais une app' }],
      [
        { id: idUtilisateur, role: 'user', content: 'Fais une app' },
        { id: 'aimsg_x', role: 'assistant', content: 'Je construis.' },
      ],
    );

    expect(plan).toEqual({ type: 'ajouter', message: { id: 'aimsg_x', role: 'assistant', content: 'Je construis.' } });
  });

  it("n'apporte rien tant que le serveur n'a que notre propre version", async () => {
    const idUtilisateur = await identifiantServeurDuMessage('c', 'u1');

    const plan = await planDeRattrapage(
      'c',
      [
        { id: 'u1', role: 'user', content: 'Fais une app' },
        { id: 'a1', role: 'assistant', content: 'Je' },
      ],
      [
        { id: idUtilisateur, role: 'user', content: 'Fais une app' },
        { id: 'aimsg_x', role: 'assistant', content: 'Je' },
      ],
    );

    expect(plan).toBeNull();
  });

  it("ne prend jamais la réponse d'un AUTRE tour", async () => {
    const plan = await planDeRattrapage(
      'c',
      [{ id: 'u2', role: 'user', content: 'Deuxième' }],
      [
        { id: await identifiantServeurDuMessage('c', 'u1'), role: 'user', content: 'Premier' },
        { id: 'aimsg_x', role: 'assistant', content: 'Réponse au premier.' },
      ],
    );

    expect(plan).toBeNull();
  });
});

describe('ce qui arme et désarme le rattrapage', () => {
  it('une coupure réseau, sous chaque moteur', () => {
    expect(estUneCoupureReseau(new TypeError('Load failed'))).toBe(true);
    expect(estUneCoupureReseau(new Error('Failed to fetch'))).toBe(true);
    expect(estUneCoupureReseau(new Error('network error'))).toBe(true);
    expect(estUneCoupureReseau(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
  });

  it("pas une erreur rendue par le serveur : il n'y a rien à attendre", () => {
    expect(estUneCoupureReseau(new Error('{"code":"PROVIDER_ERROR"}'))).toBe(false);
  });

  it('abandonne après quinze minutes', () => {
    expect(rattrapageEncoreOuvert(0, RATTRAPAGE_DUREE_MAX_MS - 1)).toBe(true);
    expect(rattrapageEncoreOuvert(0, RATTRAPAGE_DUREE_MAX_MS)).toBe(false);
  });
});
