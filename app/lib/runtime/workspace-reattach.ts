/**
 * Pure decision helper for the ProjectWorkspaceProvider mount effect.
 *
 * Historically EVERY mount of the provider (reopen, route-return, and React
 * StrictMode's double-mount) tore the workspace down and rebuilt it from scratch:
 * stop the preview, delete ALL pod files (incl. node_modules), re-seed from
 * project storage, reload, and cold-start the dev server. That wiped the exact
 * state the (d) preview short-circuit needs to reattach to a live app, and it
 * killed a running dev server on every remount.
 *
 * This helper decides whether a mount may REATTACH to a warm, current pod —
 * skipping the destructive stop + wipe + reseed and only re-wiring the live
 * preview — instead of doing the full cold reseed.
 */
export interface WarmReattachSignals {
  /**
   * The pod adopted by `startWorkspace` was ALREADY running (a warm/reused pod),
   * not freshly cold-provisioned. Undefined/false when the runtime cannot tell
   * warm from cold — treated as NOT reused (reseed).
   */
  reused: boolean;

  /**
   * THIS client page-session already provisioned + seeded this workspace id (a
   * module-level marker set only after a successful cold seed). This is what makes
   * a StrictMode/route-return remount reattach, while a genuinely NEW page-session
   * (a fresh load — possibly with cross-device edits) has no marker and reseeds.
   */
  seededThisSession: boolean;

  /** A forwarded port is actively serving (hasLivePreviewPort over the runtime ports). */
  hasLivePort: boolean;

  /*
   * BUG-RUNTIME-DIVERGENCE (option A, signal 2) — la sonde de ports a-t-elle
   * ABOUTI ?
   *
   * `refreshRuntimePorts()` était appelée en `.catch(() => undefined)` juste
   * avant la décision : « la sonde a échoué » et « le pod n'écoute rien »
   * devenaient indiscernables, tous deux réduits à `hasLivePort: false`. Mesuré
   * en réel : le magasin `previews` était VIDE au moment de la décision alors
   * que l'API répondait « port 5173, ready:true » à l'instant même.
   *
   * Les deux cas doivent rester distincts parce qu'ils ne se valent pas : un pod
   * qui n'écoute rien DOIT être reseedé, tandis qu'une sonde en échec ne dit
   * rien du pod. Le second reste conservateur — on reseede aussi — mais il est
   * désormais nommé, donc observable dans les journaux au lieu d'être avalé.
   *
   * `undefined` = ancienne sémantique (sonde non instrumentée), traitée comme
   * un échec pour rester du côté sûr.
   */
  portProbeSucceeded?: boolean;

  /**
   * Project storage was modified AFTER this pod was last seeded (a cross-device /
   * out-of-band edit that the warm pod hasn't got). When KNOWN true, reattaching
   * would show stale files, so we must reseed. This signal is only wired when the
   * storage `updatedAt` and the pod's last-seed time are both cheaply available;
   * when unknown it is left `false` (the same-page-session marker already covers
   * the dominant remount case — see ProjectWorkspaceProvider).
   */
  storageNewerThanSeed?: boolean;
}

/**
 * Reattach to the warm pod ONLY when every safety condition holds; if ANY is
 * unknown/false, fall through to the cold wipe+reseed (the safe default).
 *
 *   warm + seeded-this-session + live-port + NOT storage-newer  -> reattach
 *   cold pod / not seeded / no live port / storage newer        -> reseed
 */
/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 2 — second volet).
 *
 * `hasLivePreviewPort` exige `ready === true` STRICTEMENT, là où le code voisin
 * qui répond à la même question (`workbenchStore.refreshRuntimePorts`) accepte
 * `ready !== false`. Un port réellement en écoute mais dont l'état `ready` n'est
 * pas encore confirmé par le flux de surveillance compte donc comme « mort » à
 * l'instant de la décision — et la réouverture reseede un pod parfaitement sain.
 *
 * Le prédicat partagé n'est délibérément PAS modifié : il sert aussi à
 * `isWorkspaceReallyRunning` et à `preview-recovery`, où sa sévérité est voulue
 * et a déjà été corrigée en ce sens. Cette variante est donc locale à la
 * décision de reattach, et alignée sur le voisin qui pose la même question.
 */
export function hasAdoptablePreviewPort(ports?: readonly { ready?: boolean; serving?: boolean }[] | null): boolean {
  return (ports ?? []).some((port) => {
    /*
     * Quand le runtime sait répondre « ce port SERT » (le port répond ET un
     * processus vivant le détient), c'est CE signal qui décide — c'est
     * exactement la question posée ici. `ready` y ajoute le statut manager et le
     * beacon client : le premier retarde à la réouverture, le second reflète le
     * rendu de la page PRÉCÉDENTE. Mesuré en réel sur un pod sain servant
     * `port 5173` : `ready:false, notReadyReason:'manager'` — et la réouverture
     * effaçait l'espace de travail.
     */
    if (typeof port.serving === 'boolean') {
      return port.serving;
    }

    // Runtime qui ne calcule pas `serving` (WebContainer, API antérieure).
    return port.ready !== false;
  });
}

