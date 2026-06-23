import { useState, useEffect } from 'react';
import { getFeatureFlags, markFeatureViewed, type Feature } from '~/lib/api/features';

const VIEWED_FEATURES_KEY = 'bolt_viewed_features';

const getViewedFeatures = (): string[] => {
  try {
    const stored = localStorage.getItem(VIEWED_FEATURES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setViewedFeatures = (featureIds: string[]) => {
  try {
    localStorage.setItem(VIEWED_FEATURES_KEY, JSON.stringify(featureIds));
  } catch (error) {
    console.error('Failed to persist viewed features:', error);
  }
};

export const useFeatures = () => {
  const [hasNewFeatures, setHasNewFeatures] = useState(false);
  const [unviewedFeatures, setUnviewedFeatures] = useState<Feature[]>([]);
  const [viewedFeatureIds, setViewedFeatureIds] = useState<string[]>(() => getViewedFeatures());

  useEffect(() => {
    const checkNewFeatures = async () => {
      try {
        const features = await getFeatureFlags();
        const unviewed = features.filter((feature) => !viewedFeatureIds.includes(feature.id));
        setUnviewedFeatures(unviewed);
        setHasNewFeatures(unviewed.length > 0);
      } catch (error) {
        console.error('Failed to check for new features:', error);
      }
    };

    checkNewFeatures();
  }, [viewedFeatureIds]);

  const acknowledgeFeature = async (featureId: string) => {
    try {
      await markFeatureViewed(featureId);

      const newViewedIds = [...viewedFeatureIds, featureId];
      setViewedFeatureIds(newViewedIds);
      setViewedFeatures(newViewedIds);
      setUnviewedFeatures((prev) => {
        const next = prev.filter((feature) => feature.id !== featureId);
        setHasNewFeatures(next.length > 0);

        return next;
      });
    } catch (error) {
      console.error('Failed to acknowledge feature:', error);
    }
  };

  const acknowledgeAllFeatures = async () => {
    if (unviewedFeatures.length === 0) {
      return;
    }

    /*
     * Mark each feature independently so a single failed POST does not discard the
     * progress of the others. Promise.all would reject on the first failure and gate
     * every state/persistence update, re-flagging all features as new on the next mount.
     */
    const results = await Promise.allSettled(
      unviewedFeatures.map(async (feature) => {
        await markFeatureViewed(feature.id);
        return feature.id;
      }),
    );

    const succeededIds = new Set<string>();

    let firstError: unknown;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeededIds.add(unviewedFeatures[index].id);
      } else if (firstError === undefined) {
        firstError = result.reason;
      }
    });

    if (succeededIds.size > 0) {
      const newViewedIds = [...viewedFeatureIds, ...succeededIds];
      setViewedFeatureIds(newViewedIds);
      setViewedFeatures(newViewedIds);

      const remaining = unviewedFeatures.filter((feature) => !succeededIds.has(feature.id));
      setUnviewedFeatures(remaining);
      setHasNewFeatures(remaining.length > 0);
    }

    if (firstError !== undefined) {
      console.error('Failed to acknowledge all features:', firstError);
    }
  };

  return { hasNewFeatures, unviewedFeatures, acknowledgeFeature, acknowledgeAllFeatures };
};
