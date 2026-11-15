/** Local disposable fixtures only. This guard does not authorize production load.
 * Deliberately accepts a narrow URL grammar instead of resolving DNS or relying
 * on a runtime-specific URL implementation. No credentials, query or fragment.
 * Request-level redirects: 0 is also required: CLI options can override options.
 */
export function requireLocalLoadTarget(env, target) {
  if (env.LOCAL_LOAD_PROOF !== '1') {
    throw new Error('Local load requires explicit LOCAL_LOAD_PROOF=1');
  }

  const match = typeof target === 'string'
    ? /^https?:\/\/(127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?(\/[A-Za-z0-9/_~.-]*)?$/.exec(target)
    : null;
  if (!match || match[0] !== target || (match[2] && Number(match[2]) > 65535)) {
    // Do not echo a rejected URL, which could contain credentials.
    throw new Error('Load target must be a direct loopback HTTP(S) URL without credentials, query or fragment');
  }

  return target.replace(/\/+$/, '');
}
