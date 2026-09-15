import { formatFinDeTourCopy, getFinDeTourCopy, resolveFinDeTourLanguage } from '~/lib/i18n/catalogs/fin-de-tour';

/*
 * Fin de tour de l'agent — parité Replit (RP-CKPT-01 à 07).
 *
 * Sous chaque réponse de l'agent, Replit pose deux lignes repliables :
 * « Worked for 2 minutes » (Time worked / Work done / Items read / Agent
 * usage) et « Checkpoint made 25 days ago » (message du commit, date,
 * « Rollback here », « Changes »). Tout ce qui se calcule sans le DOM vit ici,
 * pour être testé à sec ; le composant `FinDeTour.tsx` ne fait que rendre.
 *
 * Le point de restauration est un instantané du projet (`ProjectSnapshot`)
 * de genre `automatic` dont le manifeste porte `checkpoint` : l'identifiant du
 * message de l'agent qui l'a produit, le commit Git associé, son message, et
 * les statistiques du tour — qui doivent SURVIVRE au rechargement, alors que
 * l'annotation `usage` du flux, elle, ne survit pas.
 */

export type StatistiquesDuTour = {
  dureeMs?: number;
  actions: number;
  lignesLues: number;
  coutCents?: number;
  jetons?: number;
};

export type PointDeRestauration = {
  snapshotId: string;
  messageId: string;
  conversationId?: string;
  turnIndex?: number;
  commitSha?: string;
  commitMessage: string;
  createdAt?: string;
  statistiques?: StatistiquesDuTour;
};

export type ManifesteDePoint = {
  messageId: string;
  conversationId?: string;

  /** Ordinal (base 0) du tour de l'agent dans la conversation — stable au rechargement, quand l'identifiant du message ne l'est pas. */
  turnIndex?: number;
  commitSha?: string;
  commitMessage: string;
  statistiques?: StatistiquesDuTour;
};

type PartieDeMessage = {
  type?: string;
  toolInvocation?: { toolName?: string; state?: string; result?: unknown; args?: unknown };
};

type MessageMinimal = {
  id?: string;
  role?: string;
  content?: string;
  parts?: ReadonlyArray<PartieDeMessage> | undefined;
  annotations?: ReadonlyArray<unknown> | undefined;
};

type InstantaneMinimal = {
  id: string;
  kind?: string;
  createdAt?: string;
  manifest?: unknown;
};

const OUTILS_DE_LECTURE = /read|view|cat|open|search|grep|list|glob|find|inspect|blame|log/iu;
const OUTILS_D_ECRITURE = /write|create|apply_patch|patch|delete|remove|rename|move|edit|replace|restore|mkdir/iu;

function partiesOutil(message: MessageMinimal) {
  return (message.parts ?? []).filter(
    (partie) => partie?.type === 'tool-invocation' && typeof partie.toolInvocation === 'object',
  );
}

/** Nombre d'actions du tour : actions d'artefact (`<boltAction>`) + appels d'outil. */
export function compterLesActions(message: MessageMinimal): number {
  const actionsDArtefact = (message.content ?? '').match(/<boltAction\b/gu)?.length ?? 0;

  return actionsDArtefact + partiesOutil(message).length;
}

function texteDUnResultat(resultat: unknown): string {
  if (typeof resultat === 'string') {
    return resultat;
  }

  if (resultat && typeof resultat === 'object') {
    const objet = resultat as Record<string, unknown>;

    for (const cle of ['content', 'text', 'output', 'data']) {
      if (typeof objet[cle] === 'string') {
        return objet[cle] as string;
      }
    }

    try {
      return JSON.stringify(resultat);
    } catch {
      return '';
    }
  }

  return '';
}

