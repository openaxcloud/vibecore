/*
 * Extraction des fichiers émis par l'agent dans un message assistant.
 *
 * Ce chemin est le pendant SERVEUR du parser client (`app/lib/runtime/
 * message-parser.ts`) : c'est lui qui persiste les fichiers du projet. Les deux
 * doivent traiter le redémarrage de génération de la même façon, sinon le
 * storage et le runtime divergent — et le reconcile propage ensuite la version
 * corrompue.
 */

/**
 * Chemin projet normalisé, ou une valeur falsy si le chemin sort de
 * l'arborescence. Le paramètre est optionnel et le retour accepte
 * `null | undefined` pour coller à l'implémentation d'`app.ts`, qui est le seul
 * appelant réel : c'est elle qui fait autorité sur ce qu'est un chemin valide.
 */
export type NormalizeProjectPath = (value?: string) => string | null | undefined;

export function boltActionAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;

  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source))) {
    attributes[match[1]] = match[3];
  }

  return attributes;
}

export function boltFileActionsFromContent(content: string, normalizeProjectPath: NormalizeProjectPath) {
  const files: Array<{ path: string; content: string }> = [];
  const actionPattern = /<boltAction\b([^>]*)>([\s\S]*?)<\/boltAction>/gi;

  let match: RegExpExecArray | null;

  while ((match = actionPattern.exec(content))) {
    /*
     * BUG-AGENT-005 — le modèle peut REDÉMARRER un fichier en plein milieu.
     *
     * Au plafond de jetons il reprend dans le même message : prose, puis un
     * nouveau `<boltArtifact>` / `<boltAction>` qui ré-émet le fichier entier.
     * Il n'y a alors qu'UN seul `</boltAction>`, tout à la fin — et comme la
     * capture est paresseuse, `match[2]` avale tout : le partiel tronqué, la
     * prose, ET le balisage de la reprise.
     *
     * Constaté en réel sur `src/index.css` : le balisage brut se retrouvait
     * dans la feuille livrée, où il était parsé comme un SÉLECTEUR — toutes les
     * règles suivantes héritaient du préfixe du dernier sélecteur ouvert et la
     * media query responsive ne matchait plus rien. L'app PUBLIÉE perdait sa
     * mise en page mobile, alors que l'aperçu de développement était correct.
     *
     * Un ouvrant présent DANS le contenu signale donc une reprise : seul le
     * segment qui suit le DERNIER ouvrant est du contenu réel, et ce sont ses
     * attributs qui font foi (le modèle peut viser un autre fichier).
     */
    let attributs = match[1];
    let corps = match[2];

    const ouvrant = /<boltAction\b([^>]*)>/gi;

    let dernierOuvrant: RegExpExecArray | null = null;
    let candidat: RegExpExecArray | null;

    while ((candidat = ouvrant.exec(corps))) {
      dernierOuvrant = candidat;
    }

    if (dernierOuvrant) {
      attributs = dernierOuvrant[1];
      corps = corps.slice(dernierOuvrant.index + dernierOuvrant[0].length);
    }

    const attributes = boltActionAttributes(attributs);

    if (attributes.type !== 'file' || !attributes.filePath) {
      continue;
    }

    const normalizedPath = normalizeProjectPath(attributes.filePath);

    if (!normalizedPath) {
      continue;
    }

    files.push({ path: normalizedPath, content: corps.replace(/^\n/, '').replace(/\n$/, '') });
  }

  return files;
}
