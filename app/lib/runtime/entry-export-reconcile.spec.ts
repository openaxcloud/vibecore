import { describe, expect, it } from 'vitest';

import {
  appendDefaultExport,
  applyEntryExportReconcile,
  hasDefaultExport,
  hasNamedExport,
  parseDefaultImports,
  reconcileEntryDefaultExports,
  resolveSiblingCandidates,
  type ReconcileRuntime,
} from './entry-export-reconcile';

describe('parseDefaultImports', () => {
  it('captures relative default imports and ignores named/namespace/package/type imports', () => {
    const entry = [
      `import App from './App';`,
      `import { render } from 'react-dom';`,
      `import * as styles from './styles.css';`,
      `import type Cfg from './config';`,
      `import Layout, { Header } from './Layout';`,
      `import React from 'react';`,
    ].join('\n');

    expect(parseDefaultImports(entry)).toEqual([
      { localName: 'App', spec: './App' },
      { localName: 'Layout', spec: './Layout' },
    ]);
  });
});

describe('hasDefaultExport / hasNamedExport', () => {
  it('detects default exports in their common forms', () => {
    expect(hasDefaultExport('export default App;')).toBe(true);
    expect(hasDefaultExport('export default function App(){}')).toBe(true);
    expect(hasDefaultExport('const App=()=>{}\nexport { App as default };')).toBe(true);
    expect(hasDefaultExport('export function App(){}')).toBe(false);
  });

  it('detects named exports (declaration and clause forms)', () => {
    expect(hasNamedExport('export function App(){}', 'App')).toBe(true);
    expect(hasNamedExport('export const App = () => {}', 'App')).toBe(true);
    expect(hasNamedExport('export class App {}', 'App')).toBe(true);
    expect(hasNamedExport('const App=()=>{}\nexport { App };', 'App')).toBe(true);

    // Local binding App exported under an alias — still a usable local for `export default App`.
    expect(hasNamedExport('const App=()=>{}\nexport { App as Root };', 'App')).toBe(true);

    // `A as App` exports the NAME App but the local binding is A, not App — not usable for `export default App`.
    expect(hasNamedExport('const A=()=>{}\nexport { A as App };', 'App')).toBe(false);
    expect(hasNamedExport('export const Other = 1', 'App')).toBe(false);
  });
});

describe('resolveSiblingCandidates', () => {
  it('resolves ./App from src/main.tsx to src/App.<ext> and src/App/index.<ext>', () => {
    const cands = resolveSiblingCandidates('src/main.tsx', './App');
    expect(cands).toContain('src/App.tsx');
    expect(cands).toContain('src/App.jsx');
    expect(cands).toContain('src/App/index.tsx');

    // priority: extensionless first, then .tsx before index barrels
    expect(cands.indexOf('src/App.tsx')).toBeLessThan(cands.indexOf('src/App/index.tsx'));
  });
});

describe('reconcileEntryDefaultExports (the reported blank-app bug)', () => {
  it('appends `export default App` when main default-imports a named-only App', () => {
    const entry = `import App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);`;
    const files = { 'src/App.tsx': `export function App() {\n  return <div>hi</div>;\n}\n` };

    const fixups = reconcileEntryDefaultExports('src/main.tsx', entry, files);

    expect(Object.keys(fixups)).toEqual(['src/App.tsx']);
    expect(fixups['src/App.tsx']).toContain('export function App()');
    expect(fixups['src/App.tsx']).toMatch(/export default App;\n$/);
    expect(hasDefaultExport(fixups['src/App.tsx'])).toBe(true);
  });

  it('is a no-op when App already has a default export', () => {
    const entry = `import App from './App';`;
    const files = { 'src/App.tsx': `export default function App(){ return null; }` };
    expect(reconcileEntryDefaultExports('src/main.tsx', entry, files)).toEqual({});
  });

  it('does NOT touch a module with no matching named export (fails loudly instead)', () => {
    const entry = `import App from './App';`;
    const files = { 'src/App.tsx': `export const Widget = () => null;` };
    expect(reconcileEntryDefaultExports('src/main.tsx', entry, files)).toEqual({});
  });

  it('handles the barrel case: default import of ./components resolving to an index', () => {
    const entry = `import Components from './components';`;
    const files = { 'src/components/index.tsx': `export function Components(){ return null; }` };
    const fixups = reconcileEntryDefaultExports('src/main.tsx', entry, files);
    expect(fixups['src/components/index.tsx']).toMatch(/export default Components;\n$/);
  });
});

describe('appendDefaultExport', () => {
  it('appends a single trailing default export with clean spacing', () => {
    expect(appendDefaultExport('export function App(){}\n\n\n', 'App')).toBe(
      'export function App(){}\n\nexport default App;\n',
    );
  });
});

describe('applyEntryExportReconcile (orchestration, fake runtime)', () => {
  function fakeRuntime(initial: Record<string, string>): ReconcileRuntime & { files: Record<string, string> } {
    const files = { ...initial };

    return {
      files,
      async readFile(p) {
        return Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null;
      },
      async writeFile(p, content) {
        files[p] = content;
      },
    };
  }

  it('fixes App.tsx when the entry (main.tsx) is the file just written', async () => {
    const rt = fakeRuntime({
      'src/main.tsx': `import App from './App';\nrender(<App />);`,
      'src/App.tsx': `export function App(){ return null; }`,
    });

    const fixed = await applyEntryExportReconcile(rt, 'src/main.tsx');

    expect(fixed).toEqual(['src/App.tsx']);
    expect(hasDefaultExport(rt.files['src/App.tsx'])).toBe(true);
  });

  it('fixes App.tsx even when App.tsx is the file just written (order-independent)', async () => {
    const rt = fakeRuntime({
      'src/main.tsx': `import App from './App';\nrender(<App />);`,
      'src/App.tsx': `export function App(){ return null; }`,
    });

    const fixed = await applyEntryExportReconcile(rt, 'src/App.tsx');

    expect(fixed).toEqual(['src/App.tsx']);
    expect(hasDefaultExport(rt.files['src/App.tsx'])).toBe(true);
  });

  it('is idempotent — a second pass rewrites nothing', async () => {
    const rt = fakeRuntime({
      'src/main.tsx': `import App from './App';`,
      'src/App.tsx': `export function App(){ return null; }`,
    });

    await applyEntryExportReconcile(rt, 'src/main.tsx');

    const second = await applyEntryExportReconcile(rt, 'src/main.tsx');

    expect(second).toEqual([]);
  });

  it('does nothing for non-source writes and when there is no entry', async () => {
    const rt = fakeRuntime({ 'src/App.tsx': `export function App(){}` });
    expect(await applyEntryExportReconcile(rt, 'README.md')).toEqual([]);
    expect(await applyEntryExportReconcile(rt, 'src/App.tsx')).toEqual([]); // no entry present
  });
});
