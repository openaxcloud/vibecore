/*
 * Le choix de modèle par mode — lecture, écriture, diffusion.
 *
 * Pourquoi un fichier à part : la feuille des modes peint, `feuille-des-modes.ts`
 * décide, et ceci PERSISTE. Les trois se testent séparément parce que les trois
 * cassent séparément — un choix qui s'affiche mais ne survit pas au rechargement
 * est un défaut invisible au rendu.
 *
 * Forme stockée : `{ "<mode>": { modele?, serviceTier?, effort? } }`. Un mode
 * absent veut dire « choisir automatiquement », ce qui est aussi le défaut.
 */
import type { AgentMode } from '@vibecore/billing/src/agent-routing';
import { CRANS_CONNUS, type CranEffort } from '@vibecore/billing/src/crans-effort';

import type { ChoixDuMode } from './feuille-des-modes';

export const CLE_CHOIX_DE_MODELE = 'vibecore.agent.model-choice.v1';
export const EVENEMENT_CHOIX_DE_MODELE = 'vibecore:agent-model-choice-change';

export type ChoixParMode = Partial<Record<AgentMode, ChoixDuMode>>;

const MODES_CONNUS: AgentMode[] = ['lite', 'power', 'max'];

/**
 * Nettoie ce qui sort du stockage. Le stockage est une surface hostile : un
 * autre onglet, une ancienne version, une extension. Tout ce qui n'est pas
 * reconnu est jeté silencieusement — jamais propagé tel quel dans la carte.
 */
export function normaliserChoix(brut: unknown): ChoixParMode {
  if (!brut || typeof brut !== 'object') {
    return {};
  }

  const sortie: ChoixParMode = {};

  for (const mode of MODES_CONNUS) {
    const entree = (brut as Record<string, unknown>)[mode];

    if (!entree || typeof entree !== 'object') {
      continue;
    }

    const { modele, serviceTier, effort } = entree as Record<string, unknown>;
    const choix: ChoixDuMode = {};

    if (typeof modele === 'string' && modele.length > 0) {
      choix.modele = modele;
    }

    if (serviceTier === 'fast') {
      choix.serviceTier = serviceTier;
    }

    if (typeof effort === 'string' && (CRANS_CONNUS as readonly string[]).includes(effort)) {
      choix.effort = effort as CranEffort;
    }

    /*
     * Un `serviceTier` ou un `effort` sans modèle ne veut rien dire : le choix
     * automatique ne se règle pas. On ne garde l'entrée que si elle épingle un
     * modèle, sinon elle vaut « automatique », c'est-à-dire rien.
     */
    if (choix.modele) {
      sortie[mode] = choix;
    }
  }

  return sortie;
}

/** Lit le choix persisté. Rend `{}` hors navigateur ou si le stockage est bloqué. */
export function lireChoix(): ChoixParMode {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const brut = window.localStorage.getItem(CLE_CHOIX_DE_MODELE);

    return brut ? normaliserChoix(JSON.parse(brut)) : {};
  } catch {
    return {};
  }
}

/**
 * Écrit le choix et le diffuse. La diffusion existe parce que la requête part
 * d'un autre composant que celui qui porte la feuille : sans l'événement, le
 * réglage serait décoratif — exactement le défaut qu'on a déjà payé une fois
 * sur les interrupteurs de puissance.
 */
export function ecrireChoix(choix: ChoixParMode): ChoixParMode {
  const propre = normaliserChoix(choix);

  if (typeof window === 'undefined') {
    return propre;
  }

  try {
    window.localStorage.setItem(CLE_CHOIX_DE_MODELE, JSON.stringify(propre));
    window.dispatchEvent(new CustomEvent(EVENEMENT_CHOIX_DE_MODELE, { detail: propre }));
  } catch {
    // stockage bloqué : le choix vaut pour la session en cours, pas au-delà.
  }

  return propre;
}

/** Applique un choix à un mode et rend la carte complète, prête à écrire. */
export function appliquerChoix(actuel: ChoixParMode, mode: AgentMode, choix: ChoixDuMode): ChoixParMode {
  const suivant: ChoixParMode = { ...actuel };

  if (choix.modele) {
    suivant[mode] = choix;
  } else {
    delete suivant[mode];
  }

  return suivant;
}
