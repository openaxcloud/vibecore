/**
 * Empêche l'entrée Vite de pointer dans le vide pendant la génération.
 *
 * `src/main.tsx` importe `./App` dès qu'il est écrit, mais l'agent crée souvent
 * `src/App.tsx` BIEN plus tard — il génère d'abord les composants, les contextes,
 * les adaptateurs. Entre les deux, Vite répète à chaque requête :
 *
 *     [vite] Pre-transform error: Failed to resolve import "./App" from
 *     "src/main.tsx". Does the file exist?
 *
 * Constaté en production : l'aperçu reste blanc et le compteur d'erreurs monte
 * sans fin (29 → 66 → 96 → 170) pendant toute la génération. L'utilisateur ne
 * voit qu'une page blanche couverte d'erreurs pour un projet qui, lui, se
 * construit normalement.
 *
 * On écrit donc un module d'attente à la place manquante, dès que l'entrée le
 * réclame. Deux effets d'un seul geste : l'import résout — donc plus d'erreurs
 * — et l'aperçu affiche un état « génération en cours » propre au lieu d'un
 * blanc.
 *
 * Trois garde-fous délibérés :
 *   - on n'écrase JAMAIS un fichier existant : le module n'est écrit que si
 *     AUCUN candidat ne se lit. Quand l'agent écrit le vrai fichier, il le
 *     remplace, et l'appel suivant ne fait plus rien ;
 *   - seuls les imports RELATIFS de l'entrée sont concernés — un paquet manquant
 *     est une vraie erreur, qui doit rester visible ;
 *   - aucune JSX. Le module d'attente passe par `createElement`, donc il compile
 *     que le projet utilise la transformation JSX automatique ou l'ancienne.
 */
import {
  parseDefaultImports,
  resolveSiblingCandidates,
  ENTRY_CANDIDATES,
  type ReconcileRuntime,
} from './entry-export-reconcile';

/** Marqueur qui identifie nos modules d'attente, pour ne jamais les confondre avec du code de l'utilisateur. */
export const PLACEHOLDER_MARKER = '@vibecore-generation-placeholder';

/**
 * Source d'un module d'attente exportant `<nom>` par défaut.
 *
 * Le texte est volontairement neutre et bilingue-agnostique : il est lu dans
 * l'aperçu de l'application générée, qui n'a pas notre catalogue i18n.
 */
export function placeholderModuleSource(name: string): string {
  return `/* ${PLACEHOLDER_MARKER} — remplacé automatiquement dès que l'agent écrit ce fichier. */
import { createElement } from 'react';

export default function ${name}() {
  return createElement(
    'div',
    {
      style: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        color: '#8b949e',
        background: '#0d1117',
        textAlign: 'center',
      },
    },
    createElement(
      'div',
      null,
      createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: '#f0f6fc' } }, 'Génération en cours…'),
      createElement(
        'div',
        { style: { fontSize: '13px', marginTop: '8px' } },
        'Cet écran laissera place à votre application dès que l’agent aura écrit ce fichier.',
      ),
    ),
  );
}
`;
}

/** Nom de composant valide dérivé du chemin, pour que le module compile. */
export function componentNameFor(spec: string): string {
  const base = spec.split('/').filter(Boolean).pop() ?? 'Placeholder';
  const cleaned = base.replace(/[^A-Za-z0-9]/g, ' ').trim();

  const pascal = cleaned
    .split(/\s+/)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join('');

  return /^[A-Za-z]/.test(pascal) ? pascal : `Placeholder${pascal}`;
}

async function lisible(runtime: ReconcileRuntime, chemin: string): Promise<boolean> {
  try {
    return typeof (await runtime.readFile(chemin)) === 'string';
  } catch {
    return false;
  }
}

/**
 * Après l'écriture de l'entrée, crée un module d'attente pour chacun de ses
 * imports relatifs par défaut encore absents. Renvoie les chemins créés.
 *
 * Au mieux : toute erreur d'entrée-sortie est avalée, cette passe ne doit jamais
 * bloquer ni casser l'écriture qu'elle accompagne.
 */
export async function ensureEntryImportsResolvable(runtime: ReconcileRuntime, writtenPath: string): Promise<string[]> {
  if (!ENTRY_CANDIDATES.includes(writtenPath)) {
    return [];
  }

  let contenuEntree: string | undefined;

  try {
    const lu = await runtime.readFile(writtenPath);
    contenuEntree = typeof lu === 'string' ? lu : undefined;
  } catch {
    return [];
  }

  if (!contenuEntree) {
    return [];
  }

  const crees: string[] = [];

  for (const { spec } of parseDefaultImports(contenuEntree)) {
    const candidats = resolveSiblingCandidates(writtenPath, spec);

    let existe = false;

    for (const candidat of candidats) {
      if (await lisible(runtime, candidat)) {
        existe = true;
        break;
      }
    }

    if (existe) {
      continue;
    }

    /*
     * Le module est écrit à l'extension de l'ENTRÉE : c'est celle que l'agent
     * utilisera pour le vrai fichier, donc celle qu'il écrasera. Écrire un `.jsx`
     * à côté d'un projet en TypeScript laisserait deux fichiers concurrents.
     */
    const extension = writtenPath.endsWith('.tsx') || writtenPath.endsWith('.ts') ? 'tsx' : 'jsx';
    const cible = `${resolveSiblingCandidates(writtenPath, spec)[0]}.${extension}`;

    try {
      await runtime.writeFile(cible, placeholderModuleSource(componentNameFor(spec)));
      crees.push(cible);
    } catch {
      // Au mieux : un module d'attente non écrit n'est pas une raison d'échouer.
    }
  }

  return crees;
}
