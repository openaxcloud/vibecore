import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { logStore } from '~/lib/stores/logs';
import type { LogEntry } from '~/lib/stores/logs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/Collapsible';
import { Progress } from '~/components/ui/Progress';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Badge } from '~/components/ui/Badge';
import { cn } from '~/lib/utils';

interface SystemInfo {
  os: string;
  arch: string;
  platform: string;
  cpus: string;
  memory: {
    total: string;
    free: string;
    used: string;
    percentage: number;
  };
  node: string;
  browser: {
    name: string;
    version: string;
    language: string;
    userAgent: string;
    cookiesEnabled: boolean;
    online: boolean;
    platform: string;
    cores: number;
  };
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelRatio: number;
  };
  time: {
    timezone: string;
    offset: number;
    locale: string;
  };
  performance: {
    memory: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
      usagePercentage: number;
    };
    timing: {
      loadTime: number;
      domReadyTime: number;
      readyStart: number;
      redirectTime: number;
      appcacheTime: number;
      unloadEventTime: number;
      lookupDomainTime: number;
      connectTime: number;
      requestTime: number;
      initDomTreeTime: number;
      loadEventTime: number;
    };
    navigation: {
      type: number;
      redirectCount: number;
    };
  };
  network: {
    downlink: number;
    effectiveType: string;
    rtt: number;
    saveData: boolean;
    type: string;
  };
  battery?: {
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
    level: number;
  };
  storage: {
    quota: number;
    usage: number;
    persistent: boolean;
    temporary: boolean;
  };
}

interface WebAppInfo {
  // Local WebApp Info
  name: string;
  version: string;
  description: string;
  license: string;
  nodeVersion: string;
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };

  // Build Info
  buildTime?: string;
  buildNumber?: string;
  environment?: string;

  // Git Info
  gitInfo?: {
    branch: string;
    commit: string;
    commitTime: string;
    author: string;
    remoteUrl: string;
  };

  // GitHub Repository Info
  repoInfo?: {
    name: string;
    fullName: string;
    description: string;
    stars: number;
    forks: number;
    openIssues: number;
    defaultBranch: string;
    lastUpdate: string;
    owner: {
      login: string;
      avatarUrl: string;
    };
  };
}

// Add interface for GitHub API response
interface GitHubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

// Add interface for Git info response
interface GitInfo {
  branch: string;
  commit: string;
  commitTime: string;
  author: string;
  remoteUrl: string;
}

