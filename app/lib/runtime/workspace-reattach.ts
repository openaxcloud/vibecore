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
