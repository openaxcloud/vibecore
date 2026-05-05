import { wrapLanguageModel, type LanguageModelV1 } from 'ai';
import { isReasoningModel, modelDisallowsTemperature } from './constants';

export function removeUnsupportedModelSettings(model: LanguageModelV1, modelName: string, providerName: string) {
  if (!isReasoningModel(modelName) && !modelDisallowsTemperature(modelName, providerName)) {
    return model;
  }

  return wrapLanguageModel({
    model,
    middleware: {
      transformParams: async ({ params }) => {
        const {
          temperature,
          topP,
          top_p: topPSnake,
          presencePenalty,
          frequencyPenalty,
          logprobs,
          topLogprobs,
          logitBias,
          ...rest
        } = params as typeof params & {
          top_p?: unknown;
          logprobs?: unknown;
          topLogprobs?: unknown;
          logitBias?: unknown;
        };

        void temperature;
        void topP;
        void topPSnake;
        void presencePenalty;
        void frequencyPenalty;
        void logprobs;
        void topLogprobs;
        void logitBias;

        return rest;
      },
    },
  });
}
