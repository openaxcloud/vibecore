import { describe, expect, it } from 'vitest';

import { summarizeAssistantMessage } from './message-block-summary';
import { messageToBlocks } from './message-blocks';

describe('summarizeAssistantMessage', () => {
  it('returns the frozen empty summary for an empty or missing block list', () => {
    const empty1 = summarizeAssistantMessage([]);
    const empty2 = summarizeAssistantMessage(undefined);

    expect(empty1).toBe(empty2);
    expect(empty1.narration).toEqual([]);
    expect(empty1.fileActions).toEqual([]);
  });

  it('preserves text + artifact ordering in the narration slice', () => {
    const blocks = messageToBlocks({
      id: 'm1',
      role: 'assistant',
      content: `Before the work.
<boltArtifact id="a1" title="Demo">
<boltAction type="file" filePath="src/App.tsx">export {}</boltAction>
</boltArtifact>
After the work.`,
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.narration.map((segment) => segment.kind)).toEqual(['text', 'artifact', 'text']);

    const firstText = summary.narration[0];
    const trailingText = summary.narration[2];

    if (firstText.kind !== 'text' || trailingText.kind !== 'text') {
      throw new Error('expected text narration segments');
    }

    expect(firstText.block.text).toContain('Before the work');
    expect(trailingText.block.text).toContain('After the work');
    expect(summary.artifacts).toHaveLength(1);
    expect(summary.artifacts[0].title).toBe('Demo');
  });

  it('flattens fileAction blocks across multiple artifacts in source order', () => {
    const blocks = messageToBlocks({
      id: 'm2',
      role: 'assistant',
      content: `
<boltArtifact id="a1" title="First">
<boltAction type="file" filePath="src/one.ts">A</boltAction>
<boltAction type="file" filePath="src/two.ts">B</boltAction>
</boltArtifact>
<boltArtifact id="a2" title="Second">
<boltAction type="file" filePath="src/three.ts">C</boltAction>
</boltArtifact>
`.trim(),
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.fileActions.map((action) => action.filePath)).toEqual(['src/one.ts', 'src/two.ts', 'src/three.ts']);
    expect(summary.artifacts).toHaveLength(2);
  });

  it('separates shell, supabase, start, and build actions into their own slices', () => {
    const blocks = messageToBlocks({
      id: 'm3',
      role: 'assistant',
      content: `
<boltArtifact id="a1" title="Mixed">
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="supabase" operation="migration" filePath="migrations/0001.sql">CREATE TABLE x();</boltAction>
<boltAction type="start">pnpm dev</boltAction>
<boltAction type="build">pnpm build</boltAction>
</boltArtifact>
`.trim(),
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.shellActions).toHaveLength(1);
    expect(summary.shellActions[0].content).toContain('pnpm install');
    expect(summary.supabaseActions).toHaveLength(1);
    expect(summary.supabaseActions[0].operation).toBe('migration');
    expect(summary.startActions).toHaveLength(1);
    expect(summary.buildActions).toHaveLength(1);
    expect(summary.fileActions).toHaveLength(0);
  });

  it('routes AI SDK parts into their typed slices', () => {
    const blocks = messageToBlocks({
      id: 'm4',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'text', text: 'narrating' },
        { type: 'reasoning', reasoning: 'thinking out loud', details: [{ type: 'text', text: 'thinking out loud' }] },
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'call-1',
            toolName: 'fs.write',
            state: 'partial-call',
            args: { path: 'a.ts' },
          },
        },
        { type: 'step-start' },
      ],
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.narration).toHaveLength(1);
    expect(summary.reasoning).toHaveLength(1);
    expect(summary.toolInvocations).toHaveLength(1);
    expect(summary.toolInvocations[0].toolName).toBe('fs.write');
    expect(summary.stepStarts).toHaveLength(1);
  });

  it('routes user attachments into the attachments slice', () => {
    const blocks = messageToBlocks({
      id: 'u1',
      role: 'user',
      content: 'look at this',
      experimental_attachments: [
        { url: 'data:image/png;base64,abc', name: 'a.png', contentType: 'image/png' },
        { url: 'data:image/png;base64,def', name: 'b.png', contentType: 'image/png' },
      ],
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.attachments).toHaveLength(2);
    expect(summary.attachments[0].name).toBe('a.png');
  });

  it('handles a streaming-mid-artifact snapshot without throwing', () => {
    /*
     * The artifact's closing </boltArtifact> hasn't arrived yet — the
     * converter returns it with `closed: false`. The summary helper must
     * still flatten the in-progress action into fileActions, otherwise
     * the "Accept all" counter would lag the on-screen card.
     */
    const blocks = messageToBlocks({
      id: 'mstream',
      role: 'assistant',
      content: `
<boltArtifact id="a1" title="Stream">
<boltAction type="file" filePath="src/streaming.ts">partial`.trim(),
    });

    const summary = summarizeAssistantMessage(blocks);

    expect(summary.artifacts).toHaveLength(1);
    expect(summary.artifacts[0].closed).toBe(false);
    expect(summary.fileActions).toHaveLength(1);
    expect(summary.fileActions[0].streaming).toBe(true);
  });
});
