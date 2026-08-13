/**
 * Browser-side code formatting via Prettier's standalone build.
 *
 * The editor toolbar's "Format" action runs the current document through
 * Prettier. We lazily import the standalone engine and only the plugins a
 * given parser needs so the (sizeable) Prettier bundles stay out of the main
 * chunk until the user actually formats something.
 */

const extensionToParser: Record<string, string> = {
  js: 'babel',
  cjs: 'babel',
  mjs: 'babel',
  jsx: 'babel',
  ts: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  json5: 'json5',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  yaml: 'yaml',
  yml: 'yaml',
  graphql: 'graphql',
  gql: 'graphql',
};

/** Returns the Prettier parser for a file path, or undefined if unsupported. */
export function getParserForFilePath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (!ext) {
    return undefined;
  }

  return extensionToParser[ext];
}

/** Lazily loads the standalone plugins required for a given parser. */
async function loadPluginsForParser(parser: string): Promise<unknown[]> {
  switch (parser) {
    case 'babel':
    case 'json':
    case 'json5': {
      const [estree, babel] = await Promise.all([import('prettier/plugins/estree'), import('prettier/plugins/babel')]);
      return [estree, babel];
    }
    case 'typescript': {
      const [estree, typescript] = await Promise.all([
        import('prettier/plugins/estree'),
        import('prettier/plugins/typescript'),
      ]);
      return [estree, typescript];
    }
    case 'css':
    case 'scss':
    case 'less': {
      const postcss = await import('prettier/plugins/postcss');
      return [postcss];
    }
    case 'html':
    case 'vue': {
      const [html, estree, babel] = await Promise.all([
        import('prettier/plugins/html'),
        import('prettier/plugins/estree'),
        import('prettier/plugins/babel'),
      ]);
      return [html, estree, babel];
    }
    case 'markdown':
    case 'mdx': {
      const [markdown, estree, babel] = await Promise.all([
        import('prettier/plugins/markdown'),
        import('prettier/plugins/estree'),
        import('prettier/plugins/babel'),
      ]);
      return [markdown, estree, babel];
    }
    case 'yaml': {
      const yaml = await import('prettier/plugins/yaml');
      return [yaml];
    }
    case 'graphql': {
      const graphql = await import('prettier/plugins/graphql');
      return [graphql];
    }
    default:
      return [];
  }
}

/**
 * Formats source code with Prettier. Throws if the file type is unsupported or
 * if Prettier fails to parse the content (e.g. a syntax error) — callers should
 * surface the error to the user rather than mutating the buffer.
 */
export async function formatDocument(content: string, filePath: string): Promise<string> {
  const parser = getParserForFilePath(filePath);

  if (!parser) {
    throw new Error(`No formatter available for ${filePath.split('/').pop() ?? filePath}`);
  }

  const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), loadPluginsForParser(parser)]);

  return format(content, { parser, plugins: plugins as NonNullable<Parameters<typeof format>[1]>['plugins'] });
}
