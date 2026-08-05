import { formatLocalModelHealthFailure, type LocalModelHealthFailure } from '~/lib/i18n/catalogs/client-visible-errors';

// Simple EventEmitter implementation for browser compatibility
class SimpleEventEmitter {
  private _events: Record<string, ((...args: any[]) => void)[]> = {};

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this._events[event]) {
      this._events[event] = [];
    }

    this._events[event].push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    if (!this._events[event]) {
      return;
    }

    this._events[event] = this._events[event].filter((l) => l !== listener);
  }

  emit(event: string, ...args: any[]): void {
    if (!this._events[event]) {
      return;
    }

    this._events[event].forEach((listener) => listener(...args));
  }

  removeAllListeners(): void {
    this._events = {};
  }
}

export interface ModelHealthStatus {
  provider: 'Ollama' | 'LMStudio' | 'OpenAILike';
  baseUrl: string;
  status: 'healthy' | 'unhealthy' | 'checking' | 'unknown';
  lastChecked: Date;
  responseTime?: number;
  error?: string;
  availableModels?: string[];
  version?: string;
}

export interface HealthCheckResult {
  isHealthy: boolean;
  responseTime: number;
  error?: string;
  availableModels?: string[];
  version?: string;
}

type ProviderHealthCheckResult = Omit<HealthCheckResult, 'error'> & {
  failure?: LocalModelHealthFailure;
};

export class LocalModelHealthMonitor extends SimpleEventEmitter {
  private _healthStatuses = new Map<string, ModelHealthStatus>();
  private _healthFailures = new Map<string, LocalModelHealthFailure>();
  private _checkIntervals = new Map<string, NodeJS.Timeout>();
  private readonly _defaultCheckInterval = 30000; // 30 seconds
  private readonly _healthCheckTimeout = 10000; // 10 seconds
  private _languageListenerAttached = false;
  private readonly _handleLanguageChange = (event: Event): void => {
    const language =
      event instanceof CustomEvent && typeof event.detail?.language === 'string' ? event.detail.language : undefined;

    this.refreshLocalizedErrors(language);
  };

  constructor() {
    super();
    this._attachLanguageChangeListener();
  }

  /**
   * Start monitoring a local provider
   */
  startMonitoring(provider: 'Ollama' | 'LMStudio' | 'OpenAILike', baseUrl: string, checkInterval?: number): void {
    this._attachLanguageChangeListener();

    const key = this._getProviderKey(provider, baseUrl);

    // Stop existing monitoring if any
    this.stopMonitoring(provider, baseUrl);

    // Initialize status
    this._healthStatuses.set(key, {
      provider,
      baseUrl,
      status: 'unknown',
      lastChecked: new Date(),
    });

    /*
     * Start periodic health checks. performHealthCheck emits 'statusChanged';
     * if a listener throws, the returned promise rejects — guard so a fire-and-
     * forget tick can't surface as an unhandled rejection.
     */
    const interval = setInterval(() => {
      this.performHealthCheck(provider, baseUrl).catch((error) => {
        console.warn(`Health check failed for ${provider}:`, error);
      });
    }, checkInterval || this._defaultCheckInterval);

    this._checkIntervals.set(key, interval);

    // Perform initial health check
    this.performHealthCheck(provider, baseUrl).catch((error) => {
      console.warn(`Health check failed for ${provider}:`, error);
    });
  }

  /**
   * Stop monitoring a local provider
   */
  stopMonitoring(provider: 'Ollama' | 'LMStudio' | 'OpenAILike', baseUrl: string): void {
    const key = this._getProviderKey(provider, baseUrl);

    const interval = this._checkIntervals.get(key);

    if (interval) {
      clearInterval(interval);
      this._checkIntervals.delete(key);
    }

    this._healthStatuses.delete(key);
    this._healthFailures.delete(key);
  }

