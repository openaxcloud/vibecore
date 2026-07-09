import { describe, expect, it } from 'vitest';

import { hasDefaultExport } from './entry-export-reconcile';
import {
  detectUnresolvedImports,
  parseRelativeSpecifiers,
  reconcileAllDefaultExports,
  runProjectDoctor,
} from './project-doctor';

describe('parseRelativeSpecifiers', () => {
  it('collects relative import specifiers, ignoring package imports', () => {
    const content = [
      `import App from './App';`,
      `import { Button } from './components/Button';`,
      `import React from 'react';`,
      `import './index.css';`,
    ].join('\n');

    expect(parseRelativeSpecifiers(content).sort()).toEqual(['./App', './components/Button', './index.css']);
  });
});

describe('reconcileAllDefaultExports (generalised beyond the App entry)', () => {
  it('fixes a default import of a named-only component that is NOT the entry', () => {
    const files = {
      'src/App.tsx': `import Sidebar from './components/Sidebar';\nexport default function App() { return <Sidebar />; }`,
      'src/components/Sidebar.tsx': `export function Sidebar() { return <aside/>; }`,
    };

    const fixups = reconcileAllDefaultExports(files);

    expect(Object.keys(fixups)).toEqual(['src/components/Sidebar.tsx']);
    expect(hasDefaultExport(fixups['src/components/Sidebar.tsx'])).toBe(true);
  });

  it('fixes the entry AND a deep component in one pass', () => {
    const files = {
      'src/main.tsx': `import App from './App';\nrender(<App/>);`,
      'src/App.tsx': `import Card from './Card';\nexport function App(){ return <Card/>; }`,
      'src/Card.tsx': `export function Card(){ return <div/>; }`,
    };

    const fixups = reconcileAllDefaultExports(files);
    expect(Object.keys(fixups).sort()).toEqual(['src/App.tsx', 'src/Card.tsx']);
    expect(hasDefaultExport(fixups['src/App.tsx'])).toBe(true);
    expect(hasDefaultExport(fixups['src/Card.tsx'])).toBe(true);
  });

  it('does not touch modules that already default-export or lack a matching named binding', () => {
    const files = {
      'src/main.tsx': `import App from './App';\nimport Missing from './Missing';`,
      'src/App.tsx': `export default function App(){ return null; }`,
      'src/Missing.tsx': `export const Something = 1;`,
    };

    expect(reconcileAllDefaultExports(files)).toEqual({});
  });
});

describe('detectUnresolvedImports', () => {
  it('flags an import that resolves to no file and no synthesizable barrel', () => {
    const files = {
      'src/App.tsx': `import { Widget } from './Widget';\nexport default function App(){ return <Widget/>; }`,
    };

    const unresolved = detectUnresolvedImports(files);
    expect(unresolved).toEqual([{ importer: 'src/App.tsx', specifier: './Widget' }]);
  });

  it('does NOT flag a directory import a barrel would be synthesized for', () => {
    const files = {
      'src/App.tsx': `import { Button } from './components';`,
      'src/components/Button.tsx': `export function Button(){ return null; }`,
    };

    // ./components has direct modules → synthesizeMissingBarrels creates the index → resolved.
    expect(detectUnresolvedImports(files)).toEqual([]);
  });

  it('ignores css/json/asset imports', () => {
    const files = { 'src/main.tsx': `import './index.css';\nimport data from './data.json';` };
    expect(detectUnresolvedImports(files)).toEqual([]);
  });

  it('resolves a normal sibling component', () => {
    const files = {
      'src/App.tsx': `import Card from './Card';`,
      'src/Card.tsx': `export default function Card(){ return null; }`,
    };
    expect(detectUnresolvedImports(files)).toEqual([]);
  });
});

describe('runProjectDoctor', () => {
  it('reconciles exports and reports a healthy graph', () => {
    const files = {
      'src/main.tsx': `import App from './App';\nrender(<App/>);`,
      'src/App.tsx': `export function App(){ return <div/>; }`,
    };

    const result = runProjectDoctor(files);
    expect(hasDefaultExport(result.fixups['src/App.tsx'])).toBe(true);
    expect(result.unresolved).toEqual([]);
    expect(result.healthy).toBe(true);
    expect(result.findings.some((f) => f.kind === 'default-export-added')).toBe(true);
  });

  it('flags an unmountable graph (missing module) as unhealthy with a clear finding', () => {
    const files = {
      'src/main.tsx': `import App from './App';`,
      'src/App.tsx': `import Chart from './Chart';\nexport default function App(){ return <Chart/>; }`,
    };

    const result = runProjectDoctor(files);
    expect(result.healthy).toBe(false);
    expect(result.unresolved).toEqual([{ importer: 'src/App.tsx', specifier: './Chart' }]);
    expect(result.findings.find((f) => f.kind === 'unresolved-import')?.detail).toContain('./Chart');
  });
});
