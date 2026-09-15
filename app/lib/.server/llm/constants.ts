/*
 * Maximum tokens for response generation (updated for modern model capabilities)
 * This serves as a fallback when model-specific limits are unavailable
 * Modern models like Claude 3.5, GPT-4o, and Gemini Pro support 128k+ tokens
 */
export const MAX_TOKENS = 128000;

/*
 * Provider-specific default completion token limits
 * Used as fallbacks when model doesn't specify maxCompletionTokens
 */
export const PROVIDER_COMPLETION_LIMITS: Record<string, number> = {
  /*
   * Fallback ONLY for models that don't declare their own maxCompletionTokens
   * (gpt-4.1/4o etc. already set 16k–32k explicitly). 4096 was far below what
   * every current OpenAI chat model supports (>=16k) and silently truncated
   * multi-file generations mid-file — the model stopped emitting at 4k, leaving
   * the in-flight source file with an unterminated string / unbalanced brace.
   * 16384 matches the gpt-4o floor; per-tenant output stays capped by the plan's
   * ai.outputTokens quota and finishReason:'length' is still auto-continued.
   */
  OpenAI: 16384,
  Github: 16384, // GitHub Models are OpenAI-compatible
  Anthropic: 64000, // Conservative limit for Claude 4 models (Opus: 32k, Sonnet: 64k)
  Google: 8192, // Fallback only for Gemini models that don't declare maxCompletionTokens; 2.5/3.x declare 65536 and win via getCompletionTokenLimit()
  Cohere: 4000,
  DeepSeek: 8192,
  Groq: 8192,
  HuggingFace: 4096,
  Mistral: 8192,
  Ollama: 8192,
  OpenRouter: 8192,
  Perplexity: 8192,
  Together: 8192,
  xAI: 8192,
  LMStudio: 8192,
  OpenAILike: 8192,
  AmazonBedrock: 8192,
  Hyperbolic: 8192,
};

/*
 * Reasoning models that require maxCompletionTokens instead of maxTokens
 * These models use internal reasoning tokens and have different API parameter requirements
 */
export function isReasoningModel(modelName: string): boolean {
  return /^(o1|o3|gpt-5)/i.test(modelName);
}

export function modelDisallowsTemperature(modelName: string, providerName?: string): boolean {
  void modelName;
  void providerName;

  return true;
}

export function temperatureOptionsForModel(modelName: string, providerName?: string): { temperature?: number } {
  void modelName;
  void providerName;

  return {};
}

/*
 * Caps how many times a `finishReason: 'length'` response is auto-continued
 * within one request. Each segment is bounded by the model's per-response token
 * limit (often 4k–8k), so the total output ceiling is roughly
 * MAX_RESPONSE_SEGMENTS × that limit. At 2 a from-scratch multi-file app
 * (15–25 files) routinely ran out of segments and the generation hard-stopped
 * mid-file — leaving e.g. a truncated vite.config.ts that makes the dev server
 * exit 127/1 and the preview blank. 8 gives a realistic full app room to finish
 * while still bounding runaway 'length' loops. Per-tenant output is still capped
 * independently by the plan's ai.outputTokens quota.
 */
export const MAX_RESPONSE_SEGMENTS = 8;

/*
 * Budget de temps d'UN segment de génération, en millisecondes.
 *
 * Sert à dimensionner la borne de la chaîne côté route de chat : la garde
 * arme son délai une seule fois, avant le premier segment, et ne le ré-arme
 * jamais — la borne doit donc couvrir `MAX_RESPONSE_SEGMENTS + 1` appels
 * fournisseur (les continuations plus l'appel initial), pas un seul.
 *
 * 240 s vient de la mesure : la plus longue génération SAINE observée en
 * production tenait 215 s pour un segment. La marge au-dessus est délibérée —
 * la borne vise l'anomalie (un `onFinish` qui ne revient jamais), et couper
 * une génération saine coûte bien plus cher que d'attendre une minute de plus
 * une génération réellement bloquée.
 *
 * La constante vit ICI, à côté du nombre de segments, pour que les deux se
 * lisent ensemble : c'est leur PRODUIT qui est la vraie borne, et les séparer
 * est exactement ce qui a produit une borne dimensionnée pour un segment.
 */
export const BUDGET_PAR_SEGMENT_MS = 240_000;

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
  isLocked?: boolean;
  lockedByFolder?: string;
}

export interface Folder {
  type: 'folder';
  isLocked?: boolean;
  lockedByFolder?: string;
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.json',
  '**/*lock.yml',
];
