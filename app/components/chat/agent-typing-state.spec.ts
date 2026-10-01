import { describe, expect, it } from 'vitest';
import { fautIlMontrerLAgentEnEcriture } from './agent-typing-state';

describe('l’agent est en train d’écrire', () => {
  it('se montre dès que la question est posée, avant tout caractère', () => {
    expect(fautIlMontrerLAgentEnEcriture({ enCours: true, dernierRole: 'user', caracteresDeLAgent: 0 })).toBe(true);
  });

  it('se montre aussi quand la bulle de l’agent existe mais est encore vide', () => {
    /*
     * C'est le cas mesuré ailleurs dans ce produit : une bulle d'agent montée
     * avant que le moindre octet n'arrive. Sans ce cas, l'attente la plus
     * longue serait justement celle qu'on ne signale pas.
     */
    expect(fautIlMontrerLAgentEnEcriture({ enCours: true, dernierRole: 'assistant', caracteresDeLAgent: 0 })).toBe(
      true,
    );
  });

  it('s’efface dès que le texte devient lisible', () => {
    /*
     * Le texte qui s'écrit EST le retour. Garder les points en plus, c'est deux
     * signaux pour une seule information — et une ligne de plus dans un fil
     * qu'Avi trouve déjà trop aéré.
     */
    expect(fautIlMontrerLAgentEnEcriture({ enCours: true, dernierRole: 'assistant', caracteresDeLAgent: 1 })).toBe(
      false,
    );
  });

  it('ne se montre jamais quand rien n’est en cours', () => {
    expect(fautIlMontrerLAgentEnEcriture({ enCours: false, dernierRole: 'user', caracteresDeLAgent: 0 })).toBe(false);
  });

  it('se montre sur un fil vide', () => {
    expect(fautIlMontrerLAgentEnEcriture({ enCours: true, caracteresDeLAgent: 0 })).toBe(true);
  });
});
