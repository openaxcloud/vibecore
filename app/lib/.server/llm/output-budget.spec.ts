import { describe, expect, it } from 'vitest';
import { OUTPUT_BUDGET, clampOutputBudget, estimateOutputBudget } from './output-budget';

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
