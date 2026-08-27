import { getFineTunedPrompt } from './prompts/new-prompt';
import optimized from './prompts/optimized';
import { getSystemPrompt } from './prompts/prompts';
import type { DesignScheme } from '~/types/design-scheme';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  designScheme?: DesignScheme;
  supabase?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };

  /*
   * A3 (Wave A): gate the heavy <database_instructions> / <mobile_app_instructions>
   * blocks. Optional and default to true (byte-identical prompt) when omitted;
   * stream-text.ts sets them from the request's DB/mobile intent signals.
   */
  includeDatabaseInstructions?: boolean;
  includeMobileInstructions?: boolean;
}

export type PromptLibraryId = 'default' | 'original' | 'optimized';

export class PromptLibrary {
  static library: Record<PromptLibraryId, { get: (options: PromptOptions) => string }> = {
    default: {
      get: (options) =>
        getFineTunedPrompt(
          options.cwd,
          options.supabase,
          options.designScheme,
          options.includeDatabaseInstructions,
          options.includeMobileInstructions,
        ),
    },
    original: {
      get: (options) =>
        getSystemPrompt(
          options.cwd,
          options.supabase,
          options.designScheme,
          options.includeDatabaseInstructions,
          options.includeMobileInstructions,
        ),
    },
    optimized: {
      get: (options) => optimized(options),
    },
  };
  static getList() {
    return (Object.keys(this.library) as PromptLibraryId[]).map((id) => ({ id }));
  }
  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    /*
     * Fall back to the default prompt for an unknown id rather than throwing a
     * bare string. The only caller chains `?? getSystemPrompt()`, but a throw
     * would bypass that fallback and abort the entire chat-stream setup.
     */
    const prompt = this.library[promptId as PromptLibraryId] ?? this.library.default;

    return prompt.get(options);
  }
}
