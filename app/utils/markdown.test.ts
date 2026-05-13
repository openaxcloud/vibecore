import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { allowedHTMLElements, rehypePlugins, remarkPlugins } from './markdown';

async function renderMarkdown(input: string, options: { html?: boolean; limitedMarkdown?: boolean } = {}) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkPlugins(options.limitedMarkdown ?? false))
    .use(remarkRehype, { allowDangerousHtml: true });

  for (const plugin of rehypePlugins(options.html ?? true)) {
    if (Array.isArray(plugin)) {
      processor.use(plugin[0] as never, plugin[1] as never);
    } else {
      processor.use(plugin as never);
    }
  }

  processor.use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process(input);

  return String(file);
}

describe('markdown pipeline', () => {
  it('renders inline math with KaTeX HTML output', async () => {
    const html = await renderMarkdown('Pythagoras: $a^2 + b^2 = c^2$.');

    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toMatch(/<annotation[^>]*encoding="application\/x-tex"[^>]*>a\^2 \+ b\^2 = c\^2<\/annotation>/);
  });

  it('renders display math with KaTeX HTML output', async () => {
    const html = await renderMarkdown('\n$$\n\\int_0^1 x^2 dx\n$$\n');

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<math');
  });

  it('allows the KaTeX MathML element family through sanitize', async () => {
    const html = await renderMarkdown('$x_1 + x_2$');

    expect(html).toContain('<msub');
    expect(html).toContain('<mi');
  });

  it('keeps GFM tables flowing through the pipeline', async () => {
    const html = await renderMarkdown(['| h1 | h2 |', '| --- | --- |', '| a | b |'].join('\n'));

    expect(html).toContain('<table>');
    expect(html).toContain('<th>h1</th>');
  });

  it('exposes the math/mi/mo/annotation tags in the allowlist for ReactMarkdown', () => {
    for (const tag of ['math', 'mi', 'mo', 'mfrac', 'msup', 'msub', 'annotation', 'semantics']) {
      expect(allowedHTMLElements).toContain(tag);
    }
  });
});
