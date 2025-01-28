import React, { useEffect, useState, useRef, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { toast } from 'react-toastify'; // Import toast

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

type ProcessStatus = 'active' | 'idle' | 'suspended';
type ProcessImpact = 'high' | 'medium' | 'low';

interface ProcessInfo {
  name: string;
  type: 'API' | 'Animation' | 'Background' | 'Network' | 'Storage';
  cpuUsage: number;
  memoryUsage: number;
  status: ProcessStatus;
  lastUpdate: string;
  impact: ProcessImpact;
}

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  activeProcesses: number;
  uptime: number;
  battery?: {
    level: number;
    charging: boolean;
    timeRemaining?: number;
  };
  network: {
    downlink: number;
    latency: number;
    type: string;
  };
}

interface MetricsHistory {
  timestamps: string[];
  cpu: number[];
  memory: number[];
  battery: number[];
  network: number[];
}

interface EnergySavings {
  updatesReduced: number;
  timeInSaverMode: number;
  estimatedEnergySaved: number; // in mWh (milliwatt-hours)
}

declare global {
  interface Navigator {
    getBattery(): Promise<BatteryManager>;
  }
  interface Performance {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
  }
}

const MAX_HISTORY_POINTS = 60; // 1 minute of history at 1s intervals
const BATTERY_THRESHOLD = 20; // Enable energy saver when battery below 20%
const UPDATE_INTERVALS = {
  normal: {
    metrics: 1000, // 1s
    processes: 2000, // 2s
  },
  energySaver: {
    metrics: 5000, // 5s
    processes: 10000, // 10s
  },
};

// Energy consumption estimates (milliwatts)
const ENERGY_COSTS = {
  update: 2, // mW per update
  apiCall: 5, // mW per API call
  rendering: 1, // mW per render
};

