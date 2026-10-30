// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { beforeEach, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => ({
  addArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  addAction: vi.fn(),
  runAction: vi.fn(),
}));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { ...effects, showWorkbench: { set: vi.fn() } },
}));

const { useMessageParser } = await import('./useMessageParser');

beforeEach(() => vi.clearAllMocks());

const artifact =
  '<boltArtifact id="fixture" title="Fixture"><boltAction type="file" filePath="src/Test.ts">export const fixture = 1;</boltAction></boltArtifact>';

it.each([
  artifact,
  '<boltArtifact id="shell"><boltAction type="shell">npm run build</boltAction></boltArtifact>',
  'Create fixture.ts:\n\n```ts\nexport const fixture = 1;\n```',
  '```bash\nnpm run build\n```',
])('keeps user input literal without artifact or action side effects: %s', (content) => {
  const { result } = renderHook(() => useMessageParser());
  const message: Message = { id: 'user-fixture', role: 'user', content };
  act(() => result.current.parseMessages([message], false));
  expect(result.current.parsedMessages['user-fixture']).toBe(content);
  expect(effects.addArtifact).not.toHaveBeenCalled();
  expect(effects.addAction).not.toHaveBeenCalled();
  expect(effects.runAction).not.toHaveBeenCalled();
});

it('keeps partial assistant action content out of conversation while still delivering the file action', () => {
  const { result } = renderHook(() => useMessageParser());
  const message: Message = { id: 'assistant-fixture', role: 'assistant', content: '' };
  const content = 'Je prépare la page.\n' + artifact + '\nLa page est prête pour vérification.';

  for (let end = 1; end <= content.length; end += 1) {
    act(() => result.current.parseMessages([{ ...message, content: content.slice(0, end) }], true));
    expect(result.current.parsedMessages[message.id]).not.toContain('export const');
    expect(result.current.parsedMessages[message.id]).not.toContain('<boltAction');
  }
  expect(result.current.parsedMessages[message.id]).toContain('Je prépare la page.');
  expect(result.current.parsedMessages[message.id]).toContain('La page est prête pour vérification.');
  expect(effects.runAction).toHaveBeenCalledWith(
    expect.objectContaining({
      action: expect.objectContaining({ filePath: 'src/Test.ts', content: 'export const fixture = 1;\n' }),
    }),
  );
});

it('preserves explanatory code that is not a file or command', () => {
  const { result } = renderHook(() => useMessageParser());
  const content = 'Voici une expression :\n\n```js\n1 + 2\n```\nElle vaut trois.';
  act(() => result.current.parseMessages([{ id: 'explanation', role: 'assistant', content }], false));
  expect(result.current.parsedMessages.explanation).toBe(content);
  expect(effects.runAction).not.toHaveBeenCalled();
});

it('returns an intentionally empty projection for an incomplete artifact header', () => {
  const { result } = renderHook(() => useMessageParser());
  act(() => result.current.parseMessages([{ id: 'partial-header', role: 'assistant', content: '<boltArt' }], true));
  expect(result.current.parsedMessages['partial-header']).toBe('');
  expect(effects.runAction).not.toHaveBeenCalled();
});

it('keys projections by message identity across hydration and preserves retained messages on history reorder', () => {
  const { result } = renderHook(() => useMessageParser());
  const a: Message = { id: 'project-a', role: 'assistant', content: 'Texte du projet A.' };
  const b: Message = { id: 'project-b', role: 'assistant', content: 'Texte du projet B.' };
  act(() => result.current.parseMessages([a], true));
  expect(result.current.parsedMessages[b.id]).toBeUndefined();
  act(() => result.current.parseMessages([b], true));
  expect(result.current.parsedMessages[b.id]).toBe(b.content);
  act(() => result.current.parseMessages([b, a], true));
  expect(result.current.parsedMessages[a.id]).toBe(a.content);
  expect(result.current.parsedMessages[b.id]).toBe(b.content);
  act(() => result.current.parseMessages([a], true));
  expect(result.current.parsedMessages[a.id]).toBe(a.content);
  expect(effects.runAction).not.toHaveBeenCalled();
});

