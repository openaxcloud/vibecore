/**
 * Lecture d'UNE valeur de secret, sur geste explicite.
 *
 * La liste des secrets n'en porte aucune : `listProjectSecrets` retire
 * `valueEncrypted` et n'expose pas de `value`. Toute vue qui attendait la
 * valeur dans la liste affichait donc des points et des boutons éteints —
 * mesuré sur la carte « Connection string » de l'onglet Paramètres de la base.
 *
 * La règle est la même partout : la valeur ne circule QUE lorsqu'on la
 * réclame, par la route de révélation. Ce module est le seul endroit qui la
 * connaît, pour que le panneau Secrets et la base ne divergent pas.
 */
export async function revelerUnSecret(projectId: string | undefined, key: string): Promise<string | undefined> {
  if (!projectId) {
    return undefined;
  }

  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets?reveal=true&confirm=1&key=${encodeURIComponent(key)}`,
    { headers: { accept: 'application/json' } },
  );

  const result = (await response.json().catch(() => null)) as { data?: { secret?: { value?: unknown } } } | null;
  const value = result?.data?.secret?.value;

  return response.ok && typeof value === 'string' ? value : undefined;
}
