/**
 * Rollup `manualChunks` for the client bundle, extracted from `vite.config.ts`
 * so the chunking rules can be unit-tested. Two of them exist purely to stop
 * heavy vendor chunks leaking into EVERY page's critical path — a defect that
 * is invisible in review and only shows up in the built manifest, so it needs a
 * regression test rather than a comment. See BUG-PERF-LOAD.
 */
export function manualChunks(id: string): string | undefined {
  /*
   * Vite's virtual preload helper (`__vitePreload`) must NEVER be
   * co-located with a heavy vendor chunk. Every chunk that performs a
   * dynamic `import()` statically imports this helper, so when Rollup
   * happened to place it inside `vendor-monaco-core`, the root chunk —
   * i.e. EVERY page, marketing included — gained a static import of
   * the 2.28 MB monaco bundle (573 KB over the wire) just to call a
   * ~20-line function. Measured on prod 2026-08-12:
   * `import{_ as qe}from"./vendor-monaco-core-*.js"` in `root-*.js`,
   * used only as `qe(async()=>await import("./debugLogger-*.js"))`.
   * Pinning it to its own chunk keeps that edge tiny. See BUG-PERF-LOAD.
   */
  if (id.includes('vite/preload-helper')) {
    return 'vendor-vite-helpers';
  }

  if (!id.includes('/node_modules/')) {
    return undefined;
  }

  /*
   * Stylesheet / `?url` asset modules carry the owning package's path
   * in their id, so the package rules below would map them into that
   * package's JS chunk. `root.tsx` imports `@xterm/xterm/css/xterm.css?url`
   * purely to emit a <link rel="stylesheet">, and that alone pulled the
   * 324 KB `vendor-terminal` JS chunk onto every page
   * (`{rel:"stylesheet",href:gt}` with `gt` imported from it).
   * Leave assets unassigned so Rollup keeps them out of the JS chunks.
   */
  if (/\.(css|scss|sass|less|styl)(\?|$)/.test(id) || id.includes('?url')) {
    return undefined;
  }

  if (id.includes('/monaco-editor/')) {
    if (id.includes('/esm/vs/language/typescript/') || id.includes('/esm/vs/basic-languages/typescript/')) {
      return 'vendor-monaco-typescript';
    }

    if (id.includes('/esm/vs/language/css/') || id.includes('/esm/vs/basic-languages/css/')) {
      return 'vendor-monaco-css';
    }

    if (id.includes('/esm/vs/language/html/') || id.includes('/esm/vs/basic-languages/html/')) {
      return 'vendor-monaco-html';
    }

    if (id.includes('/esm/vs/language/json/') || id.includes('/esm/vs/basic-languages/json/')) {
      return 'vendor-monaco-json';
    }

    return 'vendor-monaco-core';
  }

  if (id.includes('/@codemirror/') || id.includes('/@lezer/')) {
    /*
     * Splitting CodeMirror core from its language packs produced a
     * circular chunk (lang-* re-imports core helpers that re-import
     * lang-*), which triggered "Cannot access 'dt' before
     * initialization" at runtime and left the page on a blank
     * shell. Keep CodeMirror + Lezer in a single chunk so module
     * initialization is deterministic.
     */
    return 'vendor-codemirror';
  }

  if (id.includes('/@xterm/')) {
    return 'vendor-terminal';
  }

  if (id.includes('/html2canvas/')) {
    return 'vendor-export-canvas';
  }

  if (id.includes('/jspdf/')) {
    return 'vendor-export-pdf';
  }

  if (id.includes('/lucide-react/')) {
    return 'vendor-icons';
  }

  /*
   * React, react-dom, scheduler, react-router, @radix-ui and jszip
   * are kept together. Splitting them produced cycles like
   *   vendor-react -> vendor-radix   -> vendor-react
   *   vendor-react -> vendor-router  -> vendor-react
   *   vendor-react -> vendor-export-zip -> vendor-react
   * which left react-dom's __SECRET_INTERNALS / radix's forwardRef
   * in the TDZ at runtime and crashed hydration ("black screen"
   * on the landing page).
   */
  if (
    id.includes('/react-dom/') ||
    id.includes('/react/') ||
    id.includes('/scheduler/') ||
    id.includes('/react-router/') ||
    id.includes('/@react-router/') ||
    id.includes('/@radix-ui/') ||
    id.includes('/jszip/')
  ) {
    return 'vendor-react';
  }

  return undefined;
}