it('does not replay assistant actions when retained history changes positions', () => {
  const { result } = renderHook(() => useMessageParser());
  const a: Message = { id: 'retained-action', role: 'assistant', content: artifact };
  const b: Message = { id: 'retained-prose', role: 'assistant', content: 'Explication.' };
  act(() => result.current.parseMessages([a, b], true));

  const executions = effects.runAction.mock.calls.length;
  expect(executions).toBeGreaterThan(0);
  act(() => result.current.parseMessages([b, a], true));
  act(() => result.current.parseMessages([a], true));
  expect(effects.runAction).toHaveBeenCalledTimes(executions);
});

it('preserves an explicitly requested code example when the server forbids file actions', () => {
  const { result } = renderHook(() => useMessageParser());

  const content =
    'Voici le composant demandé, sans modifier vos fichiers.\n\nsrc/Example.tsx:\n\n```tsx\nimport React from "react";\nexport default function Example() { return <div>Bonjour</div>; }\n```';
  const message = {
    id: 'code-only',
    role: 'assistant',
    content,
    annotations: [{ type: 'consigneSansFichier' }],
  } as unknown as Message;
  act(() => result.current.parseMessages([message], false));
  expect(result.current.parsedMessages[message.id]).toBe(content);
  expect(effects.runAction).not.toHaveBeenCalled();
});

it.each(['assistant', 'user'] as const)(
  'preserves parts-only %s text without duplicating an authoritative content field',
  (role) => {
    const { result } = renderHook(() => useMessageParser());

    const message: Message = {
      id: `parts-only-${role}`,
      role,
      content: '',
      parts: [
        { type: 'text', text: 'Bonjour ' },
        { type: 'text', text: 'tout le monde.' },
      ],
    };
    act(() => result.current.parseMessages([message], true));
    expect(result.current.parsedMessages[message.id]).toBe('Bonjour tout le monde.');

    const authoritative = { ...message, id: `content-wins-${role}`, content: 'Texte autoritaire.' };
    act(() => result.current.parseMessages([authoritative], true));
    expect(result.current.parsedMessages[authoritative.id]).toBe('Texte autoritaire.');
  },
);

it('parses parts-only assistant artifacts while never executing identical user parts', () => {
  const { result } = renderHook(() => useMessageParser());

  const parts = [
    { type: 'text' as const, text: artifact.slice(0, 60) },
    { type: 'text' as const, text: artifact.slice(60) },
  ];

  const user: Message = { id: 'parts-artifact-user', role: 'user', content: '', parts };
  act(() => result.current.parseMessages([user], true));
  expect(result.current.parsedMessages[user.id]).toBe(artifact);
  expect(effects.runAction).not.toHaveBeenCalled();

  const assistant: Message = { ...user, id: 'parts-artifact-assistant', role: 'assistant' };
  act(() => result.current.parseMessages([assistant], true));
  expect(result.current.parsedMessages[assistant.id]).not.toContain('export const');
  expect(effects.runAction).toHaveBeenCalled();
});

it.each(['constructor', '__proto__', 'toString'])(
  'treats imported message id %s as data before and after repeated parsing',
  (id) => {
    const { result } = renderHook(() => useMessageParser());
    expect(result.current.parsedMessages[id]).toBeUndefined();

    const message: Message = { id, role: 'assistant', content: 'Texte importé.' };
    act(() => result.current.parseMessages([message], true));
    expect(result.current.parsedMessages[id]).toBe(message.content);
    act(() => result.current.parseMessages([message], true));
    expect(result.current.parsedMessages[id]).toBe(message.content);
    act(() => result.current.parseMessages([{ id: 'another-message', role: 'user', content: 'Question.' }], true));
    expect(Object.getPrototypeOf(result.current.parsedMessages)).toBeNull();
    expect(result.current.parsedMessages[id]).toBe(message.content);
    expect(effects.runAction).not.toHaveBeenCalled();
  },
);
