import { resolveMarketingLanguage } from './marketing';

export const designPaletteEn = {
  'designPalette.trigger': 'Design palette',
  'designPalette.title': 'Design palette',
  'designPalette.description': 'Tune the color palette, typography, and design features that guide the agent.',
  'designPalette.section.colors': 'Colors',
  'designPalette.section.typography': 'Typography',
  'designPalette.section.features': 'Features',
  'designPalette.colorPalette': 'Color palette',
  'designPalette.reset': 'Reset',
  'designPalette.changeColor': 'Change the {role} color',
  'designPalette.designFeatures': 'Design features',
  'designPalette.summary': '{colors} colors • {fonts} fonts • {features} features',
  'designPalette.cancel': 'Cancel',
  'designPalette.save': 'Save changes',
  'designPalette.role.primary.label': 'Primary',
  'designPalette.role.primary.description':
    'Main brand color — use it for primary buttons, active links, and key interactive elements.',
  'designPalette.role.secondary.label': 'Secondary',
  'designPalette.role.secondary.description':
    'Supporting brand color — use it for secondary buttons, inactive states, and complementary elements.',
  'designPalette.role.accent.label': 'Accent',
  'designPalette.role.accent.description':
    'Highlight color — use it for badges, notifications, focus states, and calls to action.',
  'designPalette.role.background.label': 'Background',
  'designPalette.role.background.description':
    'Page backdrop — use it for the main application or website background behind all content.',
  'designPalette.role.surface.label': 'Surface',
  'designPalette.role.surface.description':
    'Elevated content areas — use it for cards, dialogs, menus, and panels above the background.',
  'designPalette.role.text.label': 'Text',
  'designPalette.role.text.description': 'Primary text — use it for headings, body text, and main readable content.',
  'designPalette.role.textSecondary.label': 'Secondary text',
  'designPalette.role.textSecondary.description':
    'Muted text — use it for captions, placeholders, timestamps, and less important information.',
  'designPalette.role.border.label': 'Border',
  'designPalette.role.border.description':
    'Separators — use them for input borders, dividers, table lines, and outlines.',
  'designPalette.role.success.label': 'Success',
  'designPalette.role.success.description':
    'Positive feedback — use it for success messages, completed states, and positive indicators.',
  'designPalette.role.warning.label': 'Warning',
  'designPalette.role.warning.description':
    'Caution alerts — use it for warning messages, pending states, and indicators that need attention.',
  'designPalette.role.error.label': 'Error',
  'designPalette.role.error.description':
    'Error states — use it for error messages, failed states, and destructive-action indicators.',
  'designPalette.feature.rounded': 'Rounded corners',
  'designPalette.feature.border': 'Subtle border',
  'designPalette.feature.gradient': 'Gradient accent',
  'designPalette.feature.shadow': 'Soft shadow',
  'designPalette.feature.frostedGlass': 'Frosted glass',
  'designPalette.font.sansSerif': 'Sans serif',
  'designPalette.font.serif': 'Serif',
  'designPalette.font.monospace': 'Monospace',
  'designPalette.font.cursive': 'Cursive',
  'designPalette.font.fantasy': 'Fantasy',
} as const;

export type DesignPaletteKey = keyof typeof designPaletteEn;
export type DesignPaletteCopy = Readonly<Record<DesignPaletteKey, string>>;

export const designPaletteFr: DesignPaletteCopy = {
  'designPalette.trigger': 'Palette de design',
  'designPalette.title': 'Palette de design',
  'designPalette.description':
    'Ajustez la palette de couleurs, la typographie et les caractéristiques de design qui guident l’agent.',
  'designPalette.section.colors': 'Couleurs',
  'designPalette.section.typography': 'Typographie',
  'designPalette.section.features': 'Caractéristiques',
  'designPalette.colorPalette': 'Palette de couleurs',
  'designPalette.reset': 'Réinitialiser',
  'designPalette.changeColor': 'Modifier la couleur {role}',
  'designPalette.designFeatures': 'Caractéristiques du design',
  'designPalette.summary': '{colors} couleurs • {fonts} polices • {features} caractéristiques',
  'designPalette.cancel': 'Annuler',
  'designPalette.save': 'Enregistrer les modifications',
  'designPalette.role.primary.label': 'Principale',
  'designPalette.role.primary.description':
    'Couleur principale de la marque — utilisez-la pour les boutons principaux, les liens actifs et les interactions clés.',
  'designPalette.role.secondary.label': 'Secondaire',
  'designPalette.role.secondary.description':
    'Couleur de soutien — utilisez-la pour les boutons secondaires, les états inactifs et les éléments complémentaires.',
  'designPalette.role.accent.label': 'Accent',
  'designPalette.role.accent.description':
    'Couleur de mise en valeur — utilisez-la pour les badges, notifications, états de focus et appels à l’action.',
  'designPalette.role.background.label': 'Arrière-plan',
  'designPalette.role.background.description':
    'Fond de page — utilisez-le pour l’arrière-plan principal de l’application ou du site.',
  'designPalette.role.surface.label': 'Surface',
  'designPalette.role.surface.description':
    'Zones de contenu surélevées — utilisez-les pour les cartes, boîtes de dialogue, menus et panneaux.',
  'designPalette.role.text.label': 'Texte',
  'designPalette.role.text.description':
    'Texte principal — utilisez-le pour les titres, le corps du texte et le contenu essentiel.',
  'designPalette.role.textSecondary.label': 'Texte secondaire',
  'designPalette.role.textSecondary.description':
    'Texte atténué — utilisez-le pour les légendes, placeholders, horodatages et informations secondaires.',
  'designPalette.role.border.label': 'Bordure',
  'designPalette.role.border.description':
    'Séparateurs — utilisez-les pour les champs, séparateurs, lignes de tableau et contours.',
  'designPalette.role.success.label': 'Succès',
  'designPalette.role.success.description':
    'Retour positif — utilisez-le pour les messages de succès, états terminés et indicateurs positifs.',
  'designPalette.role.warning.label': 'Avertissement',
  'designPalette.role.warning.description':
    'Alertes de prudence — utilisez-les pour les avertissements, états en attente et éléments à surveiller.',
  'designPalette.role.error.label': 'Erreur',
  'designPalette.role.error.description':
    'États d’erreur — utilisez-les pour les messages d’erreur, échecs et actions destructrices.',
  'designPalette.feature.rounded': 'Coins arrondis',
  'designPalette.feature.border': 'Bordure discrète',
  'designPalette.feature.gradient': 'Accent en dégradé',
  'designPalette.feature.shadow': 'Ombre douce',
  'designPalette.feature.frostedGlass': 'Verre dépoli',
  'designPalette.font.sansSerif': 'Sans empattement',
  'designPalette.font.serif': 'Avec empattement',
  'designPalette.font.monospace': 'Chasse fixe',
  'designPalette.font.cursive': 'Cursive',
  'designPalette.font.fantasy': 'Fantaisie',
};

export function getDesignPaletteCopy(language?: string | null): DesignPaletteCopy {
  return resolveMarketingLanguage(language) === 'fr' ? designPaletteFr : designPaletteEn;
}

export function formatDesignPaletteCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatDesignPaletteNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}
