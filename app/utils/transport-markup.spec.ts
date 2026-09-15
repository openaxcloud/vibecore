import { describe, expect, it } from 'vitest';

import { hasTransportMarkup, stripTransportMarkup, trailingTransportFragmentLength } from './transport-markup';

/*
 * Literals are concatenated so they survive any tooling that rewrites transport
 * markup found in source files.
 */
const NS = `${'antml'}:`;

describe('stripTransportMarkup', () => {
  it('removes complete namespaced tags', () => {
    for (const tag of [`<${NS}invoke name="x">`, `</${NS}invoke>`, `</${NS}function_calls>`, `<${NS}parameter/>`]) {
      const { content, stripped } = stripTransportMarkup(`const a = 1;\n${tag}\n`);

      expect(content).toBe('const a = 1;\n\n');
      expect(stripped).toBe(1);
    }
  });

  it('removes bare transport wrappers', () => {
    for (const tag of ['<invoke>', '</invoke>', '<invoke name="x">', '</function_calls>', '<parameter name="p">']) {
      expect(stripTransportMarkup(`x\n${tag}`).stripped).toBe(1);
    }
  });

  it('removes a truncated wrapper at the tail (the shape that landed on disk)', () => {
    const truncated = `export default App;\n</${NS.slice(0, -1)}`;

    const { content, stripped } = stripTransportMarkup(truncated);

    expect(stripped).toBe(1);
    expect(content).toBe('export default App;\n');
  });

  it('clears a stacked wrapper tail', () => {
    const { content } = stripTransportMarkup(`code\n</${NS}invoke></${NS.slice(0, -1)}`);
    expect(content).toBe('code\n');
  });

  it('is idempotent', () => {
    const once = stripTransportMarkup(`a\n</${NS}invoke>\n`).content;
    expect(stripTransportMarkup(once).content).toBe(once);
  });

  it('leaves legitimate source untouched', () => {
    const legit = [
      'const el = <div className="text-red-500">a &lt; b</div>;',
      'if (a < b && c > d) return;',
      'const s = "</div></span></a>";',
      '<param name="movie" value="x">',
      'export function invoke(fn) { return fn(); }',
      'const invoked = obj.invoke();',
      'type Parameter = { name: string };',
    ].join('\n');

    const { content, stripped } = stripTransportMarkup(legit);

    expect(content).toBe(legit);
    expect(stripped).toBe(0);
    expect(hasTransportMarkup(legit)).toBe(false);
  });

  it('does not strip an ordinary unterminated tag at the tail', () => {
    for (const tail of ['const x = a < b', 'text\n</a', 'text\n</div', 'html += "<sp']) {
      expect(stripTransportMarkup(tail).content).toBe(tail);
    }
  });
});

describe('trailingTransportFragmentLength', () => {
  it('measures a split namespaced fragment so the parser can hold it back', () => {
    const fragment = `</${NS.slice(0, -1)}`; // `</antml`

    expect(trailingTransportFragmentLength(`code\n${fragment}`)).toBe(fragment.length);
  });

  it('measures progressively longer partials of a bare wrapper', () => {
    for (const partial of ['</inv', '</invoke', '<invok']) {
      expect(trailingTransportFragmentLength(`code${partial}`)).toBe(partial.length);
    }
  });

  it('returns 0 for an unambiguous tail', () => {
    for (const tail of ['const a = 1;', 'return <div>x</div>;', 'a < b']) {
      expect(trailingTransportFragmentLength(tail)).toBe(0);
    }
  });
});
