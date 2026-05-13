import type { UnistNode, UnistParent } from 'node_modules/unist-util-visit/lib';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema, type Options as RehypeSanitizeOptions } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList, Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

export const allowedHTMLElements = [
  'a',
  'annotation',
  'b',
  'button',
  'blockquote',
  'br',
  'code',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'math',
  'menclose',
  'merror',
  'mfrac',
  'mglyph',
  'mi',
  'mlabeledtr',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'ms',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'semantics',
  'source',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
  'var',
  'think',
  'header',
];

// Add custom rehype plugin
function remarkThinkRawContent() {
  return (tree: any) => {
    visit(tree, (node: any) => {
      if (node.type === 'html' && node.value && node.value.startsWith('<think>')) {
        const cleanedContent = node.value.slice(7);
        node.value = `<div class="__boltThought__">${cleanedContent}`;

        return;
      }

      if (node.type === 'html' && node.value && node.value.startsWith('</think>')) {
        const cleanedContent = node.value.slice(8);
        node.value = `</div>${cleanedContent}`;
      }
    });
  };
}

/*
 * KaTeX renders math via span/MathML elements and depends on inline styles for
 * vertical alignment, padding and font sizing. We trust the KaTeX-generated tree
 * (it runs from controlled math source on the client) so we allow `style` and
 * `aria-hidden` on the math output elements while keeping the rest of the schema
 * strict. This is the upstream-recommended pairing for rehype-katex + rehype-sanitize.
 */
const KATEX_HTML_ELEMENTS = [
  'span',
  'math',
  'menclose',
  'merror',
  'mfrac',
  'mi',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mrow',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'semantics',
  'annotation',
];

const katexAttributeAllowlist = Object.fromEntries(
  KATEX_HTML_ELEMENTS.map((element) => [element, ['className', 'style', 'aria-hidden', 'role', 'encoding', 'xmlns']]),
);

const rehypeSanitizeOptions: RehypeSanitizeOptions = {
  ...defaultSchema,
  tagNames: allowedHTMLElements,
  attributes: {
    ...defaultSchema.attributes,
    ...katexAttributeAllowlist,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      'data*',
      ['className', '__boltArtifact__', '__boltThought__', '__boltQuickAction', '__boltSelectedElement__'],

      // ['className', '__boltThought__']
    ],
    button: [
      ...(defaultSchema.attributes?.button ?? []),
      'data*',
      'type',
      'disabled',
      'name',
      'value',
      ['className', '__boltArtifact__', '__boltThought__', '__boltQuickAction'],
    ],
  },
  strip: [],
};

export function remarkPlugins(limitedMarkdown: boolean) {
  const plugins: PluggableList = [remarkGfm, remarkMath];

  if (limitedMarkdown) {
    plugins.unshift(limitedMarkdownPlugin);
  }

  plugins.unshift(remarkThinkRawContent);

  return plugins;
}

export function rehypePlugins(html: boolean) {
  const plugins: PluggableList = [];

  if (html) {
    plugins.push(rehypeRaw, [rehypeSanitize, rehypeSanitizeOptions]);
  }

  /*
   * rehype-katex runs after sanitize so that user-injected HTML is sanitized
   * first; KaTeX then emits its own trusted span/MathML tree from the
   * controlled math text nodes, which is allowed by the schema extensions above.
   */
  plugins.push([rehypeKatex, { strict: 'ignore', throwOnError: false, output: 'htmlAndMathml' }]);

  return plugins;
}

const limitedMarkdownPlugin: Plugin = () => {
  return (tree, file) => {
    const contents = file.toString();

    visit(tree, (node: UnistNode, index, parent: UnistParent) => {
      if (
        index == null ||
        ['paragraph', 'text', 'inlineCode', 'code', 'strong', 'emphasis'].includes(node.type) ||
        !node.position
      ) {
        return true;
      }

      let value = contents.slice(node.position.start.offset, node.position.end.offset);

      if (node.type === 'heading') {
        value = `\n${value}`;
      }

      parent.children[index] = {
        type: 'text',
        value,
      } as any;

      return [SKIP, index] as const;
    });
  };
};
