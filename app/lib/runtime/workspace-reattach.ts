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

  return signals.reused && signals.seededThisSession && signals.hasLivePort;
}
