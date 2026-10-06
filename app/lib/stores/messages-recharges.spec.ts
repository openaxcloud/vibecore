import { describe, expect, it } from 'vitest';
import { MessagesRecharges } from './messages-recharges';

/*
 * BUG-QA0929-REOUVERTURE-REJOUE — à la PREMIÈRE ouverture d'un projet sur un
 * appareil, les écritures historiques de l'agent étaient rejouées et écrasaient
 * le fichier de l'utilisateur. Mesuré en local le 2026-09-29 : stockage à
 * `// VERSION-UTILISATEUR-RECENTE` avant l'ouverture, `// VERSION-AGENT-ANCIENNE`
 * après, et un toast « 1 file applied — applied successfully ».
 *
 * Cause : le fil hydraté depuis le serveur était bien marqué « rechargé », puis
 * la passe suivante du parseur remplaçait tout l'ensemble par `initialMessages`
 * — VIDE sur un appareil qui n'a pas encore de cache local.
 */
describe('messages rechargés', () => {
  it('un fil hydraté depuis le serveur reste rechargé quand la passe du parseur remplace la liste', () => {
    const recharges = new MessagesRecharges();

    recharges.marquerHydrates(['aimsg_u1', 'aimsg_a1']);
    recharges.remplacer([]); // processSampledMessages, avec un cache local vide

    expect(recharges.contient('aimsg_a1')).toBe(true);
  });

  it('le remplacement garde son rôle pour les messages du cache local', () => {
    const recharges = new MessagesRecharges();

    recharges.remplacer(['m1']);
    expect(recharges.contient('m1')).toBe(true);

    recharges.remplacer(['m2']);
    expect(recharges.contient('m1')).toBe(false);
    expect(recharges.contient('m2')).toBe(true);
  });

  it('un message produit en direct dans cette session n’est pas rechargé', () => {
    const recharges = new MessagesRecharges();

    recharges.marquerHydrates(['aimsg_a1']);

    expect(recharges.contient('aimsg_nouveau')).toBe(false);
  });

  it('changer de projet oublie les deux ensembles', () => {
    const recharges = new MessagesRecharges();

    recharges.marquerHydrates(['aimsg_a1']);
    recharges.remplacer(['m1']);
    recharges.oublier();

    expect(recharges.contient('aimsg_a1')).toBe(false);
    expect(recharges.contient('m1')).toBe(false);
  });

  it('les actions des SOUS-AGENTS d’un message rechargé sont rechargées elles aussi', () => {
    const recharges = new MessagesRecharges();

    recharges.marquerHydrates(['aimsg_a1']);
    recharges.remplacer(['m1']);

    expect(recharges.contient('aimsg_a1::lane:frontend')).toBe(true);
    expect(recharges.contient('m1::lane:devops')).toBe(true);
  });

  it('contre-épreuve : les sous-agents d’un message produit en direct ne le sont pas', () => {
    const recharges = new MessagesRecharges();

    recharges.marquerHydrates(['aimsg_a1']);

    expect(recharges.contient('direct::lane:frontend')).toBe(false);
    expect(recharges.contient('aimsg_a1-lane')).toBe(false);
  });
});
