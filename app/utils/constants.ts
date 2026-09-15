import { getStarterTemplatesCopy, type StarterTemplatesKey } from '~/lib/i18n/catalogs/starter-templates';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { Template } from '~/types/template';

export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;
export const MODIFICATIONS_TAG_NAME = 'bolt_file_modifications';
export const MODEL_REGEX = /^\[Model: (.*?)\]\n\n/;
export const PROVIDER_REGEX = /\[Provider: (.*?)\]\n\n/;
export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * The sentinel model value that opts a request into complexity-based routing
 * ("Auto"). OPT-IN only: DEFAULT_MODEL is unchanged, so a fresh user still
 * defaults to a concrete frontier model; Auto is used only when explicitly
 * picked. Kept here (client-safe) so both the selector UI and the server-side
 * router agree on the exact string without the UI importing a `.server` module.
 */
export const AUTO_MODEL = 'auto';
export const PROMPT_COOKIE_KEY = 'cachedPrompt';
export const TOOL_EXECUTION_APPROVAL = {
  APPROVE: 'Yes, approved.',
  REJECT: 'No, rejected.',
} as const;
export const TOOL_NO_EXECUTE_FUNCTION = 'Error: No execute function found on tool';
export const TOOL_EXECUTION_DENIED = 'Error: User denied access to tool execution';
export const TOOL_EXECUTION_ERROR = 'Error: An error occured while calling tool';

const llmManager = LLMManager.getInstance(import.meta.env);

export const PROVIDER_LIST = llmManager.getAllProviders();
export const DEFAULT_PROVIDER = llmManager.getDefaultProvider();

export const providerBaseUrlEnvKeys: Record<string, { baseUrlKey?: string; apiTokenKey?: string }> = {};
PROVIDER_LIST.forEach((provider) => {
  providerBaseUrlEnvKeys[provider.name] = {
    baseUrlKey: provider.config.baseUrlKey,
    apiTokenKey: provider.config.apiTokenKey,
  };
});

type StarterTemplateDefinition = Omit<Template, 'label' | 'description'> & {
  labelKey: StarterTemplatesKey;
  descriptionKey: StarterTemplatesKey;
};

const STARTER_TEMPLATE_DEFINITIONS: readonly StarterTemplateDefinition[] = [
  {
    name: 'Expo App',
    labelKey: 'starterTemplates.expo.label',
    descriptionKey: 'starterTemplates.expo.description',
    githubRepo: 'xKevIsDev/bolt-expo-template',
    tags: ['mobile', 'expo', 'mobile-app', 'android', 'iphone'],
    icon: 'i-bolt:expo',
  },
  {
    name: 'Basic Astro',
    labelKey: 'starterTemplates.astro.label',
    descriptionKey: 'starterTemplates.astro.description',
    githubRepo: 'xKevIsDev/bolt-astro-basic-template',
    tags: ['astro', 'blog', 'performance'],
    icon: 'i-bolt:astro',
  },
  {
    name: 'NextJS Shadcn',
    labelKey: 'starterTemplates.nextShadcn.label',
    descriptionKey: 'starterTemplates.nextShadcn.description',
    githubRepo: 'xKevIsDev/bolt-nextjs-shadcn-template',
    tags: ['nextjs', 'react', 'typescript', 'shadcn', 'tailwind'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Vite Shadcn',
    labelKey: 'starterTemplates.viteShadcn.label',
    descriptionKey: 'starterTemplates.viteShadcn.description',
    githubRepo: 'xKevIsDev/vite-shadcn',
    tags: ['vite', 'react', 'typescript', 'shadcn', 'tailwind'],
    icon: 'i-bolt:shadcn',
  },
  {
    name: 'Qwik Typescript',
    labelKey: 'starterTemplates.qwik.label',
    descriptionKey: 'starterTemplates.qwik.description',
    githubRepo: 'xKevIsDev/bolt-qwik-ts-template',
    tags: ['qwik', 'typescript', 'performance', 'resumable'],
    icon: 'i-bolt:qwik',
  },
  {
    name: 'Remix Typescript',
    labelKey: 'starterTemplates.remix.label',
    descriptionKey: 'starterTemplates.remix.description',
    githubRepo: 'xKevIsDev/bolt-remix-ts-template',
    tags: ['remix', 'typescript', 'fullstack', 'react'],
    icon: 'i-bolt:remix',
  },
  {
    name: 'Slidev',
    labelKey: 'starterTemplates.slidev.label',
    descriptionKey: 'starterTemplates.slidev.description',
    githubRepo: 'xKevIsDev/bolt-slidev-template',
    tags: ['slidev', 'presentation', 'markdown'],
    icon: 'i-bolt:slidev',
  },
  {
    name: 'Sveltekit',
    labelKey: 'starterTemplates.svelteKit.label',
    descriptionKey: 'starterTemplates.svelteKit.description',
    githubRepo: 'bolt-sveltekit-template',
    tags: ['svelte', 'sveltekit', 'typescript'],
    icon: 'i-bolt:svelte',
  },
  {
    name: 'Vanilla Vite',
    labelKey: 'starterTemplates.vanillaVite.label',
    descriptionKey: 'starterTemplates.vanillaVite.description',
    githubRepo: 'xKevIsDev/vanilla-vite-template',
    tags: ['vite', 'vanilla-js', 'minimal'],
    icon: 'i-bolt:vite',
  },
  {
    name: 'Vite React',
    labelKey: 'starterTemplates.reactVite.label',
    descriptionKey: 'starterTemplates.reactVite.description',
    githubRepo: 'xKevIsDev/bolt-vite-react-ts-template',
    tags: ['react', 'vite', 'frontend', 'website', 'app'],
    icon: 'i-bolt:react',
  },
  {
    name: 'Vite Typescript',
    labelKey: 'starterTemplates.viteTypescript.label',
    descriptionKey: 'starterTemplates.viteTypescript.description',
    githubRepo: 'xKevIsDev/bolt-vite-ts-template',
    tags: ['vite', 'typescript', 'minimal'],
    icon: 'i-bolt:typescript',
  },
  {
    name: 'Vue',
    labelKey: 'starterTemplates.vue.label',
    descriptionKey: 'starterTemplates.vue.description',
    githubRepo: 'xKevIsDev/bolt-vue-template',
    tags: ['vue', 'typescript', 'frontend'],
    icon: 'i-bolt:vue',
  },
  {
    name: 'Angular',
    labelKey: 'starterTemplates.angular.label',
    descriptionKey: 'starterTemplates.angular.description',
    githubRepo: 'xKevIsDev/bolt-angular-template',
    tags: ['angular', 'typescript', 'frontend', 'spa'],
    icon: 'i-bolt:angular',
  },
  {
    name: 'SolidJS',
    labelKey: 'starterTemplates.solid.label',
    descriptionKey: 'starterTemplates.solid.description',
    githubRepo: 'xKevIsDev/solidjs-ts-tw',
    tags: ['solidjs'],
    icon: 'i-bolt:solidjs',
  },
];

export function getStarterTemplates(language?: string | null): Template[] {
  const copy = getStarterTemplatesCopy(language);

  return STARTER_TEMPLATE_DEFINITIONS.map(({ labelKey, descriptionKey, ...template }) => ({
    ...template,
    label: copy[labelKey],
    description: copy[descriptionKey],
  }));
}

/**
 * Stable English data for server-side template selection and repository allowlists.
 * Interactive UI consumers should call `getStarterTemplates(activeLanguage)` so a
 * language switch updates visible labels without changing technical identifiers.
 */
export const STARTER_TEMPLATES: Template[] = getStarterTemplates('en');
