import { describe, expect, it } from 'vitest';
import {
  countWorkspaceFiles,
  decidePendingPromptReplay,
  extractGenerationPrompt,
  isUngeneratedProject,
  resolvePendingPrompt,
  shouldReplayPendingPrompt,
} from './pending-generation';
import type { FileMap } from '~/lib/stores/files';

const aiReadme = (prompt: string) =>
  `# Todo App\n\nThis project was created from an AI prompt. Application files are intentionally left for the IDE agent to produce as real generated output.\n\nGeneration context:\n\nArtifact type: web\n\nPrompt:\n\n${prompt}\n`;

describe('resolvePendingPrompt', () => {
  it('KEEPS the prompt when the generation wrote no files (failed/empty attempt)', () => {
    // README-only project (1 file) before and after — nothing was generated.
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 1, errored: false })).toBe('keep');
  });

  it('KEEPS the prompt when the generation stream errored, even if some files exist', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 5, errored: true })).toBe('keep');
  });

  it('CLEARS the prompt only after at least one new file was written', () => {
    // README (1) -> README + package.json + src/* (7): the agent produced the app.
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 7, errored: false })).toBe('clear');
  });

  it('CLEARS on a single new file (boundary)', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 0, finalFileCount: 1, errored: false })).toBe('clear');
  });

  it('KEEPS when the count somehow shrank (never treat that as success)', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 3, finalFileCount: 2, errored: false })).toBe('keep');
  });
});

describe('countWorkspaceFiles', () => {
  it('counts real files and ignores folders and pruned entries', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/src': { type: 'folder' },
      '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
      '/home/project/removed.ts': undefined,
    };
    expect(countWorkspaceFiles(files)).toBe(2);
  });

  it('returns 0 for an empty or undefined map', () => {
    expect(countWorkspaceFiles({})).toBe(0);
    expect(countWorkspaceFiles(undefined)).toBe(0);
  });
});

describe('isUngeneratedProject', () => {
  it('is true when the only real files are scaffolding (README / .gitignore)', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/.gitignore': { type: 'file', content: '', isBinary: false },
      '/home/project/src': { type: 'folder' },
    };
    expect(isUngeneratedProject(files)).toBe(true);
  });

  it('is false once the agent has produced real app files', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/package.json': { type: 'file', content: '', isBinary: false },
      '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
    };
    expect(isUngeneratedProject(files)).toBe(false);
  });

  it('is false for an empty workspace (nothing to regenerate yet)', () => {
    expect(isUngeneratedProject({})).toBe(false);
    expect(isUngeneratedProject(undefined)).toBe(false);
  });
});

describe('shouldReplayPendingPrompt', () => {
  it('replays the prompt for a scaffold-only project (README/.gitignore)', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/.gitignore': { type: 'file', content: '', isBinary: false },
    };
    expect(shouldReplayPendingPrompt(files)).toBe(true);
  });

  it('replays the prompt for an empty workspace (runtime not yet attached)', () => {
    expect(shouldReplayPendingPrompt({})).toBe(true);
    expect(shouldReplayPendingPrompt(undefined)).toBe(true);
  });

  it('SKIPS replay once the agent has already produced real app files', () => {
    // A best-effort prompt clear was lost, but the app exists — never regenerate over it.
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/package.json': { type: 'file', content: '', isBinary: false },
      '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
    };
    expect(shouldReplayPendingPrompt(files)).toBe(false);
  });

  it('SKIPS replay when more than one real file exists even if not matched as scaffold', () => {
    const files: FileMap = {
      '/home/project/index.html': { type: 'file', content: '', isBinary: false },
      '/home/project/main.ts': { type: 'file', content: '', isBinary: false },
    };
    expect(shouldReplayPendingPrompt(files)).toBe(false);
  });
});

describe('decidePendingPromptReplay (hydration gate)', () => {
  const realApp: FileMap = {
    '/home/project/README.md': { type: 'file', content: '', isBinary: false },
    '/home/project/package.json': { type: 'file', content: '', isBinary: false },
    '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
  };

  const scaffoldOnly: FileMap = {
    '/home/project/README.md': { type: 'file', content: '', isBinary: false },
    '/home/project/.gitignore': { type: 'file', content: '', isBinary: false },
  };

  it('DEFERS while the file map is not yet hydrated, even for an empty snapshot', () => {
    /*
     * The reopen race: an existing app whose files have not loaded yet reads as
     * 0-files. Must NOT be treated as "ungenerated → replay".
     */
    expect(decidePendingPromptReplay({}, false)).toBe('defer');
    expect(decidePendingPromptReplay(undefined, false)).toBe('defer');

    // Even if some files are already present, an unconfirmed snapshot defers.
    expect(decidePendingPromptReplay(realApp, false)).toBe('defer');
    expect(decidePendingPromptReplay(scaffoldOnly, false)).toBe('defer');
  });

  it('SKIPS (clears) once hydration reveals a real generated app — no regeneration', () => {
    expect(decidePendingPromptReplay(realApp, true)).toBe('skip');
  });

  it('REPLAYS exactly once for a genuinely empty/scaffold-only project after hydration', () => {
    expect(decidePendingPromptReplay(scaffoldOnly, true)).toBe('replay');
    expect(decidePendingPromptReplay({}, true)).toBe('replay');
    expect(decidePendingPromptReplay(undefined, true)).toBe('replay');
  });

  it('agrees with shouldReplayPendingPrompt once hydrated', () => {
    for (const files of [realApp, scaffoldOnly, {}]) {
      const expected = shouldReplayPendingPrompt(files) ? 'replay' : 'skip';
      expect(decidePendingPromptReplay(files, true)).toBe(expected);
    }
  });
});

describe('extractGenerationPrompt', () => {
  it('recovers the original prompt from the AI-seeded README', () => {
    const files: FileMap = {
      '/home/project/README.md': {
        type: 'file',
        content: aiReadme('Build a working todo list app with React and persist to localStorage.'),
        isBinary: false,
      },
    };
    expect(extractGenerationPrompt(files)).toBe(
      'Build a working todo list app with React and persist to localStorage.',
    );
  });

  it('recovers the FULL prompt when the user prompt itself contains "Prompt:"', () => {
    /*
     * Regression: lastIndexOf('Prompt:') landed on the occurrence inside the user
     * prompt, truncating the recovered prompt to just the tail. The template header
     * delimiter (\n\nPrompt:\n\n) must anchor on the first/section-header occurrence.
     */
    const userPrompt = 'Build a tool to manage my Prompt: templates with tags and search.';

    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: aiReadme(userPrompt), isBinary: false },
    };
    expect(extractGenerationPrompt(files)).toBe(userPrompt);
  });

  it('returns undefined when there is no AI-seeded README', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '# Just a normal readme', isBinary: false },
      '/home/project/src/App.tsx': { type: 'file', content: 'export default null;', isBinary: false },
    };
    expect(extractGenerationPrompt(files)).toBeUndefined();
    expect(extractGenerationPrompt(undefined)).toBeUndefined();
  });
});
