import { describe, expect, it } from 'vitest';
import { manualChunks } from './manual-chunks';

/*
 * BUG-PERF-LOAD, second root cause.
 *
 * Measured on the deployed prod artifact (2026-08-12): the React Router
 * manifest declared 96 static `imports` for the ROOT route — i.e. every page,
 * marketing included — and two of them were pure bundling accidents worth
 * ~654 KB over the wire on every single page load:
 *
 *   root-*.js contained `import{_ as qe}from"./vendor-monaco-core-*.js"`
 *   and used `qe` only as `qe(async()=>await import("./debugLogger-*.js"))`.
 *   `qe` is Vite's `__vitePreload` helper: it had been co-located with the
 *   2.28 MB monaco chunk (573 KB compressed), so every chunk performing a
 *   dynamic import statically pulled monaco.
 *
 *   root-*.js contained `import{c as gt}from"./vendor-terminal-*.js"`
 *   and used `gt` only as `{rel:"stylesheet",href:gt}` — the xterm CSS URL
 *   (`app/root.tsx` imports `@xterm/xterm/css/xterm.css?url`). The `/@xterm/`
 *   rule matched the CSS *asset* id, filing a stylesheet URL inside the 324 KB
 *   terminal JS chunk.
 *
 * Both are invisible in review and only observable in the built manifest, hence
 * these tests.
 */

const NM = '/app/node_modules';

describe('manualChunks — heavy vendor chunks must not leak onto every page', () => {
  it("keeps Vite's preload helper out of any heavy vendor chunk", () => {
    // Vite 5 ids the virtual helper as `\0vite/preload-helper.js`.
    expect(manualChunks('\0vite/preload-helper.js')).toBe('vendor-vite-helpers');
    expect(manualChunks('\0vite/preload-helper')).toBe('vendor-vite-helpers');
  });

  it('never files a stylesheet asset into a package JS chunk', () => {
    // The exact import from app/root.tsx that dragged vendor-terminal everywhere.
    expect(manualChunks(`${NM}/@xterm/xterm/css/xterm.css?url`)).toBeUndefined();
    expect(manualChunks(`${NM}/@xterm/xterm/css/xterm.css`)).toBeUndefined();
    expect(manualChunks(`${NM}/monaco-editor/min/vs/editor/editor.main.css`)).toBeUndefined();
    expect(manualChunks(`${NM}/@codemirror/view/dist/index.css`)).toBeUndefined();
  });

  it('still groups the real JS of those packages as before', () => {
    expect(manualChunks(`${NM}/@xterm/xterm/lib/xterm.mjs`)).toBe('vendor-terminal');
    expect(manualChunks(`${NM}/monaco-editor/esm/vs/editor/editor.api.js`)).toBe('vendor-monaco-core');
    expect(manualChunks(`${NM}/monaco-editor/esm/vs/language/json/monaco.contribution.js`)).toBe(
      'vendor-monaco-json',
    );
    expect(manualChunks(`${NM}/@codemirror/state/dist/index.js`)).toBe('vendor-codemirror');
    expect(manualChunks(`${NM}/@lezer/common/dist/index.js`)).toBe('vendor-codemirror');
    expect(manualChunks(`${NM}/lucide-react/dist/esm/lucide-react.js`)).toBe('vendor-icons');
    expect(manualChunks(`${NM}/react-dom/client.js`)).toBe('vendor-react');
  });

  it('leaves application code unassigned', () => {
    expect(manualChunks('/app/app/root.tsx')).toBeUndefined();
    expect(manualChunks('/app/app/components/chat/BaseChat.tsx')).toBeUndefined();
  });
});
