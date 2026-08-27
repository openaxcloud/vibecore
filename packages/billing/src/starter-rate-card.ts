/**
 * RATE CARD STARTER — versionnée, datée, sourcée.
 *
 * Raison d'être : les chiffres du plan Starter étaient éparpillés en dur dans
 * des composants, des catalogues et des tests, certains sans aucune source
 * (3 projets, 5 projets, 10 Go, 50 Go, 100 requêtes IA). Une valeur inventée
 * refuse de vrais utilisateurs sur une base fausse ; une valeur dupliquée
 * diverge. Tout vit donc ICI, en un seul document versionné, et nulle part
 * ailleurs.
 *
 * Trois règles :
 *
 *  1. **Aucune valeur sans provenance.** Chaque entrée porte sa source, la date
 *     d'observation et la date d'effet.
 *  2. **UNKNOWN reste UNKNOWN.** Un montant que Replit ne publie pas vaut `null`
 *     avec `PENDING_LIVE_CAPTURE` — il n'est appliqué par personne tant qu'un
 *     compte Starter réel ne l'a pas démontré. On ne « complète » jamais.
 *  3. **Un changement de valeur est une NOUVELLE VERSION**, jamais une mutation
 *     silencieuse de l'historique.
 *
 * ⚠️ Ne jamais écrire, ici ou ailleurs, que « Replit n'a pas d'autre plafond » :
 * Starter A d'autres limites (crédits Agent quotidiens plafonnés au mois,
 * crédits cloud mensuels, limites techniques). Ce que la carte publique
 * n'affiche pas n'est pas ce qui n'existe pas.
 */

/** État de connaissance d'une valeur. */
export type RateCardEntryStatus =
  /** Observée sur une source Replit datée et hashée. */
  | 'OBSERVED'
  /** Non publiée par Replit — à capturer sur un compte Starter réel. */
  | 'PENDING_LIVE_CAPTURE';

export interface RateCardEntry<T> {
  /** `null` ⇔ status PENDING_LIVE_CAPTURE. Jamais une valeur « plausible ». */
  value: T | null;
  unit: string;
  status: RateCardEntryStatus;
  /** D'où vient le chiffre : URL, capture hashée, ou pourquoi il manque. */
  provenance: string;
  observedAt?: string;
}

export const STARTER_RATE_CARD_VERSION = 1;
export const STARTER_RATE_CARD_EFFECTIVE_FROM = '2026-08-04';

/**
 * Source primaire : capture live datée et hashée conservée dans le repo
 * (`docs/parity/livescan-2026-07-20/doc-starter-plan.md`,
 * sha256 019962efcfbe8b6641dcd51383b7dfb72d1cb0b5c3763de4dd69aa052aaa047b),
 * référencée par PUBLIC_BASELINE_REPLIT_2026.yaml (claim RPL-28), recoupée le
 * 2026-08-04 sur docs.replit.com/billing/plans/starter-plan.
 */
const LIVESCAN = 'livescan 2026-07-20 sha256 019962ef… (RPL-28) + docs.replit.com/billing/plans/starter-plan';

