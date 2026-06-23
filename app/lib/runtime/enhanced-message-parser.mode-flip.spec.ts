import { describe, expect, it, vi } from 'vitest';
import { EnhancedStreamingMessageParser } from './enhanced-message-parser';

/*
 * Regression: mode-flip from auto-WRAPPED back to RAW input must NOT drop a late
 * real <boltArtifact>.
 *
 * The model first emits a bare code block (auto-wrapped into a synthetic
 * artifact, which calls resetMessage()+super.parse(wrappedInput) and advances the
 * base parser's saved position into the longer wrapped-coordinate space). Later in
 * the SAME message it emits a real <boltArtifact>. Once the raw input contains
 * `<boltArtifact`, _hasDetectedArtifacts(input) is true and the parser must switch
 * to feeding RAW input — but the saved wrapped position is longer than the raw
 * input, so a naive super.parse(raw) would skip the whole `while (i < length)`
 * loop and silently drop the real artifact (and trailing text).
 *
 * The fix resets the message + leaves wrapped mode + re-parses raw from position 0
 * on the flip, flagging consumeDidReset() so the caller replaces (not appends).
 */
describe('EnhancedStreamingMessageParser mode-flip wrapped -> raw', () => {
  const mkParser = () => {
    const callbacks = {
      onArtifactOpen: vi.fn(),
      onArtifactClose: vi.fn(),
      onActionOpen: vi.fn(),
      onActionClose: vi.fn(),
    };

    return {
      callbacks,
      parser: new EnhancedStreamingMessageParser({ callbacks }),
    };
  };

  /*
   * Simulate cumulative streaming: a bare code block (auto-wrapped) followed by a
   * genuine artifact that writes a DIFFERENT file. The genuine artifact must reach
   * the action callbacks (not be dropped) once the raw input contains it.
   */
  const beforeArtifact = 'Create config.js:\n\n```javascript\nconst port = 3000;\n```\n\nNow the real file:\n\n';

  const realArtifact =
    '<boltArtifact id="real-1" title="server.js" type="bundled">' +
    '<boltAction type="file" filePath="server.js">REAL_ARTIFACT_BODY</boltAction>' +
    '</boltArtifact>';

  const fullMessage = beforeArtifact + realArtifact;

  it('emits the late real artifact instead of dropping it after a wrap', () => {
    const { parser, callbacks } = mkParser();

    // Chunk 1: only the bare code block -> auto-wrapped (wrapped mode engaged).
    parser.parse('flip_id', beforeArtifact);

    // Chunk 2: cumulative input now also contains the genuine <boltArtifact>.
    parser.parse('flip_id', fullMessage);

    // The genuine file action must have been emitted with its real path + body.
    expect(callbacks.onActionOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'file',
          filePath: 'server.js',
        }),
      }),
    );

    const closedWithBody = callbacks.onActionClose.mock.calls.some(([arg]: [{ action: { content: string } }]) =>
      arg?.action?.content?.includes('REAL_ARTIFACT_BODY'),
    );
    expect(closedWithBody).toBe(true);
  });

  it('signals a reset on the wrapped->raw flip so the caller replaces (not appends)', () => {
    const { parser } = mkParser();

    parser.parse('flip2', beforeArtifact);
    expect(parser.consumeDidReset('flip2')).toBe(true); // initial wrap

    const out = parser.parse('flip2', fullMessage);
    expect(parser.consumeDidReset('flip2')).toBe(true); // mode flip -> full reparse

    /*
     * On the flip we feed RAW input, so the bare code block stays as raw text and
     * only the genuine <boltArtifact> is parsed into a placeholder div. Its
     * presence proves the real artifact was parsed and not silently dropped by a
     * stale wrapped-coordinate position.
     */
    expect(out).toContain('class="__boltArtifact__" data-message-id="flip2"');
  });

  it('keeps a message that never wrapped on the normal raw path', () => {
    const { parser, callbacks } = mkParser();

    // Plain prose then a real artifact, no bare code block first.
    parser.parse('noflip', 'Here is the file:\n\n');
    parser.parse('noflip', 'Here is the file:\n\n' + realArtifact);

    // No spurious reset, and the artifact still lands.
    expect(callbacks.onActionOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ type: 'file', filePath: 'server.js' }),
      }),
    );
  });
});
