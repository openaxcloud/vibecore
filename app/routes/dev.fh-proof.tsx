import { useEffect, useState } from 'react';
import { EditorHistoryOverlay } from '~/components/workbench/EditorHistoryOverlay';
import { FileHistoryPanel } from '~/components/workbench/FileHistoryPanel';
import { fileHistoryStore } from '~/lib/stores/fileHistory';

/**
 * DEV-ONLY visual harness for the File History panel (RPL-FH-001.*). Mounts the
 * real EditorHistoryOverlay + FileHistoryPanel with the production styles/theme
 * and a seeded store, so the panel can be captured responsively (390/768/1024/
 * 1440, light/dark) without the workspace backend. Not wired into any nav; safe
 * to leave behind a dev guard. URL: /dev/fh-proof?theme=dark|light
 */

const FILE = '/home/project/src/greeting.ts';

const VERSIONS = [
  "export function greeting(name) {\n  return 'Hello ' + name;\n}\n",
  'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n',
  "export function greeting(name, punctuation = '!') {\n  return `Hello, ${name}${punctuation}`;\n}\n",
  "export function greeting(name, punctuation = '!') {\n  const trimmed = String(name).trim();\n  return `Hello, ${trimmed || 'friend'}${punctuation}`;\n}\n",
];

export default function DevFileHistoryProof() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'ready' | 'error'>('ready');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme') === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');

    let cancelled = false;

    void (async () => {
      if (params.get('state') === 'error') {
        // No project configured → the panel renders its error/retry state.
        fileHistoryStore.configure(undefined);
        setMode('error');
        setReady(true);

        return;
      }

      // Fresh project id per load keeps the seed deterministic across reloads.
      fileHistoryStore.configure(`dev-proof-${Date.now()}`);

      for (const [index, content] of VERSIONS.entries()) {
        await fileHistoryStore.capture(FILE, content, index === 0 ? 'initial' : 'save');
      }

      if (!cancelled) {
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return null;
  }

  const latest = VERSIONS[VERSIONS.length - 1];

  return (
    <div className="h-screen w-screen bg-bolt-elements-background-depth-1">
      <div className="relative h-full w-full overflow-hidden" data-testid="responsive-code-editor">
        <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-sm text-bolt-elements-textSecondary">
          src/greeting.ts
        </div>
        <pre className="m-0 h-full overflow-auto p-4 font-mono text-xs text-bolt-elements-textPrimary">{latest}</pre>
        {mode === 'error' ? (
          <FileHistoryPanel filePath={FILE} currentContent={latest} onClose={() => {}} />
        ) : (
          <EditorHistoryOverlay filePath={FILE} content={latest} />
        )}
      </div>
    </div>
  );
}