/** Lignes lues par le tour : la somme des lignes rendues par les outils de lecture. */
export function compterLesLignesLues(message: MessageMinimal): number {
  return partiesOutil(message).reduce((total, partie) => {
    const appel = partie.toolInvocation!;

    if (appel.state !== 'result' || !OUTILS_DE_LECTURE.test(appel.toolName ?? '')) {
      return total;
    }

    const texte = texteDUnResultat(appel.result);

    if (!texte.trim()) {
      return total;
    }

    return total + texte.split('\n').length;
  }, 0);
}

/** Le tour a-t-il changé des fichiers ? C'est ce qui justifie un point de restauration. */
export function leTourAEcritDesFichiers(message: MessageMinimal): boolean {
  if (/<boltAction\b[^>]*\btype="file"/u.test(message.content ?? '')) {
    return true;
  }

  return partiesOutil(message).some((partie) => OUTILS_D_ECRITURE.test(partie.toolInvocation!.toolName ?? ''));
}

type AnnotationUsage = {
  type?: string;
  value?: { totalTokens?: number; durationMs?: number; costCents?: number };
};

export function annotationUsageDuMessage(message: MessageMinimal): AnnotationUsage['value'] | undefined {
  const annotation = (message.annotations ?? []).find(
    (candidate): candidate is AnnotationUsage =>
      typeof candidate === 'object' && candidate !== null && (candidate as AnnotationUsage).type === 'usage',
  );

  return annotation?.value;
}

export function statistiquesDuTour(message: MessageMinimal): StatistiquesDuTour {
  const usage = annotationUsageDuMessage(message);

  return {
    dureeMs: typeof usage?.durationMs === 'number' && usage.durationMs > 0 ? Math.round(usage.durationMs) : undefined,
    actions: compterLesActions(message),
    lignesLues: compterLesLignesLues(message),
    coutCents: typeof usage?.costCents === 'number' && usage.costCents >= 0 ? usage.costCents : undefined,
    jetons: typeof usage?.totalTokens === 'number' && usage.totalTokens > 0 ? usage.totalTokens : undefined,
  };
}

/**
 * Ce qui est mesuré sur le message (annotation de flux, parties d'outil)
 * passe d'abord ; ce que le point de restauration a gardé comble les trous —
 * après un rechargement, l'annotation `usage` et les parties d'outil ont
 * disparu, le manifeste du point, lui, reste.
 */
export function fusionnerLesStatistiques(
  mesurees: StatistiquesDuTour,
  gardees: StatistiquesDuTour | undefined,
): StatistiquesDuTour {
  if (!gardees) {
    return mesurees;
  }

  return {
    dureeMs: mesurees.dureeMs ?? gardees.dureeMs,
    actions: Math.max(mesurees.actions, gardees.actions),
    lignesLues: Math.max(mesurees.lignesLues, gardees.lignesLues),
    coutCents: mesurees.coutCents ?? gardees.coutCents,
    jetons: mesurees.jetons ?? gardees.jetons,
  };
}

const LONGUEUR_MAX_DU_MESSAGE_DE_COMMIT = 72;

function tronquer(texte: string, longueur: number): string {
  const propre = texte.replace(/\s+/gu, ' ').trim();

  if (propre.length <= longueur) {
    return propre;
  }

  return `${propre.slice(0, longueur - 1).trimEnd()}…`;
}

/**
 * Le message du commit du tour : le ou les titres d'artefact quand il y en a
 * (« Page de contact »), sinon la première ligne de prose, sans balises ni
 * Markdown, sinon le repli fourni.
 */
