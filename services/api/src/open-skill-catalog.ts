/**
 * Browse-only sources for open-standard Agent Skills.
 *
 * A catalog entry is not an approval. Installation always resolves `ref` to an
 * immutable commit, downloads exactly `skillPath`, scans that bundle, and
 * creates a quarantined artifact. Keeping the source path in the key prevents
 * the former repository-level catalogue from pretending an arbitrary README is
 * a skill.
 */
export interface OpenSkillCatalogEntry {
  id: string;
  ownerRepo: string;
  skillPath: string;
  ref: string;
  name: string;
  description: string;
  category: 'documents' | 'authoring';
  homepageUrl: string;
  auditStatus: 'requires_audit';
}

function catalogEntry(input: Omit<OpenSkillCatalogEntry, 'id' | 'homepageUrl' | 'auditStatus'>): OpenSkillCatalogEntry {
  return Object.freeze({
    ...input,
    id: `${input.ownerRepo}:${input.skillPath}`,
    homepageUrl: `https://github.com/${input.ownerRepo}/tree/${input.ref}/${input.skillPath}`,
    auditStatus: 'requires_audit',
  });
}

/**
 * Current upstream folders from Anthropic's reference Agent Skills repository.
 * The moving `main` ref means “audit the newest version now”; approval is bound
 * to the commit SHA and bundle digest returned by that audit.
 */
export const OPEN_SKILL_CATALOG: readonly OpenSkillCatalogEntry[] = Object.freeze([
  catalogEntry({
    ownerRepo: 'anthropics/skills',
    skillPath: 'skills/pdf',
    ref: 'main',
    name: 'PDF',
    description: 'Create, inspect, edit, combine, OCR, and secure PDF documents.',
    category: 'documents',
  }),
  catalogEntry({
    ownerRepo: 'anthropics/skills',
    skillPath: 'skills/docx',
    ref: 'main',
    name: 'DOCX',
    description: 'Create, inspect, and edit professional Word documents.',
    category: 'documents',
  }),
  catalogEntry({
    ownerRepo: 'anthropics/skills',
    skillPath: 'skills/pptx',
    ref: 'main',
    name: 'PPTX',
    description: 'Create, inspect, and edit PowerPoint presentations.',
    category: 'documents',
  }),
  catalogEntry({
    ownerRepo: 'anthropics/skills',
    skillPath: 'skills/xlsx',
    ref: 'main',
    name: 'XLSX',
    description: 'Create, inspect, clean, calculate, and chart spreadsheets.',
    category: 'documents',
  }),
  catalogEntry({
    ownerRepo: 'anthropics/skills',
    skillPath: 'skills/skill-creator',
    ref: 'main',
    name: 'Skill Creator',
    description: 'Create, evaluate, and improve open-standard Agent Skills.',
    category: 'authoring',
  }),
]);

const CATALOG_BY_ID = new Map(OPEN_SKILL_CATALOG.map((entry) => [entry.id, entry]));

export function findOpenSkillCatalogEntry(id: string): OpenSkillCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}
