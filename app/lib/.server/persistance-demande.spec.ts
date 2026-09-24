/*
 * La demande survit au gel de l'onglet.
 *
 * Le test reproduit le scénario mesuré : une commande part, la page est
 * suspendue avant que sa synchronisation de fil n'ait rien envoyé, et
 * l'utilisateur revient. Ce qui compte n'est pas que le tour aboutisse — il
 * n'aboutira pas tant que l'étape 2 n'est pas faite — mais que la DEMANDE soit
 * retrouvée.
 */
import { describe, expect, it, vi } from 'vitest';

import { demandeAPersister, derniereDemande, identifiantDeDemande, texteDuMessage } from './persistance-demande';

describe('extraire la demande', () => {
  it('prend le DERNIER message utilisateur, pas le premier', () => {
    const messages = [
      { role: 'user', content: 'première demande' },
      { role: 'assistant', content: 'réponse' },
      { role: 'user', content: 'seconde demande' },
    ];

    expect(derniereDemande(messages)).toBe('seconde demande');
  });

  it('lit aussi un contenu en parties typées', () => {
    expect(texteDuMessage({ role: 'user', content: [{ type: 'text', text: 'bonjour' }] })).toBe('bonjour');
  });

  /* Une image seule ne porte pas de demande : rien à écrire, et surtout rien à casser. */
  it('rend une chaîne vide quand il n’y a pas de texte', () => {
    expect(texteDuMessage({ role: 'user', content: [{ type: 'image', image: 'data:…' }] })).toBe('');
    expect(derniereDemande(undefined)).toBe('');
    expect(derniereDemande([{ role: 'assistant', content: 'rien de l’utilisateur' }])).toBe('');
  });
});

describe('l’identifiant', () => {
  it('reprend celui du navigateur — c’est lui qui rend l’écriture idempotente', () => {
    expect(identifiantDeDemande('msg-42', 'peu importe')).toBe('msg-42');
  });

  /*
   * L'exigence explicite : si le client l'oublie, on n'abandonne PAS la demande.
   */
  it('en dérive un du contenu quand le client l’oublie, au lieu de perdre le message', () => {
    const a = identifiantDeDemande(undefined, 'construis un minuteur');
    const b = identifiantDeDemande('', 'construis un minuteur');

    expect(a).toMatch(/^srv-[0-9a-f]{24}$/);
    expect(b).toBe(a);
  });

  it('deux demandes différentes ne retombent pas sur le même identifiant', () => {
    expect(identifiantDeDemande(null, 'demande A')).not.toBe(identifiantDeDemande(null, 'demande B'));
  });
});

describe('ce qu’il faut écrire', () => {
  it('rend la ligne complète quand tout est là', () => {
    expect(
      demandeAPersister({
        conversationId: 'conv-1',
        clientMessageId: 'msg-7',
        messages: [{ role: 'user', content: 'salut' }],
      }),
    ).toEqual({ conversationId: 'conv-1', clientId: 'msg-7', content: 'salut' });
  });

  /*
   * Rendre `null` plutôt que jeter : cette écriture ne doit jamais empêcher un
   * tour de partir. Un fil sans conversation connue reste un fil qui doit
   * générer.
   */
  it('rend null sans conversation, sans jeter', () => {
    expect(demandeAPersister({ messages: [{ role: 'user', content: 'salut' }] })).toBeNull();
  });

  it('rend null quand il n’y a aucune demande à écrire', () => {
    expect(demandeAPersister({ conversationId: 'conv-1', messages: [] })).toBeNull();
  });
});

describe('le gel de l’onglet — le scénario mesuré le 2026-09-23', () => {
  /*
   * On simule les deux écrivains : le SERVEUR à la réception, et le NAVIGATEUR
   * qui pousse le fil pendant le flux. Le second est gelé avant d'avoir écrit.
   */
  function baseIdempotente() {
    const lignes = new Map<string, string>();

    return {
      lignes,
      ecrire(conversationId: string, clientId: string, contenu: string) {
        lignes.set(`${conversationId}:${clientId}`, contenu);
      },
    };
  }

  it('la demande est retrouvée alors que le navigateur n’a rien envoyé', () => {
    const base = baseIdempotente();
    const navigateur = vi.fn();

    const a = demandeAPersister({
      conversationId: 'conv-9',
      clientMessageId: 'msg-11',
      messages: [{ role: 'user', content: 'ajoute un mode long' }],
    })!;

    base.ecrire(a.conversationId, a.clientId, a.content);

    /* … l'onglet est gelé ici : la synchronisation du navigateur ne part jamais. */
    expect(navigateur).not.toHaveBeenCalled();

    expect(base.lignes.get('conv-9:msg-11')).toBe('ajoute un mode long');
  });

  it('au retour, la synchronisation du navigateur écrit la MÊME ligne, pas une seconde', () => {
    const base = baseIdempotente();

    const a = demandeAPersister({
      conversationId: 'conv-9',
      clientMessageId: 'msg-11',
      messages: [{ role: 'user', content: 'ajoute un mode long' }],
    })!;

    base.ecrire(a.conversationId, a.clientId, a.content);

    /* Le navigateur revient et pousse son fil, avec SON identifiant. */
    base.ecrire('conv-9', 'msg-11', 'ajoute un mode long');

    expect(base.lignes.size, 'une seule ligne, sinon le fil se dédouble').toBe(1);
  });
});
