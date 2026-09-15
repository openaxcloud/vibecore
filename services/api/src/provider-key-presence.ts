/*
 * Une seule réponse à « ce fournisseur a-t-il une clé ? ».
 *
 * Ce module est volontairement AUTONOME : il n'importe rien du reste de l'API.
 * C'est ce qui permet de le tester sans charger tout le graphe d'`app.ts` — et
 * c'est aussi ce qui garantit qu'aucune des trois surfaces ne peut se remettre
 * à recalculer la présence dans son coin.
 */
export const PROVIDER_KEY_ENV: Record<string, string> = {
  AmazonBedrock: 'AWS_BEDROCK_CONFIG',
  Anthropic: 'ANTHROPIC_API_KEY',
  Cerebras: 'CEREBRAS_API_KEY',
  Cohere: 'COHERE_API_KEY',
  Deepseek: 'DEEPSEEK_API_KEY',
  Fireworks: 'FIREWORKS_API_KEY',
  Github: 'GITHUB_API_KEY',
  Google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  Groq: 'GROQ_API_KEY',
  HuggingFace: 'HuggingFace_API_KEY',
  Hyperbolic: 'HYPERBOLIC_API_KEY',
  Mistral: 'MISTRAL_API_KEY',
  Moonshot: 'MOONSHOT_API_KEY',
  OpenAI: 'OPENAI_API_KEY',
  OpenAILike: 'OPENAI_LIKE_API_KEY',
  OpenRouter: 'OPEN_ROUTER_API_KEY',
  Perplexity: 'PERPLEXITY_API_KEY',
  Together: 'TOGETHER_API_KEY',
  'Z.ai': 'ZAI_API_KEY',
  xAI: 'XAI_API_KEY',
};

// Ces deux-là n'exigent pas de clé : une base URL suffit.
const KEYLESS_LLM_PROVIDERS = new Set(['LMStudio', 'Ollama']);

/*
 * BUG-ADMIN-002 — UNE seule réponse à « ce fournisseur a-t-il une clé ? ».
 *
 * Trois surfaces répondaient différemment à cette question :
 *   providerAdminView            db seule, mais exposait `source` (db|env|none)
 *   /admin/provider-health       keyless || db || env   (correct)
 *   /admin/providers/fallback-order  db SEULE           (faux)
 *
 * Or le panneau « Fournisseurs d'IA » lit justement `fallback-order`. Mesuré en
 * production le 2026-09-01 : 0 ligne sur 30 porte une clé en base — les clés
 * vivent dans le Secret Kubernetes et arrivent par variable d'environnement. Le
 * panneau annonçait donc « aucune clé » pour les 30 fournisseurs, y compris les
 * quatre qui font tourner la plateforme. C'est exactement ce qui pousse un
 * opérateur à RECOPIER une clé déjà en place — le geste qu'on veut interdire.
 *
 * La présence est donc dérivée ici, une fois, et les trois surfaces l'appellent.
 * On ne renvoie JAMAIS la valeur : seulement sa présence et sa provenance.
 */
export function resolveProviderKeyPresence(provider: string, apiKeyEnc?: string | null) {
  const envKey = PROVIDER_KEY_ENV[provider];
  const hasDbKey = Boolean(apiKeyEnc);
  const hasEnvKey = Boolean(envKey) && Boolean(process.env[envKey]?.trim());

  /*
   * `keyConfigured` : un fournisseur SANS clé (Ollama, LM Studio) est configuré
   * par sa base URL, pas par une clé — il compte donc comme configuré.
   *
   * `source` : la base l'emporte sur l'environnement, exactement comme à
   * l'exécution (voir resolveProviderKey dans l'ai-gateway).
   */
  return {
    hasDbKey,
    hasEnvKey,
    keyConfigured: KEYLESS_LLM_PROVIDERS.has(provider) || hasDbKey || hasEnvKey,
    source: hasDbKey ? ('db' as const) : hasEnvKey ? ('env' as const) : ('none' as const),
    envVar: envKey ?? null,
  };
}
