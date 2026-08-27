import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const inspectorPanelEn = {
  'inspectorPanel.title': 'Element inspector',
  'inspectorPanel.close': 'Close inspector',
  'inspectorPanel.tabs.ariaLabel': 'Inspector views',
  'inspectorPanel.tabs.styles': 'Styles',
  'inspectorPanel.tabs.computed': 'Computed',
  'inspectorPanel.tabs.box': 'Box model',
  'inspectorPanel.styles.empty': 'No relevant styles are defined.',
  'inspectorPanel.computed.empty': 'No computed styles are available.',
  'inspectorPanel.box.width': 'Width',
  'inspectorPanel.box.height': 'Height',
  'inspectorPanel.box.top': 'Top',
  'inspectorPanel.box.left': 'Left',
} as const;

export type InspectorPanelKey = keyof typeof inspectorPanelEn;
export type InspectorPanelCopy = Readonly<Record<InspectorPanelKey, string>>;

export const inspectorPanelFr: InspectorPanelCopy = {
  'inspectorPanel.title': 'Inspecteur d’élément',
  'inspectorPanel.close': 'Fermer l’inspecteur',
  'inspectorPanel.tabs.ariaLabel': 'Vues de l’inspecteur',
  'inspectorPanel.tabs.styles': 'Styles',
  'inspectorPanel.tabs.computed': 'Calculés',
  'inspectorPanel.tabs.box': 'Modèle de boîte',
  'inspectorPanel.styles.empty': 'Aucun style pertinent n’est défini.',
  'inspectorPanel.computed.empty': 'Aucun style calculé n’est disponible.',
  'inspectorPanel.box.width': 'Largeur',
  'inspectorPanel.box.height': 'Hauteur',
  'inspectorPanel.box.top': 'Haut',
  'inspectorPanel.box.left': 'Gauche',
};

export function getInspectorPanelCopy(language?: string | null): InspectorPanelCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? inspectorPanelFr : inspectorPanelEn;
}

export function formatInspectorPanelPixels(value: number, language?: string | null): string {
  const french = normalizeSupportedLanguage(language) === 'fr';

  const formatted = new Intl.NumberFormat(french ? 'fr-FR' : 'en-US', { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );

  return french ? `${formatted} px` : `${formatted}px`;
}
