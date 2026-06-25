import { Code2 } from 'lucide-react';
import type { IconType } from 'react-icons';
import {
  SiAstro,
  SiDjango,
  SiDotnet,
  SiExpo,
  SiExpress,
  SiFastapi,
  SiFastify,
  SiFlutter,
  SiGo,
  SiLaravel,
  SiMongodb,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxtdotjs,
  SiOpenai,
  SiPostgresql,
  SiPrisma,
  SiPython,
  SiReact,
  SiRemix,
  SiRubyonrails,
  SiRust,
  SiShopify,
  SiSocketdotio,
  SiStripe,
  SiSupabase,
  SiSvelte,
  SiTailwindcss,
  SiTypescript,
  SiVite,
  SiVuedotjs,
} from 'react-icons/si';

interface TechBrand {
  Icon: IconType;

  /** Official Simple Icons brand hex; dark-on-dark marks forced to a light value. */
  brand: string;
}

/*
 * Real per-technology brand logos. Keyed by lowercase tokens that appear in a
 * template's framework / technologies / tags / language. Ordered roughly by
 * specificity when scanning (frameworks before languages) via TECH_PRIORITY.
 */
const TECH_BRANDS: Record<string, TechBrand> = {
  next: { Icon: SiNextdotjs, brand: '#FFFFFF' },
  'next.js': { Icon: SiNextdotjs, brand: '#FFFFFF' },
  nextjs: { Icon: SiNextdotjs, brand: '#FFFFFF' },
  remix: { Icon: SiRemix, brand: '#FFFFFF' },
  astro: { Icon: SiAstro, brand: '#FF5D01' },
  nuxt: { Icon: SiNuxtdotjs, brand: '#00DC82' },
  vue: { Icon: SiVuedotjs, brand: '#4FC08D' },
  svelte: { Icon: SiSvelte, brand: '#FF3E00' },
  sveltekit: { Icon: SiSvelte, brand: '#FF3E00' },
  expo: { Icon: SiExpo, brand: '#FFFFFF' },
  flutter: { Icon: SiFlutter, brand: '#02569B' },
  nestjs: { Icon: SiNestjs, brand: '#E0234E' },
  nest: { Icon: SiNestjs, brand: '#E0234E' },
  fastify: { Icon: SiFastify, brand: '#FFFFFF' },
  express: { Icon: SiExpress, brand: '#FFFFFF' },
  fastapi: { Icon: SiFastapi, brand: '#009688' },
  django: { Icon: SiDjango, brand: '#44B78B' },
  laravel: { Icon: SiLaravel, brand: '#FF2D20' },
  rails: { Icon: SiRubyonrails, brand: '#D30001' },
  'ruby on rails': { Icon: SiRubyonrails, brand: '#D30001' },
  vite: { Icon: SiVite, brand: '#646CFF' },
  react: { Icon: SiReact, brand: '#61DAFB' },
  'react native': { Icon: SiReact, brand: '#61DAFB' },
  tailwind: { Icon: SiTailwindcss, brand: '#06B6D4' },
  tailwindcss: { Icon: SiTailwindcss, brand: '#06B6D4' },
  prisma: { Icon: SiPrisma, brand: '#5A67D8' },
  supabase: { Icon: SiSupabase, brand: '#3FCF8E' },
  postgres: { Icon: SiPostgresql, brand: '#4169E1' },
  postgresql: { Icon: SiPostgresql, brand: '#4169E1' },
  mongodb: { Icon: SiMongodb, brand: '#47A248' },
  mongo: { Icon: SiMongodb, brand: '#47A248' },
  stripe: { Icon: SiStripe, brand: '#635BFF' },
  shopify: { Icon: SiShopify, brand: '#7AB55C' },
  'socket.io': { Icon: SiSocketdotio, brand: '#FFFFFF' },
  socketio: { Icon: SiSocketdotio, brand: '#FFFFFF' },
  websocket: { Icon: SiSocketdotio, brand: '#FFFFFF' },
  openai: { Icon: SiOpenai, brand: '#FFFFFF' },
  ai: { Icon: SiOpenai, brand: '#FFFFFF' },
  typescript: { Icon: SiTypescript, brand: '#3178C6' },
  ts: { Icon: SiTypescript, brand: '#3178C6' },
  python: { Icon: SiPython, brand: '#3776AB' },
  go: { Icon: SiGo, brand: '#00ADD8' },
  golang: { Icon: SiGo, brand: '#00ADD8' },
  rust: { Icon: SiRust, brand: '#FFFFFF' },
  node: { Icon: SiNodedotjs, brand: '#5FA04E' },
  'node.js': { Icon: SiNodedotjs, brand: '#5FA04E' },
  nodejs: { Icon: SiNodedotjs, brand: '#5FA04E' },
  dotnet: { Icon: SiDotnet, brand: '#512BD4' },
  '.net': { Icon: SiDotnet, brand: '#512BD4' },
};

