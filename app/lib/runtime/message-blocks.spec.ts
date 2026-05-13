import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';
import { messageToBlocks, parseTextPayloadToBlocks } from './message-blocks';
import {
  collectActionBlocks,
  isActionBlock,
  isArtifactBlock,
  isTextBlock,
  iterateBlocks,
  type ArtifactBlock,
  type AttachmentBlock,
  type FileActionBlock,
  type ReasoningBlock,
  type ShellActionBlock,
  type SupabaseActionBlock,
  type TextBlock,
  type ToolInvocationBlock,
} from '~/types/message-blocks';

function makeMessage(partial: Partial<Message> & { id: string; role: Message['role']; content: string }): Message {
  return partial as Message;
}

describe('parseTextPayloadToBlocks', () => {
  it('returns no blocks for empty input', () => {
    expect(parseTextPayloadToBlocks('m1', '')).toEqual([]);
  });

  it('returns a single text block for plain text', () => {
    const blocks = parseTextPayloadToBlocks('m1', 'Hello, world!');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('text');
    expect((blocks[0] as TextBlock).text).toBe('Hello, world!');
  });

  it('produces an artifact block with a file action child', () => {
    const input =
      '<boltArtifact title="Greeter" id="ignored" type="bundled">' +
      '<boltAction type="file" filePath="hello.ts">export const hi = () => "hi";</boltAction>' +
      '</boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const artifacts = blocks.filter(isArtifactBlock);

    expect(artifacts).toHaveLength(1);

    const artifact = artifacts[0];
    expect(artifact.title).toBe('Greeter');
    expect(artifact.artifactType).toBe('bundled');
    expect(artifact.closed).toBe(true);
    expect(artifact.children).toHaveLength(1);

    const child = artifact.children[0] as FileActionBlock;
    expect(child.kind).toBe('fileAction');
    expect(child.filePath).toBe('hello.ts');
    expect(child.content).toContain('export const hi');
    expect(child.streaming).toBe(false);
  });

  it('produces a shell action child block', () => {
    const input =
      '<boltArtifact title="Setup" id="x"><boltAction type="shell">pnpm install</boltAction></boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const artifact = blocks.find(isArtifactBlock);

    expect(artifact).toBeDefined();

    const child = artifact!.children[0] as ShellActionBlock;
    expect(child.kind).toBe('shellAction');
    expect(child.content).toBe('pnpm install');
    expect(child.streaming).toBe(false);
  });

  it('produces a supabase action child block', () => {
    const input =
      '<boltArtifact title="DB" id="x">' +
      '<boltAction type="supabase" operation="migration" filePath="2026-init.sql">CREATE TABLE t();</boltAction>' +
      '</boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const artifact = blocks.find(isArtifactBlock);

    expect(artifact).toBeDefined();

    const child = artifact!.children[0] as SupabaseActionBlock;
    expect(child.kind).toBe('supabaseAction');
    expect(child.operation).toBe('migration');
    expect(child.filePath).toBe('2026-init.sql');
    expect(child.content).toContain('CREATE TABLE');
  });

  it('preserves text order around artifacts', () => {
    const input =
      'Before <boltArtifact title="A" id="x">' +
      '<boltAction type="shell">npm i</boltAction>' +
      '</boltArtifact> After';

    const blocks = parseTextPayloadToBlocks('m1', input);

    expect(blocks.map((b) => b.kind)).toEqual(['text', 'artifact', 'text']);
    expect((blocks[0] as TextBlock).text).toBe('Before ');
    expect((blocks[2] as TextBlock).text).toBe(' After');
  });

  it('handles multiple actions inside a single artifact in order', () => {
    const input =
      '<boltArtifact title="Multi" id="x">' +
      '<boltAction type="shell">npm install</boltAction>' +
      '<boltAction type="file" filePath="index.js">console.log("hi");</boltAction>' +
      '</boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const artifact = blocks.find(isArtifactBlock);

    expect(artifact!.children.map((c) => c.kind)).toEqual(['shellAction', 'fileAction']);
  });

  it('marks an unclosed artifact as streaming (closed=false)', () => {
    const input = 'Hello <boltArtifact title="Live" id="x"><boltAction type="shell">npm run dev';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const artifact = blocks.find(isArtifactBlock);

    expect(artifact).toBeDefined();
    expect(artifact!.closed).toBe(false);
    expect(artifact!.children).toHaveLength(1);

    const action = artifact!.children[0] as ShellActionBlock;
    expect(action.streaming).toBe(true);
  });

  it('gives each block a stable id derived from messageId', () => {
    const input =
      'Intro <boltArtifact title="A" id="x">' + '<boltAction type="shell">echo 1</boltAction>' + '</boltArtifact>';

    const blocks = parseTextPayloadToBlocks('msg-42', input);

    for (const block of blocks) {
      expect(block.id.startsWith('msg-42-')).toBe(true);
    }
  });

  it('does not produce empty trailing text blocks when the input ends with an artifact', () => {
    const input = '<boltArtifact title="A" id="x"><boltAction type="shell">x</boltAction></boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);

    expect(blocks.every((b) => b.kind !== 'text')).toBe(true);
  });
});