  /**
   * Get current health status for a provider
   */
  getHealthStatus(provider: 'Ollama' | 'LMStudio' | 'OpenAILike', baseUrl: string): ModelHealthStatus | undefined {
    const key = this._getProviderKey(provider, baseUrl);
    return this._healthStatuses.get(key);
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses(): ModelHealthStatus[] {
    return Array.from(this._healthStatuses.values());
  }

  /**
   * Perform a manual health check
   */
  async performHealthCheck(
    provider: 'Ollama' | 'LMStudio' | 'OpenAILike',
    baseUrl: string,
  ): Promise<HealthCheckResult> {
    this._attachLanguageChangeListener();

    const key = this._getProviderKey(provider, baseUrl);
    const startTime = Date.now();

    // Update status to checking
    const currentStatus = this._healthStatuses.get(key);

    if (currentStatus) {
      currentStatus.status = 'checking';
      currentStatus.lastChecked = new Date();
      this.emit('statusChanged', currentStatus);
    }

    try {
      const result = await this._checkProviderHealth(provider, baseUrl);
      const responseTime = Date.now() - startTime;
      const localizedError = result.failure ? formatLocalModelHealthFailure(result.failure) : undefined;

      if (result.failure) {
        this._healthFailures.set(key, result.failure);
      } else {
        this._healthFailures.delete(key);
      }

      // Update health status
      const healthStatus: ModelHealthStatus = {
        provider,
        baseUrl,
        status: result.isHealthy ? 'healthy' : 'unhealthy',
        lastChecked: new Date(),
        responseTime,
        error: localizedError,
        availableModels: result.availableModels,
        version: result.version,
      };

      this._healthStatuses.set(key, healthStatus);
      this.emit('statusChanged', healthStatus);

      return {
        isHealthy: result.isHealthy,
        responseTime,
        error: localizedError,
        availableModels: result.availableModels,
        version: result.version,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const failure = this._failureFromRequestError(error, provider);
      const errorMessage = formatLocalModelHealthFailure(failure);

      this._healthFailures.set(key, failure);

      const healthStatus: ModelHealthStatus = {
        provider,
        baseUrl,
        status: 'unhealthy',
        lastChecked: new Date(),
        responseTime,
        error: errorMessage,
      };

      this._healthStatuses.set(key, healthStatus);
      this.emit('statusChanged', healthStatus);

      return {
        isHealthy: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Check health of a specific provider
   */
  private async _checkProviderHealth(
    provider: 'Ollama' | 'LMStudio' | 'OpenAILike',
    baseUrl: string,
  ): Promise<ProviderHealthCheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._healthCheckTimeout);

    try {
      switch (provider) {
        case 'Ollama':
          return await this._checkOllamaHealth(baseUrl, controller.signal);
        case 'LMStudio':
          return await this._checkLMStudioHealth(baseUrl, controller.signal);
        case 'OpenAILike':
          return await this._checkOpenAILikeHealth(baseUrl, controller.signal);
        default:
          return {
            isHealthy: false,
            responseTime: 0,
            failure: { kind: 'unsupportedProvider', provider },
          };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check Ollama health
   */
  private async _checkOllamaHealth(baseUrl: string, signal: AbortSignal): Promise<ProviderHealthCheckResult> {
    try {
      console.log(`[Health Check] Checking Ollama at ${baseUrl}`);

      // Check if Ollama is running
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal,
      });

      if (!response.ok) {
        return {
          isHealthy: false,
          responseTime: 0,
          failure: { kind: 'http', provider: 'Ollama', status: response.status },
        };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((model) => model.name) || [];

      console.log(`[Health Check] Ollama healthy with ${models.length} models`);

      // Try to get version info
      let version: string | undefined;

      try {
        const versionResponse = await fetch(`${baseUrl}/api/version`, { signal });

        if (versionResponse.ok) {
          const versionData = (await versionResponse.json()) as { version?: string };
          version = versionData.version;
        }
      } catch {
        // Version endpoint might not be available in older versions
      }

      return {
        isHealthy: true,
        responseTime: 0, // Will be calculated by caller
        availableModels: models,
        version,
      };
    } catch (error) {
      console.error(`[Health Check] Ollama health check failed:`, error);
      return {
        isHealthy: false,
        responseTime: 0,
        failure: this._failureFromRequestError(error, 'Ollama'),
      };
    }
  }

  /**
   * Check LM Studio health
   */
  private async _checkLMStudioHealth(baseUrl: string, signal: AbortSignal): Promise<ProviderHealthCheckResult> {
    try {
      // Normalize URL to ensure /v1 prefix
      const normalizedUrl = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1`;

      const response = await fetch(`${normalizedUrl}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        // Check if this is a CORS error
        if (response.type === 'opaque' || response.status === 0) {
          return {
            isHealthy: false,
            responseTime: 0,
            failure: { kind: 'cors', provider: 'LM Studio' },
          };
        }

        return {
          isHealthy: false,
          responseTime: 0,
          failure: { kind: 'http', provider: 'LM Studio', status: response.status },
        };
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || [];

      return {
        isHealthy: true,
        responseTime: 0,
        availableModels: models,
      };
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: 0,
        failure: this._failureFromRequestError(error, 'LM Studio', true),
      };
    }
  }

  /**
   * Check OpenAI-like provider health
   */
  private async _checkOpenAILikeHealth(baseUrl: string, signal: AbortSignal): Promise<ProviderHealthCheckResult> {
    try {
      // Normalize URL to include /v1 if needed
      const normalizedUrl = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1`;

      const response = await fetch(`${normalizedUrl}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        return {
          isHealthy: false,
          responseTime: 0,
          failure: { kind: 'http', provider: 'OpenAI-compatible', status: response.status },
        };
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || [];

      return {
        isHealthy: true,
        responseTime: 0,
        availableModels: models,
      };
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: 0,
        failure: this._failureFromRequestError(error, 'OpenAI-compatible'),
      };
    }
  }

  /**
   * Re-render stored failures after an in-session locale change. The failure
   * descriptor remains language-neutral, so an English network diagnostic can
   * never be retained in the persistent provider status when French is active.
   */
  refreshLocalizedErrors(language?: string | null): void {
    for (const [key, failure] of this._healthFailures) {
      const currentStatus = this._healthStatuses.get(key);

      if (!currentStatus) {
        continue;
      }

      const localizedStatus: ModelHealthStatus = {
        ...currentStatus,
        error: formatLocalModelHealthFailure(failure, language),
      };

      this._healthStatuses.set(key, localizedStatus);
      this.emit('statusChanged', localizedStatus);
    }
  }

  private _failureFromRequestError(
    error: unknown,
    provider: string,
    treatNetworkFailureAsCors = false,
  ): LocalModelHealthFailure {
    if (error instanceof Error && error.name === 'AbortError') {
      return { kind: 'timeout', provider };
    }

    const diagnostic = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : '';

    if (
      treatNetworkFailureAsCors &&
      (error instanceof TypeError || /(?:cors|networkerror|failed to fetch)/u.test(diagnostic))
    ) {
      return { kind: 'cors', provider };
    }

    return { kind: 'requestFailed', provider };
  }

  private _attachLanguageChangeListener(): void {
    if (this._languageListenerAttached || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('vibecore:language-change', this._handleLanguageChange);
    this._languageListenerAttached = true;
  }

  /**
   * Generate a unique key for a provider
   */
  private _getProviderKey(provider: string, baseUrl: string): string {
    return `${provider}:${baseUrl}`;
  }

  /**
   * Clean up all monitoring
   */
  destroy(): void {
    // Clear all intervals
    for (const interval of this._checkIntervals.values()) {
      clearInterval(interval);
    }

    this._checkIntervals.clear();
    this._healthStatuses.clear();
    this._healthFailures.clear();
    this.removeAllListeners();

    if (this._languageListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('vibecore:language-change', this._handleLanguageChange);
      this._languageListenerAttached = false;
    }
  }
}

// Singleton instance
export const localModelHealthMonitor = new LocalModelHealthMonitor();
