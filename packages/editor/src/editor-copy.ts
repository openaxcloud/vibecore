export type EditorUiLanguage = 'en' | 'fr';

export const editorCopyEn = {
  reactComponent: 'React component',
  asyncFunction: 'async function',
  snippetDetail: 'VibeCore snippet',
  findReferences: 'Find references',
  renameSymbol: 'Rename symbol',
  goToDefinition: 'Go to definition',
  refactor: 'Refactor…',
  codingSymbols: 'Coding symbols',
  insertSymbol: 'Insert {symbol}',
} as const;

export type EditorCopy = Readonly<Record<keyof typeof editorCopyEn, string>>;

export const editorCopyFr: EditorCopy = {
  reactComponent: 'Composant React',
  asyncFunction: 'async function',
  snippetDetail: 'Extrait VibeCore',
  findReferences: 'Rechercher les références',
  renameSymbol: 'Renommer le symbole',
  goToDefinition: 'Accéder à la définition',
  refactor: 'Remanier…',
  codingSymbols: 'Symboles de code',
  insertSymbol: 'Insérer {symbol}',
};

export function resolveEditorUiLanguage(language?: string | null): EditorUiLanguage {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function getEditorCopy(language?: string | null): EditorCopy {
  return resolveEditorUiLanguage(language) === 'fr' ? editorCopyFr : editorCopyEn;
}

export function formatEditorCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
