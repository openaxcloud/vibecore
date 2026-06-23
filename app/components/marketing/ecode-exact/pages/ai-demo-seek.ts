/**
 * Pure helpers for the AI marketing page demo-video "jump to segment" cards.
 *
 * All three highlight cards point at the SAME shared asset
 * (`/assets/platform-demo.mp4`, ~1:12 total runtime). The previous version
 * hardcoded absolute cue offsets (0s, 65s, 132s) and fabricated per-card
 * durations (5:23, 3:45, 4:15) describing demos that do not exist. Cues of
 * 65s/132s overshoot the real clip and clamp to the tail, so two of the three
 * cards jumped to the same end-of-video frame.
 *
 * Instead we express each highlight's start as a fraction of the real video
 * (`position`, 0..1) and resolve it to an in-bounds timestamp at seek time
 * using the actual, loaded `duration`.
 */

/**
 * Resolve a highlight's relative position (0..1) to a concrete, in-bounds
 * timestamp for the given video duration.
 *
 * - Returns 0 when the duration is not yet known / not finite (e.g. metadata
 *   has not loaded), so seeking degrades to "play from the start" rather than
 *   landing on a NaN currentTime.
 * - Clamps the position into [0, 1] and the result strictly below `duration`
 *   so the seek never overshoots to the very end of the clip.
 */
export function resolveSeekTime(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const clampedPosition = Math.min(Math.max(Number.isFinite(position) ? position : 0, 0), 1);

  /*
   * Keep a small margin from the absolute end so two distinct cards never both
   * resolve to the final frame, and so playback has something left to show.
   */
  const target = clampedPosition * duration;
  const maxTarget = Math.max(0, duration - 0.5);

  return Math.min(target, maxTarget);
}

/**
 * Minimal structural view of the bits of `HTMLVideoElement` the play helper
 * touches. Kept narrow so the helper is unit-testable with a plain stub instead
 * of a full DOM video element.
 */
export interface PlayableVideo {
  play: () => Promise<void> | void;
}

/**
 * Start playback and report whether it actually began, driving the
 * `isVideoPlaying` flag off the real `play()` result rather than an optimistic
 * guess.
 *
 * The overlay (play/pause toggle, dimmed scrim) is hidden while
 * `isVideoPlaying` is true. The previous code set the flag to `true`
 * immediately and discarded the promise returned by `play()`. If `play()`
 * rejects — autoplay/gesture policy, a decode error, or a missing/404 source —
 * no `play` event ever fires, so the `onPlay` handler never corrects the
 * state: the overlay stays hidden and the button reads "Pause Demo" even though
 * nothing is playing, leaving the user with no visible control to start it.
 *
 * Here we await the promise and only commit `true` on success, reverting to
 * `false` on rejection. `onPlay`/`onPause` remain the live source of truth;
 * this just stops a rejected `play()` from stranding the overlay.
 *
 * Older browsers return `undefined` (no promise) from `play()`; in that case we
 * optimistically report `true` and let the `play`/`pause` events reconcile.
 */
export async function playVideoAndSyncState(
  video: PlayableVideo,
  setIsVideoPlaying: (playing: boolean) => void,
): Promise<boolean> {
  try {
    const result = video.play();

    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }

    setIsVideoPlaying(true);

    return true;
  } catch {
    setIsVideoPlaying(false);

    return false;
  }
}
