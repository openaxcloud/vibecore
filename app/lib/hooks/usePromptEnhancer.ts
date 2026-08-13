import { useRef, useState } from 'react';
import { toast } from '~/components/ui/use-toast';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('usePromptEnhancement');

const ENHANCE_ERROR_MESSAGE = 'Could not enhance the prompt. Please try again.';

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);

  /*
   * Pending deferred flush of the enhanced text; cleared on reset / re-enhance so
   * a late setInput can't clobber the user's freshly-typed input.
   */
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetEnhancer = () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }

    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  const enhancePrompt = async (
    input: string,
    setInput: (value: string) => void,
    model: string,
    provider: ProviderInfo,
    apiKeys?: Record<string, string>,
  ) => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }

    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    const requestBody: any = {
      message: input,
      model,
      provider,
    };

    if (apiKeys) {
      requestBody.apiKeys = apiKeys;
    }

    const originalInput = input;

    let response: Response;

    try {
      response = await fetch('/api/enhancer', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      logger.error(error);
      setEnhancingPrompt(false);
      setPromptEnhanced(false);
      toast.error(ENHANCE_ERROR_MESSAGE);

      return;
    }

    /*
     * A non-OK response body is an error message, not enhanced prompt text —
     * streaming it into the input would clobber the user's prompt.
     */
    if (!response.ok) {
      logger.error(`Prompt enhancer failed: ${response.status} ${response.statusText}`);
      setEnhancingPrompt(false);
      setPromptEnhanced(false);
      toast.error(ENHANCE_ERROR_MESSAGE);

      return;
    }

    const reader = response.body?.getReader();

    if (reader) {
      const decoder = new TextDecoder();

      let _input = '';
      let _error;

      try {
        setInput('');

        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          /*
           * `{ stream: true }` so multi-byte UTF-8 chars split across chunk
           * boundaries don't decode to replacement characters.
           */
          _input += decoder.decode(value, { stream: true });

          logger.trace('Set input', _input);

          setInput(_input);
        }

        // Flush any bytes buffered from an incomplete final multi-byte sequence.
        _input += decoder.decode();
      } catch (error) {
        _error = error;
        setInput(originalInput);
      } finally {
        if (_error) {
          logger.error(_error);
          setEnhancingPrompt(false);
          setPromptEnhanced(false);
          toast.error(ENHANCE_ERROR_MESSAGE);
        } else {
          setEnhancingPrompt(false);
          setPromptEnhanced(true);
          toast.success('Prompt enhanced');

          flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = undefined;
            setInput(_input);
          });
        }
      }
    } else {
      // No readable body (e.g. empty 200) — don't leave the spinner stuck on.
      setEnhancingPrompt(false);
      setPromptEnhanced(false);
    }
  };

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}
