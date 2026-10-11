/** Routes de l'audit qui rendent la coque IDE sans sélecteur de langue global. */
export function isIdeShellPath(path: string): boolean {
  return /^\/projects\/[^/]+\/(ide|git|preview)$/u.test(path);
}
