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

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
    default: {
      label: 'Default Prompt',
      description: 'An fine tuned prompt for better results and less token usage',
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
      label: 'Old Default Prompt',
      description: 'The OG battle tested default system Prompt',
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
      label: 'Optimized Prompt (experimental)',
      description: 'An Experimental version of the prompt for lower token usage',
      get: (options) => optimized(options),
    },
  };
  static getList() {
    return Object.entries(this.library).map(([key, value]) => {
      const { label, description } = value;
      return {
        id: key,
        label,
        description,
      };
    });
  }
  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    /*
     * Fall back to the default prompt for an unknown id rather than throwing a
     * bare string. The only caller chains `?? getSystemPrompt()`, but a throw
     * would bypass that fallback and abort the entire chat-stream setup.
     */
    const prompt = this.library[promptId] ?? this.library.default;

    return prompt.get(options);
  }
}
