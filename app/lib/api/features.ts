export interface Feature {
  id: string;
  name: string;
  description: string;
  viewed: boolean;
  releaseDate: string;
}

export const getFeatureFlags = async (): Promise<Feature[]> => {
  const response = await fetch('/api/feature-flags');

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'FEATURE_FLAGS_REQUEST_FAILED', status: response.status });
  }

  return response.json();
};

export const markFeatureViewed = async (featureId: string): Promise<void> => {
  const response = await fetch(`/api/feature-flags/${encodeURIComponent(featureId)}/viewed`, { method: 'POST' });

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'FEATURE_VIEWED_REQUEST_FAILED', status: response.status });
  }
};
