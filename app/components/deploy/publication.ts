/*
 * RP-PUBLISH-01…06 — la publication à la Replit, mais sur NOS données.
 *
 * Les captures d'Avi (08/09, 21:00-21:02) montrent le panneau « Publishing » de
 * Replit : une barre d'étapes segmentée, une liste de contrôle, des journaux en
 * ligne, un bandeau d'échec avec « Fix with Agent », l'état courant, les
 * domaines, l'infrastructure et l'historique.
 *
 * On reprend le LANGAGE VISUEL, jamais les données : Replit affiche son propre
 * pipeline (migrations de base de données), que nous n'avons pas. Inventer ces
 * étapes ferait mentir le produit sur son propre état — le défaut que ce projet
 * a déjà payé deux fois. Nos étapes sont donc les nôtres, tirées du statut réel
 * d'un déploiement : QUEUED → BUILDING → READY, avec FAILED et CANCELED.
 */

export type StatutDeploiement = 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'CANCELED' | (string & {});

export type EtatEtape = 'fait' | 'encours' | 'attente' | 'echec' | 'annule';

export interface Deploiement {
  id?: string;
  provider?: string;
  environment?: string;
  status?: StatutDeploiement;
  url?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  framework?: string | null;
  machineSize?: string | null;
  logs?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface Etape {
  id: 'file' | 'compilation' | 'publication';
  etat: EtatEtape;
}

/** Les journaux d'un déploiement, normalisés en lignes de texte. */
export function lignesDeJournal(deploiement: Deploiement | undefined): string[] {
  const brut = deploiement?.logs;

  if (typeof brut === 'string') {
    return brut.split('\n').filter((ligne) => ligne.trim().length > 0);
  }

  if (!Array.isArray(brut)) {
    return [];
  }

  return brut
    .map((entree) => {
      if (typeof entree === 'string') {
        return entree;
      }

      if (entree && typeof entree === 'object') {
        const objet = entree as Record<string, unknown>;

        const horodatage =
          typeof objet.at === 'string' ? objet.at : typeof objet.timestamp === 'string' ? objet.timestamp : '';

        const niveau = typeof objet.level === 'string' ? objet.level : '';

        const message =
          typeof objet.message === 'string' ? objet.message : typeof objet.log === 'string' ? objet.log : '';

        return [horodatage, niveau ? `${niveau}:` : '', message].filter(Boolean).join(' ');
      }

      return '';
    })
    .filter((ligne) => ligne.trim().length > 0);
}

/*
 * Où en est ce déploiement.
 *
 * Le seul point délicat est FAILED : le statut dit QUE ça a échoué, jamais OÙ.
 * On ne le devine pas — on le déduit de ce qu'on observe : si des journaux de
 * compilation existent, la compilation avait commencé, l'échec est donc là ;
 * sinon il est en amont, à la mise en file. Aucune autre étape n'est marquée
 * « faite » sur la foi d'une supposition.
 */
export function etapesDePublication(deploiement: Deploiement | undefined): Etape[] {
  const statut = deploiement?.status;
  const ids: Array<Etape['id']> = ['file', 'compilation', 'publication'];

  if (!deploiement || !statut) {
    return ids.map((id) => ({ id, etat: 'attente' }));
  }

  if (statut === 'READY') {
    return ids.map((id) => ({ id, etat: 'fait' }));
  }

  if (statut === 'CANCELED') {
    return ids.map((id) => ({ id, etat: 'annule' }));
  }

  if (statut === 'FAILED') {
    const aCompile = lignesDeJournal(deploiement).length > 0;

    return ids.map((id) => {
      if (id === 'file') {
        return { id, etat: aCompile ? 'fait' : 'echec' };
      }

      if (id === 'compilation') {
        return { id, etat: aCompile ? 'echec' : 'attente' };
      }

      return { id, etat: 'attente' };
    });
  }

  const courante: Etape['id'] = statut === 'BUILDING' ? 'compilation' : 'file';
  const rang = ids.indexOf(courante);

  return ids.map((id, index) => ({
    id,
    etat: index < rang ? 'fait' : index === rang ? 'encours' : 'attente',
  }));
}

/** L'étape que la barre segmentée doit nommer : celle qui se joue maintenant. */
export function etapeCourante(etapes: Etape[]): Etape | undefined {
  return etapes.find((etape) => etape.etat === 'encours' || etape.etat === 'echec') ?? etapes[etapes.length - 1];
}

export function publicationEnCours(deploiement: Deploiement | undefined): boolean {
  return deploiement?.status === 'QUEUED' || deploiement?.status === 'BUILDING';
}

/** L'état global montré par la pastille : Live / En cours / Échec / Aucun. */
export function etatDePastille(deploiement: Deploiement | undefined): 'live' | 'encours' | 'echec' | 'aucun' {
  if (!deploiement?.status) {
    return 'aucun';
  }

  if (deploiement.status === 'READY') {
    return 'live';
  }

  if (deploiement.status === 'FAILED') {
    return 'echec';
  }

  if (publicationEnCours(deploiement)) {
    return 'encours';
  }

  return 'aucun';
}

/*
 * Le bandeau d'échec de Replit — « 7 builds failed », et la fraîcheur du plus
 * récent. On ne compte QUE les échecs, jamais les annulations : un
 * déploiement annulé par l'utilisateur n'est pas une panne à réparer.
 */
export function resumeDesEchecs(deploiements: readonly Deploiement[] | undefined) {
  const echecs = (deploiements ?? []).filter((deploiement) => deploiement?.status === 'FAILED');

  if (echecs.length === 0) {
    return null;
  }

  const dates = echecs
    .map((echec) => Date.parse(echec.completedAt ?? echec.updatedAt ?? echec.createdAt ?? ''))
    .filter((valeur) => Number.isFinite(valeur));

  return {
    nombre: echecs.length,
    dernierA: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : undefined,
    echecs,
  };
}

/** Un identifiant de révision court, comme Replit : huit caractères. */
export function revisionCourte(deploiement: Deploiement | undefined): string | null {
  const sha = deploiement?.commitSha;

  return typeof sha === 'string' && sha.trim().length > 0 ? sha.trim().slice(0, 9) : null;
}

/** Les domaines réellement joignables — jamais une URL inventée. */
export function domainesConnectes(deploiements: readonly Deploiement[] | undefined): string[] {
  const vus = new Set<string>();

  for (const deploiement of deploiements ?? []) {
    const url = deploiement?.url;

    if (typeof url === 'string' && /^https?:\/\//u.test(url.trim())) {
      vus.add(url.trim());
    }
  }

  return [...vus];
}

/*
 * L'invite envoyée à l'agent par « Réparer avec l'agent ».
 *
 * Le même bouton existe dans l'onglet Sécurité (BUG-SECURITY-FIX-AGENT-001) :
 * une seule règle, deux surfaces (règle 7). L'invite porte le CONSTAT et les
 * journaux, jamais de valeurs de configuration.
 */
export function invitePourReparerLaPublication(input: {
  nombreDEchecs: number;
  provider?: string;
  environment?: string;
  journal?: readonly string[];
}): string {
  const entete =
    input.nombreDEchecs > 1 ? `${input.nombreDEchecs} publications ont échoué.` : 'La publication a échoué.';

  const contexte = [
    input.provider ? `Fournisseur : ${input.provider}.` : '',
    input.environment ? `Environnement : ${input.environment}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const extrait = (input.journal ?? []).slice(-20);

  return [
    entete,
    contexte,
    'Analyse les journaux ci-dessous, trouve la cause première et corrige le projet pour que la publication aboutisse.',
    extrait.length > 0 ? `\nJournaux :\n${extrait.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* RP-PUBLISH-10 — « Configuration de la machine », et son prix RÉEL.  */
/* ------------------------------------------------------------------ */

export interface GabaritDeMachine {
  key: string;
  label: string;
  vcpu?: number;
  ramGb?: number;
  computeUnitsPerSecond?: number;
  available?: boolean;
}

export interface CarteTarifaire {
  currency?: string;
  defaultMachineSize?: string;
  machineSizes?: readonly GabaritDeMachine[];
  compute?: {
    unitCents?: number;
    baseCentsPerMonth?: number;
  };
}

/** Les gabarits que le plan autorise vraiment — jamais ceux qu'il refuse. */
export function gabaritsDisponibles(carte: CarteTarifaire | null | undefined): GabaritDeMachine[] {
  return (carte?.machineSizes ?? []).filter((gabarit) => gabarit && gabarit.available !== false);
}

/*
 * Le coût d'un gabarit, calculé depuis la carte tarifaire active :
 *
 *   unités/seconde × cents/unité       = cents par seconde
 *   × 3600                             = cents par heure
 *   × 730 h + abonnement de base       = cents par mois s'il tourne en continu
 *
 * Les 730 heures sont la convention d'un mois moyen — c'est la même que celle
 * qui permet à Replit d'écrire « $15 per month ($0.0208/hour) ». On l'énonce
 * dans le libellé (« s'il tourne en continu ») parce que la facturation est à
 * l'usage : afficher un forfait sans le dire serait faux.
 *
 * Sans carte tarifaire, on ne rend RIEN — pas de prix inventé.
 */
export const HEURES_PAR_MOIS = 730;

export function tarifDuGabarit(
  carte: CarteTarifaire | null | undefined,
  cleDuGabarit: string | undefined,
): { centsParHeure: number; centsParMois: number } | null {
  const gabarit = gabaritsDisponibles(carte).find((candidat) => candidat.key === cleDuGabarit);
  const unites = gabarit?.computeUnitsPerSecond;
  const centsParUnite = carte?.compute?.unitCents;

  if (!gabarit || typeof unites !== 'number' || typeof centsParUnite !== 'number') {
    return null;
  }

  const centsParHeure = unites * centsParUnite * 3600;

  return {
    centsParHeure,
    centsParMois: centsParHeure * HEURES_PAR_MOIS + (carte?.compute?.baseCentsPerMonth ?? 0),
  };
}

export function formaterMontant(cents: number, langue: string | null | undefined, decimales = 2): string {
  const locale = (langue ?? '').toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(cents / 100);
}
