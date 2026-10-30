// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn(),
    files: { get: () => ({}) },
  },
}));
vi.stubEnv('DEV', false);

const { useMessageParser } = await import('~/lib/hooks/useMessageParser');
const { workbenchStore } = await import('~/lib/stores/workbench');
afterEach(cleanup);
it.each([true, false])(
  'preserves prose on remount without replaying file actions (isLoading=%s DEV=false)',
  (isLoading) => {
    expect(import.meta.env.DEV).toBe(false);

    const id = `remount-proof-${isLoading}`;

    const content =
      'Avant Aster. <boltArtifact id="source" title="fixture"><boltAction type="file" filePath="src/App.tsx">export const app=1;</boltAction></boltArtifact> Après Aster.';

    const message = { id, role: 'assistant' as const, content };
    const first = renderHook(() => useMessageParser());
    act(() => first.result.current.parseMessages([message], isLoading));

    const initial = first.result.current.parsedMessages[id];
    expect(initial).toContain('Avant Aster.');
    expect(initial).toContain('Après Aster.');

    const executed = vi.mocked(workbenchStore.runAction).mock.calls.length;
    expect(executed).toBeGreaterThan(0);
    first.unmount();

    const second = renderHook(() => useMessageParser());
    act(() => second.result.current.parseMessages([message], isLoading));
    expect(vi.mocked(workbenchStore.runAction).mock.calls.length).toBe(executed);
    expect(second.result.current.parsedMessages[id]).toBe(initial);
  },
);

it('restores a parts-only message without mixing project message identities', () => {
  const first = renderHook(() => useMessageParser());

  const a = {
    id: 'project-A-message',
    role: 'assistant' as const,
    content: '',
    parts: [{ type: 'text' as const, text: 'Prose projet A.' }],
  };

  const b = { id: 'project-B-message', role: 'assistant' as const, content: 'Prose projet B.' };
  act(() => first.result.current.parseMessages([a], true));
  first.unmount();

  const second = renderHook(() => useMessageParser());
  act(() => second.result.current.parseMessages([b], true));
  expect(second.result.current.parsedMessages[a.id]).toBeUndefined();
  expect(second.result.current.parsedMessages[b.id]).toBe(b.content);
  act(() => second.result.current.parseMessages([a], true));
  expect(second.result.current.parsedMessages[a.id]).toBe('Prose projet A.');
});
it('keeps full projection when enhanced wrapping replaces an earlier raw prefix', () => {
  const id = 'remount-enhanced';
  const first = renderHook(() => useMessageParser());
  const prefix = 'Prose.\n\nCreate config.ts:\n\n```ts\nexport const port=5173;';
  act(() => first.result.current.parseMessages([{ id, role: 'assistant', content: prefix }], true));
  act(() => first.result.current.parseMessages([{ id, role: 'assistant', content: prefix + '\n```' }], true));

  const full = first.result.current.parsedMessages[id];
  expect(full.match(/Prose\./g)).toHaveLength(1);
  expect(full).toContain('__boltArtifact__');
  first.unmount();

  const second = renderHook(() => useMessageParser());
  act(() => second.result.current.parseMessages([{ id, role: 'assistant', content: prefix + '\n```' }], true));
  expect(second.result.current.parsedMessages[id]).toBe(full);
});
it('discards the matching projection when a parser error resets that message only', async () => {
  const { EnhancedStreamingMessageParser } = await import('~/lib/runtime/enhanced-message-parser');
  const hook = renderHook(() => useMessageParser());
  const a = { id: 'reset-error-A', role: 'assistant' as const, content: 'Avant erreur.' };
  const b = { id: 'reset-error-B', role: 'assistant' as const, content: 'Autre message.' };
  act(() => hook.result.current.parseMessages([a, b], true));

  const parse = vi.spyOn(EnhancedStreamingMessageParser.prototype, 'parse');
  parse.mockImplementationOnce(() => {
    throw new Error('synthetic parser failure');
  });
  act(() => hook.result.current.parseMessages([{ ...a, content: a.content + ' suite.' }], true));
  parse.mockRestore();
  act(() => hook.result.current.parseMessages([{ ...a, content: a.content + ' suite.' }, b], true));
  expect(hook.result.current.parsedMessages[a.id]).toBe(a.content + ' suite.');
  expect(hook.result.current.parsedMessages[b.id]).toBe(b.content);
});

it('invalidates the display snapshot with the existing development global reset', () => {
  const id = 'existing-dev-reset';
  const hook = renderHook(() => useMessageParser());
  act(() => hook.result.current.parseMessages([{ id, role: 'assistant', content: 'Before reset.' }], true));
  vi.stubEnv('DEV', true);

  try {
    act(() => hook.result.current.parseMessages([{ id, role: 'assistant', content: 'After reset.' }], false));
  } finally {
    vi.stubEnv('DEV', false);
  }
  hook.unmount();

  const next = renderHook(() => useMessageParser());
  act(() => next.result.current.parseMessages([{ id, role: 'assistant', content: 'After reset.' }], true));
  expect(next.result.current.parsedMessages[id]).toBe('After reset.');
});
it('does not bypass an explicitly requested recovery replay even for identical source', async () => {
  const { rejouerLeMessage } = await import('~/lib/hooks/useMessageParser');
  const { EnhancedStreamingMessageParser } = await import('~/lib/runtime/enhanced-message-parser');
  const hook = renderHook(() => useMessageParser());
  const message = { id: 'explicit-replay-cache', role: 'assistant' as const, content: 'Recover this source.' };
  act(() => hook.result.current.parseMessages([message], true));

  const parse = vi.spyOn(EnhancedStreamingMessageParser.prototype, 'parse');
  rejouerLeMessage(message.id, message.content);
  act(() => hook.result.current.parseMessages([message], true));
  expect(parse).toHaveBeenCalledWith(message.id, message.content);
  expect(hook.result.current.parsedMessages[message.id]).toBe(message.content);
  parse.mockRestore();
});