/*
 * BUG-RUNTIME-DIVERGENCE — laisser aux ports le temps d'apparaître AVANT de
 * conclure qu'il n'y en a pas.
 *
 * La sonde de ports est lancée juste après `startWorkspace`. Sur une
 * réouverture, elle peut résoudre avant que l'agent du pod n'ait rapporté le
 * port du serveur de dev : le magasin est alors vide, et « vide » est
 * interprété comme « rien ne tourne » — donc on efface un espace de travail
 * parfaitement sain.
 *
 * Cette ré-sonde est délibérément COURTE et BORNÉE : elle ne s'exécute que
 * lorsqu'elle peut changer la décision (pod chaud ET déjà semé), et elle
 * s'arrête au premier port adoptable. Un pod réellement vide coûte donc au plus
 * `attempts × delayMs` avant d'être reseedé comme avant.
 */
export async function probeAdoptablePortWithRetry(steps: {
  /** Relance la sonde de ports (peut lever : l'appelant décide quoi en faire). */
  refresh: () => Promise<void>;

  /** Lit l'état courant du magasin de previews. */
  readPorts: () => readonly { ready?: boolean; serving?: boolean }[];

  /** Attente entre deux tentatives. */
  wait: (ms: number) => Promise<void>;

  attempts?: number;
  delayMs?: number;
}): Promise<boolean> {
  const attempts = steps.attempts ?? 3;
  const delayMs = steps.delayMs ?? 400;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (hasAdoptablePreviewPort(steps.readPorts())) {
      return true;
    }

    // Pas de ré-sonde après la dernière lecture : elle ne servirait à rien.
    if (attempt === attempts - 1) {
      break;
    }

    await steps.wait(delayMs);

    try {
      await steps.refresh();
    } catch {
      /*
       * Une ré-sonde en échec ne dit rien du pod : on continue avec ce que le
       * magasin contient déjà plutôt que d'abandonner la boucle.
       */
    }
  }

  return hasAdoptablePreviewPort(steps.readPorts());
}

export function shouldReattachWarmWorkspace(signals: WarmReattachSignals): boolean {
  if (signals.storageNewerThanSeed === true) {
    return false;
  }

  /*
   * Une sonde de ports en échec ne prouve RIEN sur le pod : elle ne peut pas
   * valoir autorisation d'adopter. On reste sur le défaut sûr (reseed), mais le
   * refus vient maintenant d'une condition nommée plutôt que d'un `hasLivePort`
   * faux par accident.
   */
  if (signals.portProbeSucceeded !== true) {
    return false;
  }

  return signals.reused && signals.seededThisSession && signals.hasLivePort;
}

/**
 * Orchestrate a cold reseed WITHOUT ever leaving the pod wiped-but-unseeded.
 *
 * The old order was: clear the whole project tree, THEN fetch the storage
 * archive and import it. If the fetch/import failed (a transient export 502, an
 * agent still cold after re-provision), the pod was left with its source tree
 * DELETED and nothing put back — a reopen that momentarily destroyed the user's
 * files until a later successful reseed. This inverts the order: fetch + VALIDATE
 * the authoritative archive first, and only clear once we actually hold it, so a
 * failed fetch returns with the pod's files fully intact (it never destroys
 * existing files it cannot yet replace). The wipe itself already preserves
 * node_modules/.git (they are excluded from the runtime file listing), so this
 * makes the whole reopen path non-destructive on failure.
 *
 * Pure orchestration over injected steps (each may embed its own retry) so the
 * ordering guarantee is unit-testable without a live pod.
 */
export async function reseedWorkspacePreservingOnFailure<TArchive>(steps: {
  /** Fetch + validate the project-storage archive. MUST throw on failure/empty. */
  fetchArchive: () => Promise<TArchive>;

  /** Destructively clear the runtime project tree (node_modules/.git already excluded). */
  clearTree: () => Promise<void>;

  /** Import the fetched archive back into the runtime. */
  applyArchive: (archive: TArchive) => Promise<void>;
}): Promise<void> {
  // Fetch FIRST. If this throws, we return before clearTree — pod files survive.
  const archive = await steps.fetchArchive();

  // Only now that a valid archive is in hand is it safe to wipe + reimport.
  await steps.clearTree();
  await steps.applyArchive(archive);
}
