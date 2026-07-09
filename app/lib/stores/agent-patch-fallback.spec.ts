import { describe, expect, it, vi } from 'vitest';
import {
  resolveFailedAgentPatchContent,
  type AgentPatchFallbackContext,
  type AgentPatchFallbackDeps,
} from './agent-patch-fallback';

const VALIDATION_ERROR = new Error('Remote file changed since it was loaded');

/*
 * A validator that accepts an allow-list of exact contents and rejects the rest,
 * standing in for the store's real #validateAgentPatchProposal.
 */
function makeDeps(overrides: Partial<AgentPatchFallbackDeps> & { valid?: readonly string[] } = {}): {
  deps: AgentPatchFallbackDeps;
  logs: string[];
} {
  const logs: string[] = [];
  const valid = overrides.valid ?? [];

  const deps: AgentPatchFallbackDeps = {
    validate:
      overrides.validate ??
      (async (content: string) => {
        if (!valid.includes(content)) {
          throw new Error(`invalid content: ${content.slice(0, 20)}`);
        }
      }),
    mergeJson: overrides.mergeJson ?? (() => undefined),
    scaffoldPackageJson: overrides.scaffoldPackageJson ?? (() => '{"name":"app"}\n'),
    onLog: overrides.onLog ?? ((message: string) => logs.push(message)),
  };

  return { deps, logs };
}

function baseContext(overrides: Partial<AgentPatchFallbackContext> = {}): AgentPatchFallbackContext {
  return {
    relativePath: 'src/components/TodoInput.tsx',
    acceptedContent: 'export function TodoInput() { return <in', // truncated hunk-applied result
    proposedContent: 'export function TodoInput() { return <input />; }\n',
    acceptedEveryHunk: true,
    currentContent: '',
    validationError: VALIDATION_ERROR,
    ...overrides,
  };
}

describe('resolveFailedAgentPatchContent — non-JSON files', () => {
  it('falls back to the full proposed content when it validates and every hunk was accepted', async () => {
    const context = baseContext();
    const { deps, logs } = makeDeps({ valid: [context.proposedContent] });

    await expect(resolveFailedAgentPatchContent(context, deps)).resolves.toBe(context.proposedContent);
    expect(logs).toEqual(['AI patch for src/components/TodoInput.tsx applied via full-content fallback']);
  });

  it('re-throws (no silent bad write) when the full proposed content is itself invalid/truncated', async () => {
    const context = baseContext({ proposedContent: 'export function TodoInput() { return <in' });
    const { deps } = makeDeps({ valid: [] }); // nothing validates

    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toBe(VALIDATION_ERROR);
  });

  it('does NOT substitute the full file for a PARTIAL hunk selection', async () => {
    const context = baseContext({ acceptedEveryHunk: false });

    // Even though the full content would validate, a partial accept must not adopt it.
    const { deps } = makeDeps({ valid: [context.proposedContent] });

    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toBe(VALIDATION_ERROR);
  });

  it('re-throws when the full content equals the (already-failed) hunk-applied content', async () => {
    const same = 'export function TodoInput() { return <in';
    const context = baseContext({ acceptedContent: same, proposedContent: same });
    const { deps } = makeDeps({ valid: [same] });

    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toBe(VALIDATION_ERROR);
  });

  it('does not call validate again when there is nothing to fall back to', async () => {
    const context = baseContext({ proposedContent: '' });
    const validate = vi.fn<AgentPatchFallbackDeps['validate']>().mockResolvedValue(undefined);
    const { deps } = makeDeps({ validate });

    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toBe(VALIDATION_ERROR);
    expect(validate).not.toHaveBeenCalled();
  });
});

describe('resolveFailedAgentPatchContent — JSON path (unchanged bug #21 behaviour)', () => {
  it('applies a tolerant JSON merge when one is available', async () => {
    const merged = '{"name":"app","version":"1.0.0"}\n';

    const context = baseContext({
      relativePath: 'package.json',
      acceptedContent: '{"name":"app"',
      proposedContent: '{"version":"1.0.0"}',
    });

    const { deps, logs } = makeDeps({ valid: [merged], mergeJson: () => merged });

    await expect(resolveFailedAgentPatchContent(context, deps)).resolves.toBe(merged);
    expect(logs).toEqual(['AI patch for package.json applied via tolerant JSON merge']);
  });

  it('scaffolds a minimal package.json when nothing merges', async () => {
    const scaffold = '{"name":"app","private":true}\n';
    const context = baseContext({ relativePath: 'package.json' });
    const { deps } = makeDeps({ valid: [scaffold], mergeJson: () => undefined, scaffoldPackageJson: () => scaffold });

    await expect(resolveFailedAgentPatchContent(context, deps)).resolves.toBe(scaffold);
  });

  it('re-throws for a non-package.json JSON file that cannot be merged', async () => {
    const context = baseContext({ relativePath: 'tsconfig.json' });
    const { deps } = makeDeps({ mergeJson: () => undefined });

    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toBe(VALIDATION_ERROR);
  });

  it('propagates a validation failure when the merged JSON is itself invalid', async () => {
    const merged = '{"name":"app"'; // still invalid
    const context = baseContext({ relativePath: 'package.json' });
    const { deps } = makeDeps({ valid: [], mergeJson: () => merged });

    // The merged content fails its own validation; that error propagates.
    await expect(resolveFailedAgentPatchContent(context, deps)).rejects.toThrow(/invalid content/);
  });
});
