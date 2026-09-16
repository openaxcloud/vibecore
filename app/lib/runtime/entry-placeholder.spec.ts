import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  componentNameFor,
  ensureEntryImportsResolvable,
  placeholderModuleSource,
  PLACEHOLDER_MARKER,
} from './entry-placeholder';

/*
 * BUG-PREVIEW-ENTRY-001 — l'entrée pointe dans le vide pendant la génération.
 *
 * `src/main.tsx` importe `./App` dès son écriture, mais l'agent crée
 * `src/App.tsx` bien plus tard. Entre les deux, Vite répète à chaque requête
 * « Failed to resolve import "./App" from "src/main.tsx" » : aperçu blanc et
 * compteur d'erreurs qui monte sans fin (29 → 66 → 96 → 170 en production).
 */

function fauxRuntime(fichiers: Record<string, string>) {
  const ecrits: Record<string, string> = {};

  return {
    ecrits,
    runtime: {
      async readFile(chemin: string) {
        const contenu = fichiers[chemin] ?? ecrits[chemin];

        if (typeof contenu !== 'string') {
          throw new Error(`ENOENT ${chemin}`);
        }

        return contenu;
      },
      async writeFile(chemin: string, contenu: string) {
        ecrits[chemin] = contenu;
      },
    },
  };
}

const ENTREE =
  "import App from './App';\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')!).render(<App />);\n";

describe('module d’attente pour un import d’entrée non encore écrit', () => {
  it('crée le module manquant, à l’extension de l’entrée', async () => {
    const { runtime, ecrits } = fauxRuntime({ 'src/main.tsx': ENTREE });

    const crees = await ensureEntryImportsResolvable(runtime, 'src/main.tsx');

    expect(crees).toEqual(['src/App.tsx']);
    expect(ecrits['src/App.tsx']).toContain(PLACEHOLDER_MARKER);
    expect(ecrits['src/App.tsx']).toContain('export default function App()');
  });

  it('n’écrase JAMAIS un fichier existant', async () => {
    const { runtime, ecrits } = fauxRuntime({
      'src/main.tsx': ENTREE,
      'src/App.tsx': 'export default function App() { return null; }',
    });

    const crees = await ensureEntryImportsResolvable(runtime, 'src/main.tsx');

    expect(crees).toEqual([]);
    expect(ecrits['src/App.tsx']).toBeUndefined();
  });

  it('est idempotent : une fois posé, il ne se réécrit pas', async () => {
    const { runtime } = fauxRuntime({ 'src/main.tsx': ENTREE });

    await ensureEntryImportsResolvable(runtime, 'src/main.tsx');

    expect(await ensureEntryImportsResolvable(runtime, 'src/main.tsx')).toEqual([]);
  });

  it('ignore les imports de PAQUETS — un paquet manquant est une vraie erreur', async () => {
    const { runtime, ecrits } = fauxRuntime({
      'src/main.tsx': "import React from 'react';\nimport ReactDOM from 'react-dom/client';\n",
    });

    expect(await ensureEntryImportsResolvable(runtime, 'src/main.tsx')).toEqual([]);
    expect(Object.keys(ecrits)).toEqual([]);
  });

  it('ne fait rien quand le fichier écrit n’est pas une entrée', async () => {
    const { runtime } = fauxRuntime({ 'src/components/Card.tsx': "import X from './X';" });

    expect(await ensureEntryImportsResolvable(runtime, 'src/components/Card.tsx')).toEqual([]);
  });

  it('reconnaît une entrée JavaScript et pose un .jsx', async () => {
    const { runtime } = fauxRuntime({ 'src/main.jsx': "import App from './App';" });

    expect(await ensureEntryImportsResolvable(runtime, 'src/main.jsx')).toEqual(['src/App.jsx']);
  });

  it('n’utilise pas de JSX, pour compiler quelle que soit la transformation', () => {
    const source = placeholderModuleSource('App');

    expect(source).toContain('createElement');
    expect(source).not.toMatch(/<[A-Za-z]/u);
  });

  it('dérive un nom de composant valide de n’importe quel chemin', () => {
    expect(componentNameFor('./App')).toBe('App');
    expect(componentNameFor('./components/user-card')).toBe('UserCard');
    expect(componentNameFor('./1-first')).toBe('Placeholder1First');
  });

  it('annonce l’état au lieu de laisser un blanc', () => {
    expect(placeholderModuleSource('App')).toContain('Génération en cours');
  });
});

describe('câblage dans le chemin d’écriture', () => {
  /*
   * Leçon de #145 : un helper correct mais jamais appelé ne corrige rien. On
   * vérifie donc que la passe est bien branchée après l'écriture, à côté de la
   * réconciliation d'exports qui lui sert de précédent.
   */
  const runner = readFileSync('app/lib/runtime/action-runner.ts', 'utf8');

  it('la passe tourne après une écriture non-streamée', () => {
    expect(runner).toContain('ensureEntryImportsResolvable(');
    expect(runner).toContain("import { ensureEntryImportsResolvable } from './entry-placeholder'");
  });

  it('elle partage l’adaptateur de la réconciliation d’exports', () => {
    const bloc = runner.slice(
      runner.indexOf('ensureEntryImportsResolvable('),
      runner.indexOf('ensureEntryImportsResolvable(') + 400,
    );

    expect(bloc).toContain('this.#runtime.readFile(p)');
    expect(bloc).toContain('this.#runtime.writeFile(p, content)');
  });
});
