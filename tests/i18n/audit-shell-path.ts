/** Classify the effective browser URL after redirects, never the requested legacy route. */
export function isIdeShellPath(destination: string): boolean {
  const { pathname } = new URL(destination, 'https://audit.invalid');

  return (
    /^\/projects\/[^/]+\/(ide|git|preview)$/u.test(pathname) || /^\/(?:@|%40)[^/]+\/[^/]+(?:\/ide)?$/iu.test(pathname)
  );
}
