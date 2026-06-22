import { describe, expect, it } from 'vitest';

import { extractRelativeImports, topologicallySortFileActions, type TopologicalFileAction } from './topological-apply';

function action(filePath: string, content: string): TopologicalFileAction {
  return { filePath, content };
}

describe('extractRelativeImports', () => {
  it('finds named, default, namespace, and re-export specifiers', () => {
    const source = [
      "import defaultExport from './default-export';",
      "import { named } from './named';",
      "import * as ns from '../shared/ns';",
      "export { reexport } from './reexport';",
      "import('./dynamic').then(() => {});",
    ].join('\n');

    const imports = extractRelativeImports(source).sort();
    expect(imports).toEqual(['../shared/ns', './default-export', './dynamic', './named', './reexport']);
  });

  it('ignores absolute / package specifiers', () => {
    const source = [
      "import { useEffect } from 'react';",
      "import { z } from 'zod';",
      "import config from '@vibecore/config';",
    ].join('\n');

    expect(extractRelativeImports(source)).toEqual([]);
  });
});

describe('topologicallySortFileActions', () => {
  it('returns the input verbatim when there is no graph', () => {
    const inputs = [action('src/A.ts', ''), action('src/B.ts', '')];
    const result = topologicallySortFileActions(inputs);

    expect(result.cyclic).toBe(false);
    expect(result.ordered.map((a) => a.filePath)).toEqual(['src/A.ts', 'src/B.ts']);
  });

  it('places imported siblings before importers', () => {
    const inputs = [
      action('src/App.ts', "import { helper } from './lib/helper';\nexport const App = () => helper();"),
      action('src/lib/helper.ts', 'export const helper = () => 42;'),
    ];

    const result = topologicallySortFileActions(inputs);

    expect(result.cyclic).toBe(false);
    expect(result.ordered.map((a) => a.filePath)).toEqual(['src/lib/helper.ts', 'src/App.ts']);
  });

  it('handles chained dependencies in dependency order', () => {
    const inputs = [
      action('src/c.ts', "import { b } from './b';"),
      action('src/b.ts', "import { a } from './a';"),
      action('src/a.ts', 'export const a = 1;'),
    ];

    const result = topologicallySortFileActions(inputs);
    expect(result.ordered.map((a) => a.filePath)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('resolves implicit extensions so import "./foo" matches foo.ts', () => {
    const inputs = [
      action('src/main.ts', "import './bootstrap';"),
      action('src/bootstrap.ts', 'export const ready = true;'),
    ];

    expect(topologicallySortFileActions(inputs).ordered.map((a) => a.filePath)).toEqual([
      'src/bootstrap.ts',
      'src/main.ts',
    ]);
  });

  it('resolves directory imports to index.ts', () => {
    const inputs = [
      action('src/app.ts', "import { thing } from './ui';"),
      action('src/ui/index.ts', 'export const thing = 1;'),
    ];

    expect(topologicallySortFileActions(inputs).ordered.map((a) => a.filePath)).toEqual([
      'src/ui/index.ts',
      'src/app.ts',
    ]);
  });

  it('falls back to source order on cycles and reports the participants', () => {
    const inputs = [action('src/a.ts', "import './b';"), action('src/b.ts', "import './a';")];

    const result = topologicallySortFileActions(inputs);
    expect(result.cyclic).toBe(true);
    expect(result.cycleParticipants.sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.ordered.map((a) => a.filePath)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('ignores imports that point outside the input set', () => {
    const inputs = [
      action('src/app.ts', "import 'react';\nimport { z } from 'zod';\nimport './lib';"),
      action('src/lib.ts', 'export const z = 1;'),
    ];

    const result = topologicallySortFileActions(inputs);
    expect(result.cyclic).toBe(false);
    expect(result.ordered.map((a) => a.filePath)).toEqual(['src/lib.ts', 'src/app.ts']);
  });

  it('keeps every action when two inputs normalise to the same key', () => {
    /*
     * Regression: two pending proposals targeting the same path used to
     * collapse into a single node — one of the two ids was silently
     * dropped from `ordered`, so an accepted patch never got applied,
     * while the non-cyclic count guard still passed.
     */
    const inputs = [
      { filePath: 'src/dup.ts', content: 'export const v = 1;', id: 'first' },
      { filePath: './src/dup.ts', content: 'export const v = 2;', id: 'second' },
    ];

    const result = topologicallySortFileActions(inputs);

    expect(result.cyclic).toBe(false);

    // Both distinct action objects (and their ids) must survive, no duplicates.
    expect(result.ordered).toHaveLength(2);
    expect(result.ordered.map((a) => a.id).sort()).toEqual(['first', 'second']);
  });

  it('preserves duplicate-key actions alongside a real import edge', () => {
    const inputs = [
      { filePath: 'src/app.ts', content: "import './dup';\nexport const app = 1;", id: 'app' },
      { filePath: 'src/dup.ts', content: 'export const v = 1;', id: 'dup-a' },
      { filePath: './src/dup.ts', content: 'export const v = 2;', id: 'dup-b' },
    ];

    const result = topologicallySortFileActions(inputs);

    expect(result.cyclic).toBe(false);
    expect(result.ordered).toHaveLength(3);

    // All three ids survive — none silently dropped.
    expect(result.ordered.map((a) => a.id).sort()).toEqual(['app', 'dup-a', 'dup-b']);

    // The collapsed dependency (dup) still lands before its importer (app).
    const ids = result.ordered.map((a) => a.id);
    expect(ids.indexOf('app')).toBeGreaterThan(ids.indexOf('dup-a'));
    expect(ids.indexOf('app')).toBeGreaterThan(ids.indexOf('dup-b'));
  });
});