export const STARTER_RATE_CARD = {
  version: STARTER_RATE_CARD_VERSION,
  effectiveFrom: STARTER_RATE_CARD_EFFECTIVE_FROM,

  /**
   * PUBLICATION — modélisée en « projets publiés ACTIFS », pas en nombre de
   * déploiements. La distinction est le cœur du sujet : republier le même
   * projet autant de fois qu'on veut est normal ; c'est un DEUXIÈME projet
   * distinct qui dépasse l'offre.
   */
  publishing: {
    maxActivePublishedProjects: {
      value: 1,
      unit: 'projets publiés actifs',
      status: 'OBSERVED',
      provenance: `${LIVESCAN} — « Get 1 free published app »`,
      observedAt: '2026-07-20',
    } satisfies RateCardEntry<number>,
    publishedProjectTtlDays: {
      value: 30,
      unit: 'jours',
      status: 'OBSERVED',
      provenance: `${LIVESCAN} — « This published link will automatically go down after 30 days »`,
      observedAt: '2026-07-20',
    } satisfies RateCardEntry<number>,
  },

  /**
   * CRÉDITS AGENT — compteur QUOTIDIEN, remis à zéro chaque jour, mais plafonné
   * au mois. Distinct des crédits cloud ci-dessous : ce sont deux enveloppes
   * différentes, pas deux vues d'une même.
   */
  agentCredits: {
    dailyAllowanceCents: {
      value: null,
      unit: 'cents/jour',
      status: 'PENDING_LIVE_CAPTURE',
      provenance:
        'Montant NON PUBLIÉ par Replit (« daily credits for Agent usage, up to a monthly cap », sans chiffre). À capturer sur un compte Starter authentifié.',
    } satisfies RateCardEntry<number>,
    monthlyCapCents: {
      value: null,
      unit: 'cents/mois',
      status: 'PENDING_LIVE_CAPTURE',
      provenance: 'Plafond mensuel MENTIONNÉ mais non chiffré par Replit. À capturer en réel.',
    } satisfies RateCardEntry<number>,
    resetCadence: 'daily' as const,
  },

  /**
   * CRÉDITS CLOUD — compteur MENSUEL, enveloppe séparée couvrant explicitement
   * bases de données (production), object storage et publication.
   */
  cloudCredits: {
    monthlyAllowanceCents: {
      value: null,
      unit: 'cents/mois',
      status: 'PENDING_LIVE_CAPTURE',
      provenance:
        'Montant NON PUBLIÉ (« monthly credits for cloud usage », sans chiffre). À capturer sur un compte Starter authentifié.',
    } satisfies RateCardEntry<number>,
    covers: ['database-production', 'object-storage', 'publishing'] as const,
    resetCadence: 'monthly' as const,
  },

  /**
   * LIMITES TECHNIQUES — sécurité et capacité. Volontairement SÉPARÉES des
   * avantages commerciaux : ce ne sont pas des quotas d'offre et elles n'ont
   * rien à faire sur une carte de prix.
   */
  technicalLimits: {
    workspaceStorageGb: {
      value: 2,
      unit: 'Go',
      status: 'OBSERVED',
      provenance: `${LIVESCAN} — StarterWorkspaceStorage = '2GB'`,
      observedAt: '2026-07-20',
    } satisfies RateCardEntry<number>,
    concurrentAppsAllPlans: {
      value: 20,
      unit: 'apps simultanées',
      status: 'OBSERVED',
      provenance:
        'docs.replit.com/legal-and-security-info/usage — « Concurrent Replit Apps: 20 (hard) », TOUS PLANS confondus (pas un quota Starter)',
      observedAt: '2026-08-04',
    } satisfies RateCardEntry<number>,
    egressGibPerMonth: {
      value: 10,
      unit: 'GiB/mois',
      status: 'OBSERVED',
      provenance: 'replit.com/blog/new-limits-and-plans — free tier « 10 GiB/month »',
      observedAt: '2026-08-04',
    } satisfies RateCardEntry<number>,
    cpuMillicores: {
      value: null,
      unit: 'millicores',
      status: 'PENDING_LIVE_CAPTURE',
      provenance: 'Replit : « CPU per app: determined by plan », sans chiffre publié pour Starter.',
    } satisfies RateCardEntry<number>,
    ramMb: {
      value: null,
      unit: 'Mo',
      status: 'PENDING_LIVE_CAPTURE',
      provenance: 'Replit : « RAM per app: determined by plan », sans chiffre publié pour Starter.',
    } satisfies RateCardEntry<number>,
  },

  /**
   * CAPACITÉS réservées à un plan supérieur, telles que la doc Replit les
   * décrit. Utile pour lever l'ambiguïté « créable vs convertible ».
   */
  coreOnlyCapabilities: {
    fullBuild: `${LIVESCAN} — Starter limité au Lite build`,
    convertDesignToArtifact: `${LIVESCAN} — Starter peut CRÉER et PUBLIER des designs Canvas ; la CONVERSION en artefact backend exige Core`,
    artifactTypesBeyondWebAndMobile: `${LIVESCAN} — data-viz, slide decks, vidéos animées en tant qu'ARTEFACTS exigent Core`,
    thirdPartyConnectors: `${LIVESCAN}`,
    aiIntegrations: `${LIVESCAN}`,
    planMode: `${LIVESCAN}`,
    badgeRemoval: `${LIVESCAN}`,
    payAsYouGo: `${LIVESCAN} — le pay-as-you-go est présenté comme un DÉBLOCAGE Core, pas comme le comportement de dépassement Starter`,
  },
} as const;

/** Toute entrée exploitable : valeur non nulle ET observée. */
export function isUsable(entry: RateCardEntry<number>): boolean {
  return entry.status === 'OBSERVED' && typeof entry.value === 'number' && Number.isFinite(entry.value);
}

/**
 * Lecture fail-closed d'une entrée numérique. Une valeur non capturée ne doit
 * JAMAIS se transformer en limite appliquée : l'appelant reçoit `null` et doit
 * décider explicitement quoi faire (typiquement : ne rien appliquer).
 */
export function usableValue(entry: RateCardEntry<number>): number | null {
  return isUsable(entry) ? (entry.value as number) : null;
}
