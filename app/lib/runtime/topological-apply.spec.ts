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
});
