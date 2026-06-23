/**
 * Returns true only when `target` resolves to the exact same origin (scheme +
 * hostname + port) as `reference`. Used to gate in-window navigation so the
 * privileged preload bridge (auth-token getter, native dialogs) can never reach
 * an origin other than the app's own renderer URL — notably NOT other localhost
 * ports, where in-app previews and AI-generated user apps run.
 *
 * Both arguments must be absolute URLs; anything unparseable returns false.
 */
export function isSameOrigin(target: string, reference: string): boolean {
  try {
    const targetUrl = new URL(target);
    const referenceUrl = new URL(reference);

    return (
      targetUrl.protocol === referenceUrl.protocol &&
      targetUrl.hostname === referenceUrl.hostname &&
      targetUrl.port === referenceUrl.port
    );
  } catch {
    return false;
  }
}
