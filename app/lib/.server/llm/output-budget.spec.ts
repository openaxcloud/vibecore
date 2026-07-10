import { describe, expect, it } from 'vitest';
import { OUTPUT_BUDGET, clampOutputBudget, estimateOutputBudget, stripFileArtifacts } from './output-budget';

describe('estimateOutputBudget', () => {
  it('sizes discuss/ask/plan to the smallest budget', () => {
    expect(estimateOutputBudget({ chatMode: 'discuss', lastUserMessage: 'why did the build fail?' })).toBe(
      OUTPUT_BUDGET.discuss,
    );
  });

  it('keeps the generous budget for reasoning models even in build mode', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'fix typo', isReasoningModel: true })).toBe(
      OUTPUT_BUDGET.scaffold,
    );
  });

  it('classifies a from-scratch scaffold by signal phrase', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'Build a todo app with auth' })).toBe(
      OUTPUT_BUDGET.scaffold,
    );
  });

  it('classifies a long prompt as a scaffold', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'x'.repeat(400) })).toBe(OUTPUT_BUDGET.scaffold);
  });

  it('honors the plan toggle as a scaffold signal', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'go', planFirst: true })).toBe(
      OUTPUT_BUDGET.scaffold,
    );
  });

  it('classifies a short, scoped edit as a small edit', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'rename the header', contextFileCount: 1 })).toBe(
      OUTPUT_BUDGET.smallEdit,
    );
  });

  /*
   * Regression (measured live): a targeted edit on a project that already has many
   * files must classify as `smallEdit`, NOT `scaffold`. Context file count no
   * longer forces `scaffold` — only the edit intent + prompt shape decide.
   */
  it('classifies "add a footer" as a small edit even with a large context', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'add a footer', contextFileCount: 12 })).toBe(
      OUTPUT_BUDGET.smallEdit,
    );
  });

  it('classifies "change the color of the header" as a small edit with a large context', () => {
    expect(
      estimateOutputBudget({
        chatMode: 'build',
        lastUserMessage: 'change the color of the header',
        contextFileCount: 20,
      }),
    ).toBe(OUTPUT_BUDGET.smallEdit);
  });

  it('classifies "rename Foo to Bar" as a small edit with a large context', () => {
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'rename Foo to Bar', contextFileCount: 9 })).toBe(
      OUTPUT_BUDGET.smallEdit,
    );
  });

  it('still scaffolds a genuine from-scratch build regardless of edit-ish words', () => {
    // "create a" wins over the edit signals → real scaffolds are never under-sized.
    expect(
      estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'create a dashboard with a header and footer' }),
    ).toBe(OUTPUT_BUDGET.scaffold);
  });

  it('falls back to a normal build budget for a vague, non-edit prompt', () => {
    expect(
      estimateOutputBudget({ chatMode: 'build', lastUserMessage: 'make it responsive', contextFileCount: 8 }),
    ).toBe(OUTPUT_BUDGET.build);
  });

  /*
   * Regression (measured live): an edit turn prepends filesToArtifacts before the
   * instruction, inflating the message past the 400-char scaffold threshold. The
   * budget must classify on the real trailing instruction, not the artifact bytes.
   */
  it('classifies "change footer color to red" as smallEdit even when a big file artifact is prepended', () => {
    const artifact =
      '<boltArtifact id="update-1" title="User Updated Files">' +
      '<boltAction type="file" filePath="src/App.tsx">' +
      'x'.repeat(6000) +
      '</boltAction></boltArtifact>';

    const message = `${artifact}change the footer color to red`;
    expect(message.length).toBeGreaterThan(400); // inflated by the artifact
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: message, contextFileCount: 12 })).toBe(
      OUTPUT_BUDGET.smallEdit,
    );
  });

  it('still scaffolds a from-scratch build even if a file artifact is prepended (real long instruction)', () => {
    const artifact =
      '<boltArtifact id="u" title="Files"><boltAction type="file" filePath="a">z</boltAction></boltArtifact>';

    // A genuine from-scratch brief after the artifact → the "build a" signal wins.
    const message = `${artifact}build a full quiz app with scoring, a timer, and a results page`;
    expect(estimateOutputBudget({ chatMode: 'build', lastUserMessage: message })).toBe(OUTPUT_BUDGET.scaffold);
  });
});

describe('stripFileArtifacts', () => {
  it('removes prepended boltArtifact/boltAction blocks, leaving the instruction', () => {
    const artifact =
      '<boltArtifact id="u" title="Files"><boltAction type="file" filePath="a">CODE</boltAction></boltArtifact>';
    expect(stripFileArtifacts(`${artifact}make footer bold`)).toBe('make footer bold');
  });

  it('leaves a plain instruction untouched', () => {
    expect(stripFileArtifacts('rename the header')).toBe('rename the header');
  });
});

describe('clampOutputBudget', () => {
  it('leaves an estimate below the ceiling untouched (Anthropic 64k)', () => {
    expect(clampOutputBudget(OUTPUT_BUDGET.scaffold, 64000)).toBe(OUTPUT_BUDGET.scaffold);
  });

  it('caps a scaffold to the OpenAI ceiling (unchanged certified build path)', () => {
    // OpenAI completion ceiling is 16384 = the scaffold budget → identical to today.
    expect(clampOutputBudget(OUTPUT_BUDGET.scaffold, 16384)).toBe(16384);
  });

  it('caps a scaffold to a small Google ceiling', () => {
    expect(clampOutputBudget(OUTPUT_BUDGET.scaffold, 8192)).toBe(8192);
  });

  it('never returns below the floor for a normal ceiling', () => {
    expect(clampOutputBudget(10, 64000)).toBe(OUTPUT_BUDGET.floor);
  });

  it('returns the ceiling when the ceiling is below the floor', () => {
    expect(clampOutputBudget(OUTPUT_BUDGET.scaffold, 512)).toBe(512);
  });

  it('falls back to the scaffold budget on a non-positive ceiling', () => {
    expect(clampOutputBudget(OUTPUT_BUDGET.build, 0)).toBe(OUTPUT_BUDGET.build);
  });
});
