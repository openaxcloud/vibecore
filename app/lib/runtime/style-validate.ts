/** Grammar validation shared by review proposals and final direct file writes. */
export async function validateStyleSyntax(filePath: string, source: string) {
  const extension = filePath.split('.').pop()?.toLowerCase();

  if (extension !== 'css' && extension !== 'scss') {
    return undefined;
  }

  // A missing validator is not a successful parse or a model syntax error.
  const { parsers } = await import('prettier/plugins/postcss');
  const parser = parsers[extension];

  try {
    await parser.parse(source, {} as Parameters<typeof parser.parse>[1]);
    return undefined;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const diagnostic = error as SyntaxError & { loc?: { start?: { line?: number; column?: number } } };

    return {
      message: diagnostic.message,
      line: diagnostic.loc?.start?.line,
      column: diagnostic.loc?.start?.column,
    };
  }
}
