/*
 * Ce que les deux écrans de la feuille affichent — calculé ici, rendu ailleurs.
 *
 * La feuille a deux niveaux : la liste des modes, puis le choix du modèle du
 * mode retenu. Tout ce qui décide de ce qu'on voit — la valeur à droite de
 * chaque ligne, le cadenas, l'état d'un modèle, le cran d'effort offert — est
 * une fonction pure, testable sans monter un composant.
 *
 * La raison n'est pas l'élégance : c'est que ces décisions portent de l'argent
 * et des promesses. Un modèle montré comme disponible alors qu'il ne répond pas
 * casse au premier clic ; un cran d'effort offert alors que le modèle le refuse
 * échoue au premier envoi, chez l'utilisateur. Les deux se testent ici en
 * quelques millisecondes ; dans le JSX, ils ne se testeraient qu'au rendu.
 *
 * Les libellés sont rendus sous forme de CLÉS, jamais de phrases : la rédaction
 * vit dans le catalogue i18n, en français et en anglais.
 */
import {
  coutMelange,
  cransPour,
  modeleAutomatiqueJoignable,
  catalogueAvecEtats,
  type AgentMode,
  type CatalogueDuMode,
  type CranEffort,
  type ModeleAvecEtat,
  type SondeFournisseur,
} from '@vibecore/billing';

/** Ce que l'utilisateur a choisi, pour un mode donné. */
export interface ChoixDuMode {
  /** `undefined` = « choisir automatiquement ». */
  modele?: string;
  serviceTier?: 'fast';
  effort?: CranEffort;
}

export interface LigneDeMode {
  mode: AgentMode;
  selectionne: boolean;

  /**
   * Ce qui s'affiche à DROITE de la ligne : « Auto » tant que l'utilisateur n'a
   * rien choisi, sinon l'identifiant du modèle retenu.
   */
  valeur: { sorte: 'auto'; modeleResolu?: string } | { sorte: 'modele'; model: string; serviceTier?: 'fast' };

  /** Vrai quand le mode n'ouvre pas de réglages — c'est le cas de Lite. */
  reglagesVerrouilles: boolean;

  /** Clé de traduction expliquant le verrou, quand il y en a un. */
  raisonDuVerrou?: 'passer-a-power-ou-max';
}

/**
 * Les modes qui n'ouvrent pas de réglages.
 *
 * Lite ne propose ni choix de modèle ni réglages avancés : mesuré sur le code
 * actuel, l'effort élevé y est refusé et Turbo aussi. Le verrou n'est donc pas
 * une décision d'affichage, c'est le reflet d'une règle produit qui existe déjà.
 */
const MODES_SANS_REGLAGES: AgentMode[] = ['lite'];

export function ligneDeMode(
  mode: AgentMode,
  modeActif: AgentMode,
  choix: ChoixDuMode | undefined,
  catalogue: CatalogueDuMode | undefined,
  sondes: SondeFournisseur[],
): LigneDeMode {
  const verrouille = MODES_SANS_REGLAGES.includes(mode);

  const valeur: LigneDeMode['valeur'] = choix?.modele
    ? { sorte: 'modele', model: choix.modele, serviceTier: choix.serviceTier }
    : {
        sorte: 'auto',

        /*
         * Le modèle que « Auto » désigne AUJOURD'HUI, pour pouvoir l'afficher en
         * second plan. Il dépend de qui répond : ce n'est pas une constante.
         */
        modeleResolu: catalogue ? modeleAutomatiqueJoignable(catalogue, sondes, coutMelange)?.model : undefined,
      };

  return {
    mode,
    selectionne: mode === modeActif,
    valeur,
    reglagesVerrouilles: verrouille,
    raisonDuVerrou: verrouille ? 'passer-a-power-ou-max' : undefined,
  };
}

export interface EntreeDuSecondNiveau {
  /** `modele` mène au sélecteur ; `avance` aux réglages d'effort et de redondance. */
  sorte: 'modele' | 'avance';
  verrouillee: boolean;
  raison?: 'passer-a-power-ou-max';
}

/** Les deux lignes à chevron, sous la description du mode. */
export function entreesDuMode(mode: AgentMode): EntreeDuSecondNiveau[] {
  const verrouillee = MODES_SANS_REGLAGES.includes(mode);
  const raison = verrouillee ? ('passer-a-power-ou-max' as const) : undefined;

  return [
    { sorte: 'modele', verrouillee, raison },
    { sorte: 'avance', verrouillee, raison },
  ];
}

export interface LigneDuSelecteur {
  /** La première ligne de l'écran 2, toujours présente. */
  sorte: 'automatique' | 'modele';
  model?: string;
  provider?: ModeleAvecEtat['provider'];
  serviceTier?: 'fast';
  etat?: ModeleAvecEtat['etat'];
  raison?: ModeleAvecEtat['raison'];
  choisie: boolean;

  /** Pour la ligne automatique : le modèle qu'elle désigne en ce moment. */
  modeleResolu?: string;
}

/**
 * L'écran 2 : « Choisir pour moi » en tête, puis les modèles.
 *
 * Les modèles injoignables RESTENT dans la liste, marqués. Les retirer serait
 * pire que les montrer : au rechargement du compte fournisseur, il faudrait un
 * déploiement pour les faire réapparaître.
 */
export function lignesDuSelecteur(
  catalogue: CatalogueDuMode,
  sondes: SondeFournisseur[],
  choix: ChoixDuMode | undefined,
): LigneDuSelecteur[] {
  const automatique = modeleAutomatiqueJoignable(catalogue, sondes, coutMelange);

  const enTete: LigneDuSelecteur = {
    sorte: 'automatique',
    choisie: !choix?.modele,
    modeleResolu: automatique?.model,
  };

  const modeles = catalogueAvecEtats(catalogue, sondes).map((modele) => ({
    sorte: 'modele' as const,
    model: modele.model,
    provider: modele.provider,
    serviceTier: modele.serviceTier,
    etat: modele.etat,
    raison: modele.raison,
    choisie: choix?.modele === modele.model && choix?.serviceTier === modele.serviceTier,
  }));

  return [enTete, ...modeles];
}

export interface EtatDuCurseur {
  actif: boolean;
  crans: CranEffort[];
  valeur?: CranEffort;

  /** Cran conseillé par le fournisseur, quand il y en a un. */
  conseille?: CranEffort;
}

/**
 * Le curseur d'effort, pour le modèle effectivement retenu.
 *
 * Il lit les crans du MODÈLE, jamais un nombre figé : cinq quand le modèle en
 * déclare cinq, quatre quand il en déclare quatre, désactivé quand il n'en
 * déclare aucun. Un curseur figé proposerait un cran que le modèle refuse, et
 * l'erreur n'apparaîtrait qu'au premier envoi.
 */
export function etatDuCurseur(
  catalogue: CatalogueDuMode | undefined,
  sondes: SondeFournisseur[],
  choix: ChoixDuMode | undefined,
): EtatDuCurseur {
  const retenu =
    choix?.modele ?? (catalogue ? modeleAutomatiqueJoignable(catalogue, sondes, coutMelange)?.model : undefined);

  if (!retenu) {
    return { actif: false, crans: [] };
  }

  const { crans, conseille } = cransPour(retenu);

  return {
    actif: crans.length > 1,
    crans,
    conseille,
    valeur: choix?.effort && crans.includes(choix.effort) ? choix.effort : conseille,
  };
}
