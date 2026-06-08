export const getLanguageFromExtension = (ext: string): string => {
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    json: 'json',
    html: 'html',
    css: 'css',
    py: 'python',
    java: 'java',
    rb: 'ruby',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    md: 'markdown',
    mdx: 'markdown',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    toml: 'toml',
  };

  /*
   * Default to plaintext, not typescript — an unknown or extensionless file
   * (Dockerfile, Makefile, .env, plain text) was previously highlighted with
   * TypeScript grammar, producing wrong colouring and spurious bracket matching.
   */
  return map[ext] || 'plaintext';
};
