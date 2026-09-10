/**
 * True when an assistant response contains at least one file-writing action —
 * a `<boltAction type="file" …>` block that the runtime applies to disk.
 *
 * A build-mode generation that finishes with NONE of these produced nothing
 * usable: a weak model (e.g. gpt-3.5-turbo) narrates the plan in prose instead
 * of emitting the artifact actions, so no files land, the preview stays PENDING,
 * and the run "completes" with only a README. Detecting the zero-file case lets
 * the chat surface a clear, actionable message instead of a silent stall.
 *
 * Matches either attribute order (`type` before or after `filePath`) and single
 * or double quotes, tolerating extra whitespace around `=`.
 */
export function responseEmittedFileAction(text: string): boolean {
  return compterActionsDeFichier(text) > 0;
}

/**
 * COMBIEN de fichiers la réponse a émis, et non pas seulement « au moins un ».
 *
 * Le prédicat booléen ci-dessus suffisait à afficher un message ; il ne suffit
 * pas au critère d'aptitude d'un fournisseur, qui raisonne sur un NOMBRE
 * (`fichiersEcrits === 0`). Passer `1` pour « au moins un » aurait rendu le
 * constat faux dès qu'on voudrait en lire autre chose que la nullité — et un
 * constat approximatif est précisément ce qui fait prendre une décision de
 * repli sur une mesure qu'on n'a pas faite.
 *
 * Une seule expression pour les deux fonctions : le prédicat DÉRIVE du compte,
 * il n'en est pas une seconde version. Deux régularités qui divergent au
 * prochain refactor, c'est deux vérités pour un fait.
 */
export function compterActionsDeFichier(text: string): number {
  if (!text) {
    return 0;
  }

  return text.match(/<boltAction\b[^>]*\btype\s*=\s*["']file["']/gi)?.length ?? 0;
}