export function messageDeCommitDuTour(content: string | undefined, repli: string): string {
  const source = content ?? '';

  const titres = [...source.matchAll(/<boltArtifact\b[^>]*\btitle="([^"]*)"/gu)]
    .map((correspondance) => correspondance[1].trim())
    .filter(Boolean);

  if (titres.length) {
    return tronquer([...new Set(titres)].join(', '), LONGUEUR_MAX_DU_MESSAGE_DE_COMMIT);
  }

  const prose = source
    .replace(/<boltArtifact\b[\s\S]*?<\/boltArtifact>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/```[\s\S]*?```/gu, ' ')
    .split('\n')
    .map((ligne) =>
      ligne
        .replace(/^[\s#>*\-•]+/u, '')
        .replace(/[*_`~]/gu, '')
        .trim(),
    )
    .find((ligne) => ligne.length > 2);

  return prose ? tronquer(prose, LONGUEUR_MAX_DU_MESSAGE_DE_COMMIT) : repli;
}

function manifesteDePoint(instantane: InstantaneMinimal): ManifesteDePoint | null {
  const manifeste = instantane.manifest;

  if (!manifeste || typeof manifeste !== 'object') {
    return null;
  }

  const point = (manifeste as { checkpoint?: unknown }).checkpoint;

  if (!point || typeof point !== 'object') {
    return null;
  }

  const brut = point as Partial<ManifesteDePoint>;

  if (typeof brut.messageId !== 'string' || !brut.messageId) {
    return null;
  }

  return {
    messageId: brut.messageId,
    conversationId: typeof brut.conversationId === 'string' ? brut.conversationId : undefined,
    turnIndex: typeof brut.turnIndex === 'number' && brut.turnIndex >= 0 ? brut.turnIndex : undefined,
    commitSha: typeof brut.commitSha === 'string' && brut.commitSha ? brut.commitSha : undefined,
    commitMessage: typeof brut.commitMessage === 'string' ? brut.commitMessage : '',
    statistiques:
      brut.statistiques && typeof brut.statistiques === 'object'
        ? {
            dureeMs: typeof brut.statistiques.dureeMs === 'number' ? brut.statistiques.dureeMs : undefined,
            actions: typeof brut.statistiques.actions === 'number' ? brut.statistiques.actions : 0,
            lignesLues: typeof brut.statistiques.lignesLues === 'number' ? brut.statistiques.lignesLues : 0,
            coutCents: typeof brut.statistiques.coutCents === 'number' ? brut.statistiques.coutCents : undefined,
            jetons: typeof brut.statistiques.jetons === 'number' ? brut.statistiques.jetons : undefined,
          }
        : undefined,
  };
}

/**
 * Les points de restauration, par identifiant de message : le plus récent
 * gagne.
 *
 * Deux clés, parce que l'identifiant d'un message NE SURVIT PAS au
 * rechargement : le client nomme ses messages à sa façon, le serveur les
 * renomme `aimsg_<empreinte(conversation, identifiant client)>` au relu
 * (mesuré le 08/09 : `a1` en écriture, `aimsg_ef8b…` en lecture). Le point
 * garde donc AUSSI la conversation et l'ordinal du tour de l'agent, stables ;
 * avec les messages affichés et la conversation courante, on retrouve le
 * message par son rang.
 */
export function pointsDeRestaurationParMessage(
  instantanes: ReadonlyArray<InstantaneMinimal>,
  contexte?: { messages?: ReadonlyArray<{ id?: string; role?: string }>; conversationId?: string },
): Map<string, PointDeRestauration> {
  const parIdentifiant = new Map<string, PointDeRestauration>();
  const parTour = new Map<string, PointDeRestauration>();

  const plusRecent = (candidat: PointDeRestauration, existant: PointDeRestauration | undefined) =>
    !existant || Date.parse(candidat.createdAt ?? '') >= Date.parse(existant.createdAt ?? '');

  for (const instantane of instantanes) {
    const manifeste = manifesteDePoint(instantane);

    if (!manifeste) {
      continue;
    }

    const candidat: PointDeRestauration = {
      snapshotId: instantane.id,
      messageId: manifeste.messageId,
      conversationId: manifeste.conversationId,
      turnIndex: manifeste.turnIndex,
      commitSha: manifeste.commitSha,
      commitMessage: manifeste.commitMessage,
      createdAt: instantane.createdAt,
      statistiques: manifeste.statistiques,
    };

    if (plusRecent(candidat, parIdentifiant.get(manifeste.messageId))) {
      parIdentifiant.set(manifeste.messageId, candidat);
    }

    if (manifeste.conversationId && typeof manifeste.turnIndex === 'number') {
      const cle = `${manifeste.conversationId}:${manifeste.turnIndex}`;

      if (plusRecent(candidat, parTour.get(cle))) {
        parTour.set(cle, candidat);
      }
    }
  }

  const points = new Map(parIdentifiant);

  if (contexte?.conversationId && contexte.messages?.length) {
    let ordinal = 0;

    for (const message of contexte.messages) {
      if (message.role !== 'assistant') {
        continue;
      }

      const point = parTour.get(`${contexte.conversationId}:${ordinal}`);

      ordinal += 1;

      if (message.id && point && !points.has(message.id)) {
        points.set(message.id, point);
      }
    }
  }

  return points;
}

export function pointDeRestaurationDuMessage(
  instantanes: ReadonlyArray<InstantaneMinimal>,
  messageId: string,
): PointDeRestauration | null {
  return pointsDeRestaurationParMessage(instantanes).get(messageId) ?? null;
}

/*
 * ----- Formats -----
 * « Worked for 2 minutes », « 25 days ago », « Aug 13, 2026 at 9:22 PM », « $3.21 ».
 */

function copie(langue: string | null | undefined) {
  return getFinDeTourCopy(langue);
}

export function formaterLaDuree(dureeMs: number, langue?: string | null): string {
  const c = copie(langue);

  if (!Number.isFinite(dureeMs) || dureeMs < 500) {
    return c['finDeTour.duration.instant'];
  }

  const secondes = Math.round(dureeMs / 1000);

  if (secondes < 60) {
    return secondes === 1
      ? c['finDeTour.duration.second']
      : formatFinDeTourCopy(c['finDeTour.duration.seconds'], { count: secondes });
  }

  const minutesTotales = Math.round(dureeMs / 60_000);

  if (minutesTotales < 60) {
    return minutesTotales === 1
      ? c['finDeTour.duration.minute']
      : formatFinDeTourCopy(c['finDeTour.duration.minutes'], { count: minutesTotales });
  }

  const heures = Math.floor(minutesTotales / 60);
  const minutes = minutesTotales % 60;

  const partieHeures =
    heures === 1 ? c['finDeTour.duration.hour'] : formatFinDeTourCopy(c['finDeTour.duration.hours'], { count: heures });

  if (!minutes) {
    return partieHeures;
  }

  const partieMinutes =
    minutes === 1
      ? c['finDeTour.duration.minute']
      : formatFinDeTourCopy(c['finDeTour.duration.minutes'], { count: minutes });

  return `${partieHeures} ${partieMinutes}`;
}

export function ilYA(iso: string | undefined, langue?: string | null, maintenant: number = Date.now()): string {
  const c = copie(langue);
  const date = iso ? Date.parse(iso) : Number.NaN;

  if (!Number.isFinite(date)) {
    return c['finDeTour.ago.now'];
  }

  const secondes = Math.max(0, Math.round((maintenant - date) / 1000));

  if (secondes < 45) {
    return c['finDeTour.ago.now'];
  }

  const paliers: Array<[number, 'minute' | 'hour' | 'day' | 'month' | 'year']> = [
    [60, 'minute'],
    [3600, 'hour'],
    [86_400, 'day'],
    [2_592_000, 'month'],
    [31_536_000, 'year'],
  ];

  let unite: (typeof paliers)[number][1] = 'minute';
  let diviseur = 60;

  for (const [seuil, nom] of paliers) {
    if (secondes >= seuil) {
      unite = nom;
      diviseur = seuil;
    }
  }

  const compte = Math.max(1, Math.round(secondes / diviseur));
  const pluriel = `${unite}s` as const;

  return compte === 1
    ? c[`finDeTour.ago.${unite}`]
    : formatFinDeTourCopy(c[`finDeTour.ago.${pluriel}`], { count: compte });
}

export function formaterLeCout(coutCents: number, langue?: string | null): string {
  const montant = coutCents / 100;

  if (resolveFinDeTourLanguage(langue) === 'fr') {
    return `${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }

  return `$${montant.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formaterLaDateDuPoint(iso: string | undefined, langue?: string | null): string {
  const c = copie(langue);
  const date = iso ? new Date(iso) : null;

  if (!date || !Number.isFinite(date.getTime())) {
    return c['finDeTour.unknown'];
  }

  const fr = resolveFinDeTourLanguage(langue) === 'fr';
  const locale = fr ? 'fr-FR' : 'en-US';
  const partieDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  const partieHeure = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: !fr }).format(date);

  return formatFinDeTourCopy(c['finDeTour.dateAt'], { date: partieDate, time: partieHeure });
}

export function formaterLeNombre(nombre: number, langue?: string | null): string {
  return nombre.toLocaleString(resolveFinDeTourLanguage(langue) === 'fr' ? 'fr-FR' : 'en-US');
}

/** Les quatre lignes du détail « Worked for » — dans l'ordre de Replit. */
export function lignesDuDetailDuTour(
  statistiques: StatistiquesDuTour,
  langue?: string | null,
): Array<{ cle: 'timeWorked' | 'workDone' | 'itemsRead' | 'agentUsage'; libelle: string; valeur: string }> {
  const c = copie(langue);

  const compte = (n: number, singulier: keyof typeof c, pluriel: keyof typeof c) =>
    formatFinDeTourCopy(c[n === 1 ? singulier : pluriel], { count: formaterLeNombre(n, langue) });

  const usage =
    typeof statistiques.coutCents === 'number'
      ? formaterLeCout(statistiques.coutCents, langue)
      : typeof statistiques.jetons === 'number'
        ? formatFinDeTourCopy(c['finDeTour.tokens'], { count: formaterLeNombre(statistiques.jetons, langue) })
        : c['finDeTour.unknown'];

  return [
    {
      cle: 'timeWorked',
      libelle: c['finDeTour.timeWorked'],
      valeur:
        typeof statistiques.dureeMs === 'number'
          ? formaterLaDuree(statistiques.dureeMs, langue)
          : c['finDeTour.unknown'],
    },
    {
      cle: 'workDone',
      libelle: c['finDeTour.workDone'],
      valeur: compte(statistiques.actions, 'finDeTour.action', 'finDeTour.actions'),
    },
    {
      cle: 'itemsRead',
      libelle: c['finDeTour.itemsRead'],
      valeur: compte(statistiques.lignesLues, 'finDeTour.line', 'finDeTour.lines'),
    },
    { cle: 'agentUsage', libelle: c['finDeTour.agentUsage'], valeur: usage },
  ];
}

export function titreDeLaLigneTravail(statistiques: StatistiquesDuTour, langue?: string | null): string {
  const c = copie(langue);

  return typeof statistiques.dureeMs === 'number'
    ? formatFinDeTourCopy(c['finDeTour.worked'], { duration: formaterLaDuree(statistiques.dureeMs, langue) })
    : c['finDeTour.workedUnknown'];
}

export function titreDeLaLignePoint(
  point: Pick<PointDeRestauration, 'createdAt'>,
  langue?: string | null,
  maintenant: number = Date.now(),
): string {
  return formatFinDeTourCopy(copie(langue)['finDeTour.checkpoint'], { ago: ilYA(point.createdAt, langue, maintenant) });
}

/**
 * Faut-il montrer le bloc sous ce message ? Oui dès qu'il y a quelque chose de
 * vrai à montrer : un point de restauration, ou des statistiques mesurées.
 */
export function leBlocAQuelqueChoseAMontrer(
  statistiques: StatistiquesDuTour,
  point: PointDeRestauration | null | undefined,
): boolean {
  return Boolean(point) || typeof statistiques.dureeMs === 'number' || statistiques.actions > 0;
}
