import { Code2, type LucideIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import { SiGo, SiJavascript, SiOpenjdk, SiPython, SiTypescript } from 'react-icons/si';

/**
 * Maps a programming-language facet (as produced by the E-Code starter-template
 * catalog's `inferLanguage`, i.e. lowercase `python`/`java`/`typescript`/
 * `javascript`, plus the `Other` fallback — and the human-readable names used in
 * tests) to its REAL Simple Icons brand logo + documented brand color. Unknown
 * languages fall back to a lucide `Code2` glyph tinted with the E-Code accent so
 * no tile renders a generic identical square.
 */
export interface LanguageIcon {
  /** A react-icons Simple Icon or a lucide-react concept icon. */
  Icon: IconType | LucideIcon;

  /** Hex color to tint the glyph; brand color for logos, E-Code accent for the fallback. */
  color: string;

  /** Whether the glyph is a real tech logo (vs. the generic-concept fallback). */
  brand: boolean;
}

const ECODE_ACCENT = '#F26207';

/*
 * Brand colors are the official Simple Icons hex values. JavaScript's brand
 * yellow (#F7DF1E) stays legible on the dark --ecode-surface tile.
 */
const LANGUAGE_ICONS: Record<string, LanguageIcon> = {
  typescript: { Icon: SiTypescript, color: '#3178C6', brand: true },
  javascript: { Icon: SiJavascript, color: '#F7DF1E', brand: true },
  python: { Icon: SiPython, color: '#3776AB', brand: true },

  // Oracle's "Java" coffee-cup mark is proprietary; OpenJDK is the open-source brand.
  java: { Icon: SiOpenjdk, color: '#FFFFFF', brand: true },
  go: { Icon: SiGo, color: '#00ADD8', brand: true },
  golang: { Icon: SiGo, color: '#00ADD8', brand: true },
};

const FALLBACK: LanguageIcon = { Icon: Code2, color: ECODE_ACCENT, brand: false };

export function getLanguageIcon(name: string): LanguageIcon {
  return LANGUAGE_ICONS[name.trim().toLowerCase()] ?? FALLBACK;
}

/**
 * Renders catalog language keys (often lowercase, e.g. `typescript`) as their
 * canonical display names. Falls back to capitalizing the first letter so an
 * unmapped facet still reads cleanly.
 */
const DISPLAY_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  golang: 'Go',
};

export function getLanguageDisplayName(name: string): string {
  const trimmed = name.trim();
  const mapped = DISPLAY_NAMES[trimmed.toLowerCase()];

  if (mapped) {
    return mapped;
  }

  if (!trimmed) {
    return 'Other';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
