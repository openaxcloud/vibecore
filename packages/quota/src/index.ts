export interface QuotaLimit {
  key: string;
  limit: number;
}

export interface QuotaUsage {
  key: string;
  used: number;
}

export function assertWithinQuota(limit: QuotaLimit, usage: QuotaUsage, increment = 1) {
  if (usage.used + increment > limit.limit) {
    const error = new Error(`Quota exceeded for ${limit.key}`);
    Object.assign(error, { statusCode: 429, code: 'QUOTA_EXCEEDED' });
    throw error;
  }
}