// Frameworks/libraries win over bare languages when a template lists both.
const TECH_PRIORITY = [
  'next.js',
  'nextjs',
  'next',
  'remix',
  'astro',
  'nuxt',
  'sveltekit',
  'svelte',
  'vue',
  'expo',
  'react native',
  'react',
  'flutter',
  'nestjs',
  'fastify',
  'express',
  'fastapi',
  'django',
  'laravel',
  'rails',
  'vite',
  'tailwindcss',
  'tailwind',
  'prisma',
  'supabase',
  'postgresql',
  'postgres',
  'mongodb',
  'stripe',
  'shopify',
  'socket.io',
  'socketio',
  'openai',
  'dotnet',
  'go',
  'rust',
  'python',
  'typescript',
  'node.js',
  'nodejs',
  'node',
];

export interface TemplateLike {
  name?: string;
  framework?: string | null;
  language?: string | null;
  technologies?: string[] | null;
  languages?: string[] | null;
  tags?: string[] | null;
  icon?: string | null;
}

/**
 * Resolve a single tech token (e.g. a technology/tag string like "React",
 * "next.js", "TYPESCRIPT") to its brand logo, case- and format-tolerant.
 * Returns undefined when the token matches no known tech (so callers can skip
 * rendering a meaningless icon on a tag chip).
 */
export function resolveTechToken(token: string): TechBrand | undefined {
  const t = String(token).toLowerCase().trim();

  if (TECH_BRANDS[t]) {
    return TECH_BRANDS[t];
  }

  for (const key of TECH_PRIORITY) {
    if (t === key || t.includes(key)) {
      return TECH_BRANDS[key];
    }
  }

  return undefined;
}

/** Resolve a template to its real tech brand logo, or a neutral code fallback. */
export function resolveTemplateTech(template: TemplateLike): TechBrand {
  const tokens = [
    template.framework,
    template.language,
    ...(template.technologies ?? []),
    ...(template.languages ?? []),
    ...(template.tags ?? []),
    template.icon,
    template.name,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim());

  // Direct hits first (exact token), in priority order.
  for (const key of TECH_PRIORITY) {
    if (tokens.includes(key)) {
      return TECH_BRANDS[key];
    }
  }

  // Substring scan (e.g. token "react-vite-saas" contains "react").
  for (const key of TECH_PRIORITY) {
    if (tokens.some((t) => t.includes(key))) {
      return TECH_BRANDS[key];
    }
  }

  return { Icon: Code2, brand: '#F26207' };
}

/**
 * Renders a template's real tech logo inside a consistent tile. Brand color on a
 * neutral dark surface — never the orange-on-orange/identical-square placeholder.
 */
export function TemplateTechIcon({ template, className }: { template: TemplateLike; className?: string }) {
  const { Icon, brand } = resolveTemplateTech(template);

  return (
    <span
      className={
        className ??
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface-tertiary)]'
      }
    >
      <Icon className="h-5 w-5" style={{ color: brand }} aria-hidden />
    </span>
  );
}