export default function DebugTab() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [webAppInfo, setWebAppInfo] = useState<WebAppInfo | null>(null);
  const [loading, setLoading] = useState({
    systemInfo: false,
    performance: false,
    errors: false,
    webAppInfo: false,
  });
  const [errorLog, setErrorLog] = useState<{
    errors: any[];
    lastCheck: string | null;
  }>({
    errors: [],
    lastCheck: null,
  });

  // Add section collapse state
  const [openSections, setOpenSections] = useState({
    system: true,
    performance: true,
    webapp: true,
    errors: true,
  });

  // Fetch initial data
  useEffect(() => {
    getSystemInfo();
    getWebAppInfo();
  }, []);

  // Set up error listeners when component mounts
  useEffect(() => {
    const errors: any[] = [];

    const handleError = (event: ErrorEvent) => {
      errors.push({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        error: event.error,
        timestamp: new Date().toISOString(),
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      errors.push({
        type: 'unhandledRejection',
        reason: event.reason,
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const getSystemInfo = async () => {
    try {
      setLoading((prev) => ({ ...prev, systemInfo: true }));

      // Get browser info
      const ua = navigator.userAgent;
      const browserName = ua.includes('Firefox')
        ? 'Firefox'
        : ua.includes('Chrome')
          ? 'Chrome'
          : ua.includes('Safari')
            ? 'Safari'
            : ua.includes('Edge')
              ? 'Edge'
              : 'Unknown';
      const browserVersion = ua.match(/(Firefox|Chrome|Safari|Edge)\/([0-9.]+)/)?.[2] || 'Unknown';

      // Get performance metrics
      const memory = (performance as any).memory || {};
      const timing = performance.timing;
      const navigation = performance.navigation;
      const connection = (navigator as any).connection;

      // Get battery info
      let batteryInfo;

      try {
        const battery = await (navigator as any).getBattery();
        batteryInfo = {
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
          level: battery.level * 100,
        };
      } catch {
        console.log('Battery API not supported');
      }

      // Get storage info
      let storageInfo = {
        quota: 0,
        usage: 0,
        persistent: false,
        temporary: false,
      };

      try {
        const storage = await navigator.storage.estimate();
        const persistent = await navigator.storage.persist();
        storageInfo = {
          quota: storage.quota || 0,
          usage: storage.usage || 0,
          persistent,
          temporary: !persistent,
        };
      } catch {
        console.log('Storage API not supported');
      }

      // Get memory info from browser performance API
      const performanceMemory = (performance as any).memory || {};
      const totalMemory = performanceMemory.jsHeapSizeLimit || 0;
      const usedMemory = performanceMemory.usedJSHeapSize || 0;
      const freeMemory = totalMemory - usedMemory;
      const memoryPercentage = totalMemory ? (usedMemory / totalMemory) * 100 : 0;

      const systemInfo: SystemInfo = {
        os: navigator.platform,
        arch: navigator.userAgent.includes('x64') ? 'x64' : navigator.userAgent.includes('arm') ? 'arm' : 'unknown',
        platform: navigator.platform,
        cpus: navigator.hardwareConcurrency + ' cores',
        memory: {
          total: formatBytes(totalMemory),
          free: formatBytes(freeMemory),
          used: formatBytes(usedMemory),
          percentage: Math.round(memoryPercentage),
        },
        node: 'browser',
        browser: {
          name: browserName,
          version: browserVersion,
          language: navigator.language,
          userAgent: navigator.userAgent,
          cookiesEnabled: navigator.cookieEnabled,
          online: navigator.onLine,
          platform: navigator.platform,
          cores: navigator.hardwareConcurrency,
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          colorDepth: window.screen.colorDepth,
          pixelRatio: window.devicePixelRatio,
        },
        time: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          offset: new Date().getTimezoneOffset(),
          locale: navigator.language,
        },
        performance: {
          memory: {
            jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
            totalJSHeapSize: memory.totalJSHeapSize || 0,
            usedJSHeapSize: memory.usedJSHeapSize || 0,
            usagePercentage: memory.totalJSHeapSize ? (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100 : 0,
          },
          timing: {
            loadTime: timing.loadEventEnd - timing.navigationStart,
            domReadyTime: timing.domContentLoadedEventEnd - timing.navigationStart,
            readyStart: timing.fetchStart - timing.navigationStart,
            redirectTime: timing.redirectEnd - timing.redirectStart,
            appcacheTime: timing.domainLookupStart - timing.fetchStart,
            unloadEventTime: timing.unloadEventEnd - timing.unloadEventStart,
            lookupDomainTime: timing.domainLookupEnd - timing.domainLookupStart,
            connectTime: timing.connectEnd - timing.connectStart,
            requestTime: timing.responseEnd - timing.requestStart,
            initDomTreeTime: timing.domInteractive - timing.responseEnd,
            loadEventTime: timing.loadEventEnd - timing.loadEventStart,
          },
          navigation: {
            type: navigation.type,
            redirectCount: navigation.redirectCount,
          },
        },
        network: {
          downlink: connection?.downlink || 0,
          effectiveType: connection?.effectiveType || 'unknown',
          rtt: connection?.rtt || 0,
          saveData: connection?.saveData || false,
          type: connection?.type || 'unknown',
        },
        battery: batteryInfo,
        storage: storageInfo,
      };

      setSystemInfo(systemInfo);
      toast.success('System information updated');
    } catch (error) {
      toast.error('Failed to get system information');
      console.error('Failed to get system information:', error);
    } finally {
      setLoading((prev) => ({ ...prev, systemInfo: false }));
    }
  };

  const getWebAppInfo = async () => {
    try {
      setLoading((prev) => ({ ...prev, webAppInfo: true }));

      // Fetch local app info
      const appInfoResponse = await fetch('/api/system/app-info');

      if (!appInfoResponse.ok) {
        throw new Error('Failed to fetch webapp info');
      }

      const appData = (await appInfoResponse.json()) as Record<string, unknown>;

      // Fetch git info
      const gitInfoResponse = await fetch('/api/system/git-info');
      let gitInfo: GitInfo | undefined;

      if (gitInfoResponse.ok) {
        gitInfo = (await gitInfoResponse.json()) as GitInfo;
      }

      // Fetch GitHub repository info
      const repoInfoResponse = await fetch('https://api.github.com/repos/stackblitz-labs/bolt.diy');
      let repoInfo: WebAppInfo['repoInfo'] | undefined;

      if (repoInfoResponse.ok) {
        const repoData = (await repoInfoResponse.json()) as GitHubRepoResponse;
        repoInfo = {
          name: repoData.name,
          fullName: repoData.full_name,
          description: repoData.description ?? '',
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          openIssues: repoData.open_issues_count,
          defaultBranch: repoData.default_branch,
          lastUpdate: repoData.updated_at,
          owner: {
            login: repoData.owner.login,
            avatarUrl: repoData.owner.avatar_url,
          },
        };
      }

      // Get build info from environment variables or config
      const buildInfo = {
        buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
        buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'development',
        environment: process.env.NEXT_PUBLIC_ENV || 'development',
      };

      setWebAppInfo({
        name: appData.name as string,
        version: appData.version as string,
        description: appData.description as string,
        license: appData.license as string,
        nodeVersion: appData.nodeVersion as string,
        dependencies: appData.dependencies as Record<string, string>,
        devDependencies: appData.devDependencies as Record<string, string>,
        ...buildInfo,
        gitInfo,
        repoInfo,
      });
    } catch (error) {
      console.error('Failed to fetch webapp info:', error);
      toast.error('Failed to fetch webapp information');
    } finally {
      setLoading((prev) => ({ ...prev, webAppInfo: false }));
    }
  };

  // Helper function to format bytes to human readable format
  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size)} ${units[unitIndex]}`;
  };

  const handleLogPerformance = () => {
    try {
      setLoading((prev) => ({ ...prev, performance: true }));

      // Get performance metrics using modern Performance API
      const performanceEntries = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const memory = (performance as any).memory;

      // Calculate timing metrics
      const timingMetrics = {
        loadTime: performanceEntries.loadEventEnd - performanceEntries.startTime,
        domReadyTime: performanceEntries.domContentLoadedEventEnd - performanceEntries.startTime,
        fetchTime: performanceEntries.responseEnd - performanceEntries.fetchStart,
        redirectTime: performanceEntries.redirectEnd - performanceEntries.redirectStart,
        dnsTime: performanceEntries.domainLookupEnd - performanceEntries.domainLookupStart,
        tcpTime: performanceEntries.connectEnd - performanceEntries.connectStart,
        ttfb: performanceEntries.responseStart - performanceEntries.requestStart,
        processingTime: performanceEntries.loadEventEnd - performanceEntries.responseEnd,
      };

      // Get resource timing data
      const resourceEntries = performance.getEntriesByType('resource');
      const resourceStats = {
        totalResources: resourceEntries.length,
        totalSize: resourceEntries.reduce((total, entry) => total + (entry as any).transferSize || 0, 0),
        totalTime: Math.max(...resourceEntries.map((entry) => entry.duration)),
      };

      // Get memory metrics
      const memoryMetrics = memory
        ? {
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            totalJSHeapSize: memory.totalJSHeapSize,
            usedJSHeapSize: memory.usedJSHeapSize,
            heapUtilization: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
          }
        : null;

      // Get frame rate metrics
      let fps = 0;

      if ('requestAnimationFrame' in window) {
        const times: number[] = [];

        function calculateFPS(now: number) {
          times.push(now);

          if (times.length > 10) {
            const fps = Math.round((1000 * 10) / (now - times[0]));
            times.shift();

            return fps;
          }

          requestAnimationFrame(calculateFPS);

          return 0;
        }

        fps = calculateFPS(performance.now());
      }

      // Log all performance metrics
      logStore.logSystem('Performance Metrics', {
        timing: timingMetrics,
        resources: resourceStats,
        memory: memoryMetrics,
        fps,
        timestamp: new Date().toISOString(),
        navigationEntry: {
          type: performanceEntries.type,
          redirectCount: performanceEntries.redirectCount,
        },
      });

      toast.success('Performance metrics logged');
    } catch (error) {
      toast.error('Failed to log performance metrics');
      console.error('Failed to log performance metrics:', error);
    } finally {
      setLoading((prev) => ({ ...prev, performance: false }));
    }
  };

  const checkErrors = async () => {
    try {
      setLoading((prev) => ({ ...prev, errors: true }));

      // Get errors from log store
      const storedErrors = logStore.getLogs().filter((log: LogEntry) => log.level === 'error');

      // Combine with runtime errors
      const allErrors = [
        ...errorLog.errors,
        ...storedErrors.map((error) => ({
          type: 'stored',
          message: error.message,
          timestamp: error.timestamp,
          details: error.details || {},
        })),
      ];

      setErrorLog({
        errors: allErrors,
        lastCheck: new Date().toISOString(),
      });

      if (allErrors.length === 0) {
        toast.success('No errors found');
      } else {
        toast.warning(`Found ${allErrors.length} error(s)`);
      }
    } catch (error) {
      toast.error('Failed to check errors');
      console.error('Failed to check errors:', error);
    } finally {
      setLoading((prev) => ({ ...prev, errors: false }));
    }
  };

  const exportDebugInfo = () => {
    try {
      const debugData = {
        timestamp: new Date().toISOString(),
        system: systemInfo,
        webApp: webAppInfo,
        errors: errorLog.errors,
        performance: {
          memory: (performance as any).memory || {},
          timing: performance.timing,
          navigation: performance.navigation,
        },
      };

      const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bolt-debug-info-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Debug information exported successfully');
    } catch (error) {
      console.error('Failed to export debug info:', error);
      toast.error('Failed to export debug information');
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-4">
      {/* Quick Stats Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20">
          <div className="text-sm text-bolt-elements-textSecondary">Memory Usage</div>
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary mt-1">
            {systemInfo?.memory.percentage}%
          </div>
          <Progress value={systemInfo?.memory.percentage || 0} className="mt-2" />
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20">
          <div className="text-sm text-bolt-elements-textSecondary">Page Load Time</div>
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary mt-1">
            {systemInfo ? (systemInfo.performance.timing.loadTime / 1000).toFixed(2) + 's' : '-'}
          </div>
          <div className="text-xs text-bolt-elements-textSecondary mt-2">
            DOM Ready: {systemInfo ? (systemInfo.performance.timing.domReadyTime / 1000).toFixed(2) + 's' : '-'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
          <div className="text-sm text-bolt-elements-textSecondary">Network Speed</div>
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary mt-1">
            {systemInfo?.network.downlink || '-'} Mbps
          </div>
          <div className="text-xs text-bolt-elements-textSecondary mt-2">RTT: {systemInfo?.network.rtt || '-'} ms</div>
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20">
          <div className="text-sm text-bolt-elements-textSecondary">Errors</div>
          <div className="text-2xl font-semibold text-bolt-elements-textPrimary mt-1">{errorLog.errors.length}</div>
          <div className="text-xs text-bolt-elements-textSecondary mt-2">
            Last Check: {errorLog.lastCheck ? new Date(errorLog.lastCheck).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <button
          onClick={getSystemInfo}
          disabled={loading.systemInfo}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-[#F5F5F5] hover:bg-purple-500/10 hover:text-purple-500',
            'dark:bg-[#1A1A1A] dark:hover:bg-purple-500/20',
            'text-bolt-elements-textPrimary dark:hover:text-purple-500',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-[#0A0A0A]',
            { 'opacity-50 cursor-not-allowed': loading.systemInfo },
          )}
        >
          {loading.systemInfo ? (
            <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          ) : (
            <div className="i-ph:gear w-4 h-4" />
          )}
          Update System Info
        </button>

        <button
          onClick={handleLogPerformance}
          disabled={loading.performance}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-[#F5F5F5] hover:bg-purple-500/10 hover:text-purple-500',
            'dark:bg-[#1A1A1A] dark:hover:bg-purple-500/20',
            'text-bolt-elements-textPrimary dark:hover:text-purple-500',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-[#0A0A0A]',
            { 'opacity-50 cursor-not-allowed': loading.performance },
          )}
        >
          {loading.performance ? (
            <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          ) : (
            <div className="i-ph:chart-bar w-4 h-4" />
          )}
          Log Performance
        </button>

        <button
          onClick={checkErrors}
          disabled={loading.errors}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-[#F5F5F5] hover:bg-purple-500/10 hover:text-purple-500',
            'dark:bg-[#1A1A1A] dark:hover:bg-purple-500/20',
            'text-bolt-elements-textPrimary dark:hover:text-purple-500',
            'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-[#0A0A0A]',
            { 'opacity-50 cursor-not-allowed': loading.errors },
          )}
        >
          {loading.errors ? (
            <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          ) : (
            <div className="i-ph:warning w-4 h-4" />
          )}
          Check Errors
        </button>

        <button
          onClick={getWebAppInfo}
          disabled={loading.webAppInfo}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-[#F5F5F5] hover:bg-purple-500/10 hover:text-purple-500',
            'dark:bg-[#1A1A1A] dark:hover:bg-purple-500/20',
            'text-bolt-elements-textPrimary dark:hover:text-purple-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#0A0A0A]',
            { 'opacity-50 cursor-not-allowed': loading.webAppInfo },
          )}
        >
          {loading.webAppInfo ? (
            <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          ) : (
            <div className="i-ph:info w-4 h-4" />
          )}
          Fetch WebApp Info
        </button>

        <button
          onClick={exportDebugInfo}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-[#F5F5F5] hover:bg-purple-500/10 hover:text-purple-500',
            'dark:bg-[#1A1A1A] dark:hover:bg-purple-500/20',
            'text-bolt-elements-textPrimary dark:hover:text-purple-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#0A0A0A]',
          )}
        >
          <div className="i-ph:download w-4 h-4" />
          Export Debug Info
        </button>
      </div>

      {/* System Information */}
      <Collapsible
        open={openSections.system}
        onOpenChange={(open: boolean) => setOpenSections((prev) => ({ ...prev, system: open }))}
        className="w-full"
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            <div className="flex items-center gap-3">
              <div className="i-ph:cpu text-purple-500 w-5 h-5" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">System Information</h3>
            </div>
            <div
              className={cn(
                'i-ph:caret-down w-4 h-4 transform transition-transform duration-200',
                openSections.system ? 'rotate-180' : '',
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 mt-2 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            {systemInfo ? (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:desktop text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">OS: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.os}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:device-mobile text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Platform: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.platform}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:microchip text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Architecture: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.arch}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:cpu text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">CPU Cores: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.cpus}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:node text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Node Version: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.node}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:wifi-high text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Network Type: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.network.type} ({systemInfo.network.effectiveType})
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:gauge text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Network Speed: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.network.downlink}Mbps (RTT: {systemInfo.network.rtt}ms)
                    </span>
                  </div>
                  {systemInfo.battery && (
                    <div className="text-sm flex items-center gap-2">
                      <div className="i-ph:battery-charging text-bolt-elements-textSecondary w-4 h-4" />
                      <span className="text-bolt-elements-textSecondary">Battery: </span>
                      <span className="text-bolt-elements-textPrimary">
                        {systemInfo.battery.level.toFixed(1)}% {systemInfo.battery.charging ? '(Charging)' : ''}
                      </span>
                    </div>
                  )}
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:hard-drive text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Storage: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.storage.usage / (1024 * 1024 * 1024)).toFixed(2)}GB /{' '}
                      {(systemInfo.storage.quota / (1024 * 1024 * 1024)).toFixed(2)}GB
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:database text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Memory Usage: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.memory.used} / {systemInfo.memory.total} ({systemInfo.memory.percentage}%)
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:browser text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Browser: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.browser.name} {systemInfo.browser.version}
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:monitor text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Screen: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.screen.width}x{systemInfo.screen.height} ({systemInfo.screen.pixelRatio}x)
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:clock text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Timezone: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.time.timezone}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:translate text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Language: </span>
                    <span className="text-bolt-elements-textPrimary">{systemInfo.browser.language}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:chart-pie text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">JS Heap: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)}MB /{' '}
                      {(systemInfo.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)}MB (
                      {systemInfo.performance.memory.usagePercentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:timer text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Page Load: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.loadTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:code text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">DOM Ready: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.domReadyTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary">Loading system information...</div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Performance Metrics */}
      <Collapsible
        open={openSections.performance}
        onOpenChange={(open: boolean) => setOpenSections((prev) => ({ ...prev, performance: open }))}
        className="w-full"
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            <div className="flex items-center gap-3">
              <div className="i-ph:chart-line text-purple-500 w-5 h-5" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">Performance Metrics</h3>
            </div>
            <div
              className={cn(
                'i-ph:caret-down w-4 h-4 transform transition-transform duration-200',
                openSections.performance ? 'rotate-180' : '',
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 mt-2 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            {systemInfo && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Page Load Time: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.loadTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">DOM Ready Time: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.domReadyTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Request Time: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.requestTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Redirect Time: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.timing.redirectTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">JS Heap Usage: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {(systemInfo.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)}MB /{' '}
                      {(systemInfo.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)}MB
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Heap Utilization: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.performance.memory.usagePercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Navigation Type: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.performance.navigation.type === 0
                        ? 'Navigate'
                        : systemInfo.performance.navigation.type === 1
                          ? 'Reload'
                          : systemInfo.performance.navigation.type === 2
                            ? 'Back/Forward'
                            : 'Other'}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-bolt-elements-textSecondary">Redirects: </span>
                    <span className="text-bolt-elements-textPrimary">
                      {systemInfo.performance.navigation.redirectCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* WebApp Information */}
      <Collapsible
        open={openSections.webapp}
        onOpenChange={(open: boolean) => setOpenSections((prev) => ({ ...prev, webapp: open }))}
        className="w-full"
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            <div className="flex items-center gap-3">
              <div className="i-ph:info text-blue-500 w-5 h-5" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">WebApp Information</h3>
            </div>
            <div
              className={cn(
                'i-ph:caret-down w-4 h-4 transform transition-transform duration-200',
                openSections.webapp ? 'rotate-180' : '',
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 mt-2 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            {webAppInfo ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:app-window text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Name: </span>
                    <span className="text-bolt-elements-textPrimary">{webAppInfo.name}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:tag text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Version: </span>
                    <span className="text-bolt-elements-textPrimary">{webAppInfo.version}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:file-text text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Description: </span>
                    <span className="text-bolt-elements-textPrimary">{webAppInfo.description}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:certificate text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">License: </span>
                    <span className="text-bolt-elements-textPrimary">{webAppInfo.license}</span>
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <div className="i-ph:node text-bolt-elements-textSecondary w-4 h-4" />
                    <span className="text-bolt-elements-textSecondary">Node Version: </span>
                    <span className="text-bolt-elements-textPrimary">{webAppInfo.nodeVersion}</span>
                  </div>
                  {webAppInfo.buildTime && (
                    <div className="text-sm flex items-center gap-2">
                      <div className="i-ph:calendar text-bolt-elements-textSecondary w-4 h-4" />
                      <span className="text-bolt-elements-textSecondary">Build Time: </span>
                      <span className="text-bolt-elements-textPrimary">{webAppInfo.buildTime}</span>
                    </div>
                  )}
                  {webAppInfo.buildNumber && (
                    <div className="text-sm flex items-center gap-2">
                      <div className="i-ph:hash text-bolt-elements-textSecondary w-4 h-4" />
                      <span className="text-bolt-elements-textSecondary">Build Number: </span>
                      <span className="text-bolt-elements-textPrimary">{webAppInfo.buildNumber}</span>
                    </div>
                  )}
                  {webAppInfo.environment && (
                    <div className="text-sm flex items-center gap-2">
                      <div className="i-ph:cloud text-bolt-elements-textSecondary w-4 h-4" />
                      <span className="text-bolt-elements-textSecondary">Environment: </span>
                      <span className="text-bolt-elements-textPrimary">{webAppInfo.environment}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="i-ph:package text-bolt-elements-textSecondary w-4 h-4" />
                      <span className="text-bolt-elements-textSecondary">Key Dependencies:</span>
                    </div>
                    <div className="pl-6 space-y-1">
                      {Object.entries(webAppInfo.dependencies)
                        .filter(([key]) => ['react', '@remix-run/react', 'next', 'typescript'].includes(key))
                        .map(([key, version]) => (
                          <div key={key} className="text-xs text-bolt-elements-textPrimary">
                            {key}: {version}
                          </div>
                        ))}
                    </div>
                  </div>
                  {webAppInfo.gitInfo && (
                    <div className="text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:git-branch text-bolt-elements-textSecondary w-4 h-4" />
                        <span className="text-bolt-elements-textSecondary">Git Info:</span>
                      </div>
                      <div className="pl-6 space-y-1">
                        <div className="text-xs text-bolt-elements-textPrimary">
                          Branch: {webAppInfo.gitInfo.branch}
                        </div>
                        <div className="text-xs text-bolt-elements-textPrimary">
                          Commit: {webAppInfo.gitInfo.commit}
                        </div>
                        <div className="text-xs text-bolt-elements-textPrimary">
                          Commit Time: {webAppInfo.gitInfo.commitTime}
                        </div>
                        <div className="text-xs text-bolt-elements-textPrimary">
                          Author: {webAppInfo.gitInfo.author}
                        </div>
                        <div className="text-xs text-bolt-elements-textPrimary">
                          Remote URL: {webAppInfo.gitInfo.remoteUrl}
                        </div>
                      </div>
                    </div>
                  )}
                  {webAppInfo.repoInfo && (
                    <div className="text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:github text-bolt-elements-textSecondary w-4 h-4" />
                        <span className="text-bolt-elements-textSecondary">GitHub Repository:</span>
                      </div>
                      <div className="pl-6 space-y-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={webAppInfo.repoInfo.owner.avatarUrl}
                            alt={`${webAppInfo.repoInfo.owner.login}'s avatar`}
                            className="w-8 h-8 rounded-full border border-[#E5E5E5] dark:border-[#1A1A1A]"
                          />
                          <div className="space-y-0.5">
                            <div className="text-xs text-bolt-elements-textPrimary font-medium">
                              Owner: {webAppInfo.repoInfo.owner.login}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary">
                              Last Update: {new Date(webAppInfo.repoInfo.lastUpdate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
                            <div className="i-ph:star text-yellow-500 w-4 h-4" />
                            {webAppInfo.repoInfo.stars.toLocaleString()} stars
                          </div>
                          <div className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
                            <div className="i-ph:git-fork text-blue-500 w-4 h-4" />
                            {webAppInfo.repoInfo.forks.toLocaleString()} forks
                          </div>
                          <div className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
                            <div className="i-ph:warning-circle text-red-500 w-4 h-4" />
                            {webAppInfo.repoInfo.openIssues.toLocaleString()} issues
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary">
                {loading.webAppInfo ? 'Loading webapp information...' : 'No webapp information available'}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Error Check */}
      <Collapsible
        open={openSections.errors}
        onOpenChange={(open: boolean) => setOpenSections((prev) => ({ ...prev, errors: open }))}
        className="w-full"
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            <div className="flex items-center gap-3">
              <div className="i-ph:warning text-red-500 w-5 h-5" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">Error Check</h3>
              {errorLog.errors.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {errorLog.errors.length} Errors
                </Badge>
              )}
            </div>
            <div
              className={cn(
                'i-ph:caret-down w-4 h-4 transform transition-transform duration-200',
                openSections.errors ? 'rotate-180' : '',
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 mt-2 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                <div className="text-sm text-bolt-elements-textSecondary">
                  Checks for:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Unhandled JavaScript errors</li>
                    <li>Unhandled Promise rejections</li>
                    <li>Runtime exceptions</li>
                    <li>Network errors</li>
                  </ul>
                </div>
                <div className="text-sm">
                  <span className="text-bolt-elements-textSecondary">Last Check: </span>
                  <span className="text-bolt-elements-textPrimary">
                    {loading.errors
                      ? 'Checking...'
                      : errorLog.lastCheck
                        ? `Last checked ${new Date(errorLog.lastCheck).toLocaleString()} (${errorLog.errors.length} errors found)`
                        : 'Click to check for errors'}
                  </span>
                </div>
                {errorLog.errors.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Recent Errors:</div>
                    <div className="space-y-2">
                      {errorLog.errors.slice(0, 3).map((error, index) => (
                        <div key={index} className="text-sm text-red-500 dark:text-red-400">
                          {error.type === 'error' && `${error.message} (${error.filename}:${error.lineNumber})`}
                          {error.type === 'unhandledRejection' && `Unhandled Promise Rejection: ${error.reason}`}
                          {error.type === 'networkError' && `Network Error: Failed to load ${error.resource}`}
                        </div>
                      ))}
                      {errorLog.errors.length > 3 && (
                        <div className="text-sm text-bolt-elements-textSecondary">
                          And {errorLog.errors.length - 3} more errors...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
