import { EditorAdapter } from '@vibecore/editor';
import { useEffect, useState } from 'react';
import { EditorHistoryOverlay } from '~/components/workbench/EditorHistoryOverlay';
import { fileHistoryStore } from '~/lib/stores/fileHistory';

/**
 * DEV-ONLY harness reproducing the File History panel OVER the real Monaco
 * EditorAdapter (the workbench editor), so the panel opacity/stacking can be
 * inspected and fixed locally. URL: /dev/fh-monaco?theme=dark|light
 */

const FILE = '/home/project/src/greeting.ts';
const V = [
  "export function greeting(name) {\n  return 'Hello ' + name;\n}\n",
  'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n',
  "export function greeting(name, p = '!') {\n  return `Hello, ${name}${p}`;\n}\n",
];

export function loader() {
  if (import.meta.env.PROD) {
    throw new Response('Not found', { status: 404 });
  }

  return null;
}

export default function DevFhMonaco() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
    const r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.classList.toggle('dark', theme === 'dark');
    r.classList.toggle('light', theme === 'light');

    void (async () => {
      fileHistoryStore.configure(`dev-monaco-${Date.now()}`);
      for (const [i, c] of V.entries()) {
        await fileHistoryStore.capture(FILE, c, i === 0 ? 'initial' : 'save');
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return null;
  }

  const latest = V[V.length - 1];

  return (
    <div className="h-screen w-screen bg-bolt-elements-background-depth-1">
      <div className="flex h-full flex-col">
        <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-sm text-bolt-elements-textSecondary">
          src/greeting.ts
        </div>
        <div className="relative h-full flex-1 overflow-hidden" data-testid="responsive-code-editor">
          <EditorAdapter
            className="h-full w-full"
            value={latest}
            filePath={FILE}
            theme="dark"
            projectFiles={{ [FILE]: latest }}
            onChange={() => {}}
            onSave={() => {}}
          />
          <EditorHistoryOverlay filePath={FILE} content={latest} />
        </div>
      </div>
    </div>
  );
}
