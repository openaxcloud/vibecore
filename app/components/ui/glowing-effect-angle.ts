/**
 * Resolve a `targetAngle` to an absolute angle relative to `currentAngle`,
 * unwrapping the wrap-around at 360deg so the glow tween animates the short way
 * around the circle rather than spinning all the way back. Both inputs are in
 * degrees.
 *
 * JavaScript's `%` keeps the sign of the dividend, so the raw delta lands in
 * the range (-360, 360); normalising it into [-180, 180] guarantees the tween
 * never rotates more than half a turn.
 */
export function computeShortestAngle(currentAngle: number, targetAngle: number): number {
  let angleDiff = (targetAngle - currentAngle) % 360;

  if (angleDiff > 180) {
    angleDiff -= 360;
  } else if (angleDiff < -180) {
    angleDiff += 360;
  }

  return currentAngle + angleDiff;
}