describe('messageToBlocks', () => {
  it('returns an empty list for an empty message with no parts', () => {
    const message = makeMessage({ id: 'm1', role: 'assistant', content: '' });
    expect(messageToBlocks(message)).toEqual([]);
  });

  it('falls back to parsing message.content when parts is absent', () => {
    const message = makeMessage({ id: 'm1', role: 'assistant', content: 'Hi there.' });
    const blocks = messageToBlocks(message);

    expect(blocks).toHaveLength(1);
    expect((blocks[0] as TextBlock).text).toBe('Hi there.');
  });

  it('uses parts when present and parses text parts for artifacts', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      content: 'ignored when parts present',
      parts: [
        { type: 'text', text: 'Step one. ' },
        {
          type: 'text',
          text: '<boltArtifact title="A" id="x"><boltAction type="shell">ls</boltAction></boltArtifact>',
        },
      ],
    } as unknown as Message;

    const blocks = messageToBlocks(message);

    expect(blocks.map((b) => b.kind)).toEqual(['text', 'artifact']);
    expect((blocks[0] as TextBlock).text).toBe('Step one. ');

    const artifact = blocks[1] as ArtifactBlock;
    expect(artifact.children).toHaveLength(1);
    expect(artifact.children[0].kind).toBe('shellAction');
  });

  it('emits a toolInvocation block from a tool-invocation part', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'call-1',
            toolName: 'searchFiles',
            args: { pattern: '*.ts' },
            state: 'result',
            result: { matches: 3 },
          },
        },
      ],
    } as unknown as Message;

    const blocks = messageToBlocks(message);

    expect(blocks).toHaveLength(1);

    const tool = blocks[0] as ToolInvocationBlock;
    expect(tool.kind).toBe('toolInvocation');
    expect(tool.toolCallId).toBe('call-1');
    expect(tool.toolName).toBe('searchFiles');
    expect(tool.args).toEqual({ pattern: '*.ts' });
    expect(tool.state).toBe('result');
    expect(tool.result).toEqual({ matches: 3 });
  });

  it('emits a reasoning block from a reasoning part', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      content: '',
      parts: [{ type: 'reasoning', reasoning: 'Thinking about the problem...' }],
    } as unknown as Message;

    const blocks = messageToBlocks(message);

    expect(blocks).toHaveLength(1);

    const reasoning = blocks[0] as ReasoningBlock;
    expect(reasoning.kind).toBe('reasoning');
    expect(reasoning.text).toBe('Thinking about the problem...');
  });

  it('appends experimental_attachments as attachment blocks', () => {
    const message = {
      id: 'm1',
      role: 'user',
      content: 'See attached',
      experimental_attachments: [
        { name: 'spec.pdf', contentType: 'application/pdf', url: 'data:application/pdf;base64,XXXX' },
      ],
    } as unknown as Message;

    const blocks = messageToBlocks(message);

    expect(blocks.map((b) => b.kind)).toEqual(['text', 'attachment']);

    const attachment = blocks[1] as AttachmentBlock;
    expect(attachment.name).toBe('spec.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.url.startsWith('data:application/pdf')).toBe(true);
  });

  it('skips attachments missing a url', () => {
    const message = {
      id: 'm1',
      role: 'user',
      content: 'See attached',
      experimental_attachments: [{ name: 'broken.pdf' }],
    } as unknown as Message;

    const blocks = messageToBlocks(message);

    expect(blocks.every((b) => b.kind !== 'attachment')).toBe(true);
  });

  it('ignores unknown part types instead of throwing', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      content: '',
      parts: [{ type: 'unknown-future-part', payload: 'x' } as unknown as never],
    } as unknown as Message;

    expect(() => messageToBlocks(message)).not.toThrow();
    expect(messageToBlocks(message)).toEqual([]);
  });
});

describe('block helpers', () => {
  it('iterateBlocks yields artifacts and their children in order', () => {
    const input =
      'A <boltArtifact title="X" id="x"><boltAction type="shell">a</boltAction>' +
      '<boltAction type="file" filePath="f.ts">b</boltAction></boltArtifact> B';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const kinds = Array.from(iterateBlocks(blocks)).map((b) => b.kind);

    expect(kinds).toEqual(['text', 'artifact', 'shellAction', 'fileAction', 'text']);
  });

  it('collectActionBlocks pulls every nested action across artifacts', () => {
    const input =
      '<boltArtifact title="X" id="x">' +
      '<boltAction type="shell">a</boltAction>' +
      '<boltAction type="file" filePath="f.ts">b</boltAction>' +
      '</boltArtifact>' +
      '<boltArtifact title="Y" id="y">' +
      '<boltAction type="shell">c</boltAction>' +
      '</boltArtifact>';

    const blocks = parseTextPayloadToBlocks('m1', input);
    const actions = collectActionBlocks(blocks);

    expect(actions.map((a) => a.kind)).toEqual(['shellAction', 'fileAction', 'shellAction']);
  });

  it('type narrowing helpers correctly discriminate the union', () => {
    const blocks = parseTextPayloadToBlocks(
      'm1',
      'Hello <boltArtifact title="A" id="x"><boltAction type="shell">x</boltAction></boltArtifact>',
    );

    const textBlocks = blocks.filter(isTextBlock);
    const artifactBlocks = blocks.filter(isArtifactBlock);
    const actions = Array.from(iterateBlocks(blocks)).filter(isActionBlock);

    expect(textBlocks).toHaveLength(1);
    expect(artifactBlocks).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('shellAction');
  });
});