export default function TaskManagerTab() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: 0,
    memory: { used: 0, total: 0, percentage: 0 },
    activeProcesses: 0,
    uptime: 0,
    network: { downlink: 0, latency: 0, type: 'unknown' },
  });
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory>({
    timestamps: [],
    cpu: [],
    memory: [],
    battery: [],
    network: [],
  });
  const [loading, setLoading] = useState({
    metrics: false,
    processes: false,
  });
  const [energySaverMode, setEnergySaverMode] = useState<boolean>(() => {
    // Initialize from localStorage, default to false
    const saved = localStorage.getItem('energySaverMode');
    return saved ? JSON.parse(saved) : false;
  });

  const [autoEnergySaver, setAutoEnergySaver] = useState<boolean>(() => {
    // Initialize from localStorage, default to false
    const saved = localStorage.getItem('autoEnergySaver');
    return saved ? JSON.parse(saved) : false;
  });

  const [energySavings, setEnergySavings] = useState<EnergySavings>({
    updatesReduced: 0,
    timeInSaverMode: 0,
    estimatedEnergySaved: 0,
  });

  const saverModeStartTime = useRef<number | null>(null);

  const [performanceObserver, setPerformanceObserver] = useState<PerformanceObserver | null>(null);

  // Handle energy saver mode changes
  const handleEnergySaverChange = (checked: boolean) => {
    setEnergySaverMode(checked);
    localStorage.setItem('energySaverMode', JSON.stringify(checked));
    toast.success(checked ? 'Energy Saver mode enabled' : 'Energy Saver mode disabled');
  };

  // Handle auto energy saver changes
  const handleAutoEnergySaverChange = (checked: boolean) => {
    setAutoEnergySaver(checked);
    localStorage.setItem('autoEnergySaver', JSON.stringify(checked));
    toast.success(checked ? 'Auto Energy Saver enabled' : 'Auto Energy Saver disabled');

    if (!checked) {
      // When disabling auto mode, also disable energy saver mode
      setEnergySaverMode(false);
      localStorage.setItem('energySaverMode', 'false');
    }
  };

  // Add this helper function at the top level of the component
  function isNetworkRequest(entry: PerformanceEntry): boolean {
    const resourceTiming = entry as PerformanceResourceTiming;
    return resourceTiming.initiatorType === 'fetch' && entry.duration === 0;
  }

  // Update getActiveProcessCount
  const getActiveProcessCount = async (): Promise<number> => {
    try {
      const networkCount = (navigator as any)?.connections?.length || 0;
      const swCount = (await navigator.serviceWorker?.getRegistrations().then((regs) => regs.length)) || 0;
      const animationCount = document.getAnimations().length;
      const fetchCount = performance.getEntriesByType('resource').filter(isNetworkRequest).length;

      return networkCount + swCount + animationCount + fetchCount;
    } catch (error) {
      console.error('Failed to get active process count:', error);
      return 0;
    }
  };

  // Update process cleanup
  const cleanupOldProcesses = useCallback(() => {
    const MAX_PROCESS_AGE = 30000; // 30 seconds

    setProcesses((currentProcesses) => {
      const now = Date.now();
      return currentProcesses.filter((process) => {
        const processTime = new Date(process.lastUpdate).getTime();
        const age = now - processTime;

        /*
         * Keep processes that are:
         * 1. Less than MAX_PROCESS_AGE old, or
         * 2. Currently active, or
         * 3. Service workers (they're managed separately)
         */
        return age < MAX_PROCESS_AGE || process.status === 'active' || process.type === 'Background';
      });
    });
  }, []);

  // Add cleanup interval
  useEffect(() => {
    const interval = setInterval(cleanupOldProcesses, 5000);
    return () => clearInterval(interval);
  }, [cleanupOldProcesses]);

  // Update energy savings calculation
  const updateEnergySavings = useCallback(() => {
    if (!energySaverMode) {
      saverModeStartTime.current = null;
      setEnergySavings({
        updatesReduced: 0,
        timeInSaverMode: 0,
        estimatedEnergySaved: 0,
      });

      return;
    }

    if (!saverModeStartTime.current) {
      saverModeStartTime.current = Date.now();
    }

    const timeInSaverMode = Math.max(0, (Date.now() - (saverModeStartTime.current || Date.now())) / 1000);

    const normalUpdatesPerMinute = 60 / (UPDATE_INTERVALS.normal.metrics / 1000);
    const saverUpdatesPerMinute = 60 / (UPDATE_INTERVALS.energySaver.metrics / 1000);
    const updatesReduced = Math.floor((normalUpdatesPerMinute - saverUpdatesPerMinute) * (timeInSaverMode / 60));

    const processCount = processes.length;
    const energyPerUpdate = ENERGY_COSTS.update + processCount * ENERGY_COSTS.rendering;
    const energySaved = (updatesReduced * energyPerUpdate) / 3600;

    setEnergySavings({
      updatesReduced,
      timeInSaverMode,
      estimatedEnergySaved: energySaved,
    });
  }, [energySaverMode, processes.length]);

  // Add interval for energy savings updates
  useEffect(() => {
    const interval = setInterval(updateEnergySavings, 1000);
    return () => clearInterval(interval);
  }, [updateEnergySavings]);

  // Improve process monitoring by adding unique IDs and timestamps
  const createProcess = (
    name: string,
    type: ProcessInfo['type'],
    cpuUsage: number,
    memoryUsage: number,
    status: ProcessStatus,
    impact: ProcessImpact,
  ): ProcessInfo => ({
    name,
    type,
    cpuUsage,
    memoryUsage,
    status,
    lastUpdate: new Date().toISOString(),
    impact,
  });

  // Update animation monitoring to track changes better
  const updateAnimations = useCallback(() => {
    const animations = document.getAnimations();

    setProcesses((currentProcesses) => {
      const nonAnimationProcesses = currentProcesses.filter((p) => !p.name.startsWith('Animation:'));
      const newAnimations = animations
        .slice(0, 5)
        .map((animation) =>
          createProcess(
            `Animation: ${animation.id || 'Unnamed'}`,
            'Animation',
            animation.playState === 'running' ? 2 : 0,
            1,
            animation.playState === 'running' ? 'active' : 'idle',
            'low',
          ),
        );

      return [...nonAnimationProcesses, ...newAnimations];
    });
  }, []);

  // Add animation monitoring interval
  useEffect(() => {
    const interval = setInterval(updateAnimations, energySaverMode ? 5000 : 1000);
    return () => clearInterval(interval);
  }, [updateAnimations, energySaverMode]);

  useEffect((): (() => void) | undefined => {
    if (!autoEnergySaver) {
      // If auto mode is disabled, clear any forced energy saver state
      setEnergySaverMode(false);
      return undefined;
    }

    const checkBatteryStatus = async () => {
      try {
        const battery = await navigator.getBattery();
        const shouldEnableSaver = !battery.charging && battery.level * 100 <= BATTERY_THRESHOLD;
        setEnergySaverMode(shouldEnableSaver);
      } catch {
        console.log('Battery API not available');
      }
    };

    checkBatteryStatus();

    const batteryCheckInterval = setInterval(checkBatteryStatus, 60000);

    return () => clearInterval(batteryCheckInterval);
  }, [autoEnergySaver]);

  const getUsageColor = (usage: number): string => {
    if (usage > 80) {
      return 'text-red-500';
    }

    if (usage > 50) {
      return 'text-yellow-500';
    }

    return 'text-gray-500';
  };

  const getImpactColor = (impact: ProcessImpact): string => {
    if (impact === 'high') {
      return 'text-red-500';
    }

    if (impact === 'medium') {
      return 'text-yellow-500';
    }

    return 'text-gray-500';
  };

  const renderUsageGraph = (data: number[], label: string, color: string) => {
    const chartData = {
      labels: metricsHistory.timestamps,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          fill: false,
          tension: 0.4,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
      animation: {
        duration: 0,
      } as const,
    };

    return (
      <div className="h-32">
        <Line data={chartData} options={options} />
      </div>
    );
  };

  const updateMetrics = async () => {
    try {
      setLoading((prev) => ({ ...prev, metrics: true }));

      // Get memory info using Performance API
      const memory = performance.memory || {
        jsHeapSizeLimit: 0,
        totalJSHeapSize: 0,
        usedJSHeapSize: 0,
      };
      const totalMem = memory.totalJSHeapSize / (1024 * 1024);
      const usedMem = memory.usedJSHeapSize / (1024 * 1024);
      const memPercentage = (usedMem / totalMem) * 100;

      // Get CPU usage using Performance API
      const cpuUsage = await getCPUUsage();

      // Get battery info
      let batteryInfo: SystemMetrics['battery'] | undefined;

      try {
        const battery = await navigator.getBattery();
        batteryInfo = {
          level: battery.level * 100,
          charging: battery.charging,
          timeRemaining: battery.charging ? battery.chargingTime : battery.dischargingTime,
        };
      } catch {
        console.log('Battery API not available');
      }

      // Get network info using Network Information API
      const connection =
        (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      const networkInfo = {
        downlink: connection?.downlink || 0,
        latency: connection?.rtt || 0,
        type: connection?.type || 'unknown',
      };

      const newMetrics = {
        cpu: cpuUsage,
        memory: {
          used: Math.round(usedMem),
          total: Math.round(totalMem),
          percentage: Math.round(memPercentage),
        },
        activeProcesses: await getActiveProcessCount(),
        uptime: performance.now() / 1000,
        battery: batteryInfo,
        network: networkInfo,
      };

      setMetrics(newMetrics);

      // Update metrics history
      const now = new Date().toLocaleTimeString();
      setMetricsHistory((prev) => {
        const timestamps = [...prev.timestamps, now].slice(-MAX_HISTORY_POINTS);
        const cpu = [...prev.cpu, newMetrics.cpu].slice(-MAX_HISTORY_POINTS);
        const memory = [...prev.memory, newMetrics.memory.percentage].slice(-MAX_HISTORY_POINTS);
        const battery = [...prev.battery, batteryInfo?.level || 0].slice(-MAX_HISTORY_POINTS);
        const network = [...prev.network, networkInfo.downlink].slice(-MAX_HISTORY_POINTS);

        return { timestamps, cpu, memory, battery, network };
      });
    } catch (error: unknown) {
      console.error('Failed to update system metrics:', error);
    } finally {
      setLoading((prev) => ({ ...prev, metrics: false }));
    }
  };

  // Get real CPU usage using Performance API
  const getCPUUsage = async (): Promise<number> => {
    try {
      const t0 = performance.now();

      // Create some actual work to measure and use the result
      let result = 0;

      for (let i = 0; i < 10000; i++) {
        result += Math.random();
      }

      // Use result to prevent optimization
      if (result < 0) {
        console.log('Unexpected negative result');
      }

      const t1 = performance.now();
      const timeTaken = t1 - t0;

      /*
       * Normalize to percentage (0-100)
       * Lower time = higher CPU availability
       */
      const maxExpectedTime = 50; // baseline in ms
      const cpuAvailability = Math.max(0, Math.min(100, ((maxExpectedTime - timeTaken) / maxExpectedTime) * 100));

      return 100 - cpuAvailability; // Convert availability to usage
    } catch (error) {
      console.error('Failed to get CPU usage:', error);
      return 0;
    }
  };

  // Add network change listener
  useEffect(() => {
    const connection =
      (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

    if (!connection) {
      return;
    }

    const updateNetworkInfo = () => {
      setMetrics((prev) => ({
        ...prev,
        network: {
          downlink: connection.downlink || 0,
          latency: connection.rtt || 0,
          type: connection.type || 'unknown',
        },
      }));
    };

    connection.addEventListener('change', updateNetworkInfo);

    // eslint-disable-next-line consistent-return
    return () => connection.removeEventListener('change', updateNetworkInfo);
  }, []);

  // Add this effect for live process monitoring
  useEffect(() => {
    // Clean up previous observer if exists
    performanceObserver?.disconnect();

    // Create new performance observer for network requests
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const newNetworkEntries = entries
        .filter((entry: PerformanceEntry): boolean => {
          const resourceTiming = entry as PerformanceResourceTiming;
          return entry.entryType === 'resource' && resourceTiming.initiatorType === 'fetch';
        })
        .slice(-5);

      if (newNetworkEntries.length > 0) {
        setProcesses((currentProcesses) => {
          // Remove old network processes
          const filteredProcesses = currentProcesses.filter((p) => !p.name.startsWith('Network Request:'));

          // Add new network processes
          const newProcesses = newNetworkEntries.map((entry) => ({
            name: `Network Request: ${new URL((entry as PerformanceResourceTiming).name).pathname}`,
            type: 'Network' as const,
            cpuUsage: entry.duration > 0 ? entry.duration / 100 : 0,
            memoryUsage: (entry as PerformanceResourceTiming).encodedBodySize / (1024 * 1024),
            status: (entry.duration === 0 ? 'active' : 'idle') as ProcessStatus,
            lastUpdate: new Date().toISOString(),
            impact: (entry.duration > 1000 ? 'high' : entry.duration > 500 ? 'medium' : 'low') as ProcessImpact,
          })) as ProcessInfo[];

          return [...filteredProcesses, ...newProcesses];
        });
      }
    });

    // Start observing resource timing entries
    observer.observe({ entryTypes: ['resource'] });
    setPerformanceObserver(observer);

    // Set up animation observer
    const animationObserver = new MutationObserver(() => {
      const animations = document.getAnimations();

      setProcesses((currentProcesses) => {
        // Remove old animation processes
        const filteredProcesses = currentProcesses.filter((p) => !p.name.startsWith('Animation:'));

        // Add current animations
        const animationProcesses = animations.slice(0, 5).map((animation) => ({
          name: `Animation: ${animation.id || 'Unnamed'}`,
          type: 'Animation' as const,
          cpuUsage: animation.playState === 'running' ? 2 : 0,
          memoryUsage: 1,
          status: (animation.playState === 'running' ? 'active' : 'idle') as ProcessStatus,
          lastUpdate: new Date().toISOString(),
          impact: 'low' as ProcessImpact,
        })) as ProcessInfo[];

        return [...filteredProcesses, ...animationProcesses];
      });
    });

    // Observe DOM changes that might trigger animations
    animationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Set up service worker observer
    const checkServiceWorkers = async () => {
      const serviceWorkers = (await navigator.serviceWorker?.getRegistrations()) || [];

      setProcesses((currentProcesses) => {
        // Remove old service worker processes
        const filteredProcesses = currentProcesses.filter((p) => !p.name.startsWith('Service Worker:'));

        // Add current service workers
        const swProcesses = serviceWorkers.map((sw) => ({
          name: `Service Worker: ${sw.scope}`,
          type: 'Background' as const,
          cpuUsage: sw.active ? 1 : 0,
          memoryUsage: 5,
          status: (sw.active ? 'active' : 'idle') as ProcessStatus,
          lastUpdate: new Date().toISOString(),
          impact: 'low' as ProcessImpact,
        })) as ProcessInfo[];

        return [...filteredProcesses, ...swProcesses];
      });
    };

    // Check service workers periodically
    const swInterval = setInterval(checkServiceWorkers, 5000);

    // Clean up
    return () => {
      performanceObserver?.disconnect();
      animationObserver.disconnect();
      clearInterval(swInterval);
    };
  }, []);

  // Update the updateProcesses function
  const updateProcesses = async () => {
    try {
      setLoading((prev) => ({ ...prev, processes: true }));

      // Get initial process information
      const processes: ProcessInfo[] = [];

      // Add initial network processes
      const networkEntries = performance
        .getEntriesByType('resource')
        .filter((entry: PerformanceEntry): boolean => {
          const resourceTiming = entry as PerformanceResourceTiming;
          return entry.entryType === 'resource' && resourceTiming.initiatorType === 'fetch';
        })
        .slice(-5);

      networkEntries.forEach((entry) => {
        processes.push({
          name: `Network Request: ${new URL((entry as PerformanceResourceTiming).name).pathname}`,
          type: 'Network',
          cpuUsage: entry.duration > 0 ? entry.duration / 100 : 0,
          memoryUsage: (entry as PerformanceResourceTiming).encodedBodySize / (1024 * 1024),
          status: (entry.duration === 0 ? 'active' : 'idle') as ProcessStatus,
          lastUpdate: new Date().toISOString(),
          impact: (entry.duration > 1000 ? 'high' : entry.duration > 500 ? 'medium' : 'low') as ProcessImpact,
        });
      });

      // Add initial animations
      document
        .getAnimations()
        .slice(0, 5)
        .forEach((animation) => {
          processes.push({
            name: `Animation: ${animation.id || 'Unnamed'}`,
            type: 'Animation',
            cpuUsage: animation.playState === 'running' ? 2 : 0,
            memoryUsage: 1,
            status: (animation.playState === 'running' ? 'active' : 'idle') as ProcessStatus,
            lastUpdate: new Date().toISOString(),
            impact: 'low' as ProcessImpact,
          });
        });

      // Add initial service workers
      const serviceWorkers = (await navigator.serviceWorker?.getRegistrations()) || [];
      serviceWorkers.forEach((sw) => {
        processes.push({
          name: `Service Worker: ${sw.scope}`,
          type: 'Background',
          cpuUsage: sw.active ? 1 : 0,
          memoryUsage: 5,
          status: (sw.active ? 'active' : 'idle') as ProcessStatus,
          lastUpdate: new Date().toISOString(),
          impact: 'low' as ProcessImpact,
        });
      });

      setProcesses(processes);
    } catch (error) {
      console.error('Failed to update process list:', error);
    } finally {
      setLoading((prev) => ({ ...prev, processes: false }));
    }
  };

  // Initial update effect
  useEffect((): (() => void) => {
    // Initial update
    updateMetrics();
    updateProcesses();

    // Set up intervals for live updates
    const metricsInterval = setInterval(
      updateMetrics,
      energySaverMode ? UPDATE_INTERVALS.energySaver.metrics : UPDATE_INTERVALS.normal.metrics,
    );
    const processesInterval = setInterval(
      updateProcesses,
      energySaverMode ? UPDATE_INTERVALS.energySaver.processes : UPDATE_INTERVALS.normal.processes,
    );

    // Cleanup on unmount
    return () => {
      clearInterval(metricsInterval);
      clearInterval(processesInterval);
    };
  }, [energySaverMode]); // Re-create intervals when energy saver mode changes

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">System Overview</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoEnergySaver"
                checked={autoEnergySaver}
                onChange={(e) => handleAutoEnergySaverChange(e.target.checked)}
                className="form-checkbox h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-gray-700"
              />
              <label htmlFor="autoEnergySaver" className="text-sm text-bolt-elements-textSecondary">
                Auto Energy Saver
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="energySaver"
                checked={energySaverMode}
                onChange={(e) => !autoEnergySaver && handleEnergySaverChange(e.target.checked)}
                disabled={autoEnergySaver}
                className="form-checkbox h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-gray-700 disabled:opacity-50"
              />
              <label
                htmlFor="energySaver"
                className={classNames('text-sm text-bolt-elements-textSecondary', { 'opacity-50': autoEnergySaver })}
              >
                Energy Saver
                {energySaverMode && <span className="ml-2 text-xs text-bolt-elements-textSecondary">Active</span>}
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:cpu text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">CPU Usage</span>
            </div>
            <p className={classNames('text-lg font-medium', getUsageColor(metrics.cpu))}>{Math.round(metrics.cpu)}%</p>
            {renderUsageGraph(metricsHistory.cpu, 'CPU', '#9333ea')}
          </div>

          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:database text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Memory Usage</span>
            </div>
            <p className={classNames('text-lg font-medium', getUsageColor(metrics.memory.percentage))}>
              {metrics.memory.used}MB / {metrics.memory.total}MB
            </p>
            {renderUsageGraph(metricsHistory.memory, 'Memory', '#2563eb')}
          </div>

          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:battery text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Battery</span>
            </div>
            {metrics.battery ? (
              <div>
                <p className="text-lg font-medium text-bolt-elements-textPrimary">
                  {Math.round(metrics.battery.level)}%
                  {metrics.battery.charging && (
                    <span className="ml-2 text-bolt-elements-textSecondary">
                      <div className="i-ph:lightning-fill w-4 h-4 inline-block" />
                    </span>
                  )}
                </p>
                {metrics.battery.timeRemaining && metrics.battery.timeRemaining !== Infinity && (
                  <p className="text-xs text-bolt-elements-textSecondary mt-1">
                    {metrics.battery.charging ? 'Full in: ' : 'Remaining: '}
                    {Math.round(metrics.battery.timeRemaining / 60)}m
                  </p>
                )}
                {renderUsageGraph(metricsHistory.battery, 'Battery', '#22c55e')}
              </div>
            ) : (
              <p className="text-sm text-bolt-elements-textSecondary">Not available</p>
            )}
          </div>

          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:wifi text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Network</span>
            </div>
            <p className="text-lg font-medium text-bolt-elements-textPrimary">{metrics.network.downlink} Mbps</p>
            <p className="text-xs text-bolt-elements-textSecondary mt-1">Latency: {metrics.network.latency}ms</p>
            {renderUsageGraph(metricsHistory.network, 'Network', '#f59e0b')}
          </div>
        </div>
      </div>

      {/* Process List */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="i-ph:list-bullets text-purple-500 w-5 h-5" />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">Active Processes</h3>
          </div>
          <button
            onClick={updateProcesses}
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
              'hover:bg-purple-500/10 hover:text-purple-500',
              'dark:hover:bg-purple-500/20 dark:hover:text-purple-500',
              'text-bolt-elements-textPrimary',
              'transition-colors duration-200',
              { 'opacity-50 cursor-not-allowed': loading.processes },
            )}
            disabled={loading.processes}
          >
            <div className={classNames('i-ph:arrows-clockwise w-4 h-4', loading.processes ? 'animate-spin' : '')} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E5E5] dark:border-[#1A1A1A]">
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">Process</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">Type</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">CPU</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">Memory</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">Status</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">Impact</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-bolt-elements-textSecondary">
                  Last Update
                </th>
              </tr>
            </thead>
            <tbody>
              {processes.map((process, index) => (
                <tr
                  key={index}
                  data-process={process.name}
                  className="border-b border-[#E5E5E5] dark:border-[#1A1A1A] last:border-0"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="i-ph:cube text-gray-500 dark:text-gray-400 w-4 h-4" />
                      <span className="text-sm text-bolt-elements-textPrimary">{process.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-bolt-elements-textSecondary">{process.type}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={classNames('text-sm', getUsageColor(process.cpuUsage))}>
                      {process.cpuUsage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={classNames('text-sm', getUsageColor(process.memoryUsage))}>
                      {process.memoryUsage.toFixed(1)} MB
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={classNames('text-sm text-bolt-elements-textSecondary capitalize')}>
                      {process.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={classNames('text-sm', getImpactColor(process.impact))}>{process.impact}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-bolt-elements-textSecondary">
                      {new Date(process.lastUpdate).toLocaleTimeString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Energy Savings */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]">
        <h3 className="text-base font-medium text-bolt-elements-textPrimary">Energy Savings</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:clock text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Time in Saver Mode</span>
            </div>
            <p className="text-lg font-medium text-bolt-elements-textPrimary">
              {Math.floor(energySavings.timeInSaverMode / 60)}m {Math.floor(energySavings.timeInSaverMode % 60)}s
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:chart-line text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Updates Reduced</span>
            </div>
            <p className="text-lg font-medium text-bolt-elements-textPrimary">{energySavings.updatesReduced}</p>
          </div>

          <div className="p-4 rounded-lg bg-[#F8F8F8] dark:bg-[#141414]">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:battery text-gray-500 dark:text-gray-400 w-4 h-4" />
              <span className="text-sm text-bolt-elements-textSecondary">Estimated Energy Saved</span>
            </div>
            <p className="text-lg font-medium text-bolt-elements-textPrimary">
              {energySavings.estimatedEnergySaved.toFixed(2)} mWh
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
