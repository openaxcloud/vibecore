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

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
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
  },
  energySaver: {
    metrics: 5000, // 5s
  },
};

// Energy consumption estimates (milliwatts)
const ENERGY_COSTS = {
  update: 2, // mW per update
  apiCall: 5, // mW per API call
  rendering: 1, // mW per render
};

export default function TaskManagerTab() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: 0,
    memory: { used: 0, total: 0, percentage: 0 },
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

    const energyPerUpdate = ENERGY_COSTS.update;
    const energySaved = (updatesReduced * energyPerUpdate) / 3600;

    setEnergySavings({
      updatesReduced,
      timeInSaverMode,
      estimatedEnergySaved: energySaved,
    });
  }, [energySaverMode]);

  // Add interval for energy savings updates
  useEffect(() => {
    const interval = setInterval(updateEnergySavings, 1000);
    return () => clearInterval(interval);
  }, [updateEnergySavings]);

  // Update metrics
  const updateMetrics = async () => {
    try {
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

  // Remove all animation and process monitoring
  useEffect(() => {
    const metricsInterval = setInterval(
      () => {
        if (!energySaverMode) {
          updateMetrics();
        }
      },
      energySaverMode ? UPDATE_INTERVALS.energySaver.metrics : UPDATE_INTERVALS.normal.metrics,
    );

    return () => {
      clearInterval(metricsInterval);
    };
  }, [energySaverMode]);

  // Initial update effect
  useEffect((): (() => void) => {
    // Initial update
    updateMetrics();

    // Set up intervals for live updates
    const metricsInterval = setInterval(
      updateMetrics,
      energySaverMode ? UPDATE_INTERVALS.energySaver.metrics : UPDATE_INTERVALS.normal.metrics,
    );

    // Cleanup on unmount
    return () => {
      clearInterval(metricsInterval);
    };
  }, [energySaverMode]); // Re-create intervals when energy saver mode changes

  const getUsageColor = (usage: number): string => {
    if (usage > 80) {
      return 'text-red-500';
    }

    if (usage > 50) {
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

  return (
    <div className="flex flex-col gap-6">
      {/* System Metrics */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-bolt-elements-textPrimary">System Metrics</h3>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* CPU Usage */}
          <div className="flex flex-col gap-2 rounded-lg bg-[#F8F8F8] dark:bg-[#141414] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-bolt-elements-textSecondary">CPU Usage</span>
              <span className={classNames('text-sm font-medium', getUsageColor(metrics.cpu))}>
                {Math.round(metrics.cpu)}%
              </span>
            </div>
            {renderUsageGraph(metricsHistory.cpu, 'CPU', '#9333ea')}
          </div>

          {/* Memory Usage */}
          <div className="flex flex-col gap-2 rounded-lg bg-[#F8F8F8] dark:bg-[#141414] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-bolt-elements-textSecondary">Memory Usage</span>
              <span className={classNames('text-sm font-medium', getUsageColor(metrics.memory.percentage))}>
                {Math.round(metrics.memory.percentage)}%
              </span>
            </div>
            {renderUsageGraph(metricsHistory.memory, 'Memory', '#2563eb')}
          </div>

          {/* Battery */}
          {metrics.battery && (
            <div className="flex flex-col gap-2 rounded-lg bg-[#F8F8F8] dark:bg-[#141414] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-bolt-elements-textSecondary">Battery</span>
                <div className="flex items-center gap-2">
                  {metrics.battery.charging && <div className="i-ph:lightning-fill w-4 h-4 text-bolt-action-primary" />}
                  <span
                    className={classNames(
                      'text-sm font-medium',
                      metrics.battery.level > 20 ? 'text-bolt-elements-textPrimary' : 'text-red-500',
                    )}
                  >
                    {Math.round(metrics.battery.level)}%
                  </span>
                </div>
              </div>
              {renderUsageGraph(metricsHistory.battery, 'Battery', '#22c55e')}
            </div>
          )}

          {/* Network */}
          <div className="flex flex-col gap-2 rounded-lg bg-[#F8F8F8] dark:bg-[#141414] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-bolt-elements-textSecondary">Network</span>
              <span className="text-sm font-medium text-bolt-elements-textPrimary">
                {metrics.network.downlink.toFixed(1)} Mbps
              </span>
            </div>
            {renderUsageGraph(metricsHistory.network, 'Network', '#f59e0b')}
          </div>
        </div>

        {/* Energy Savings */}
        {energySaverMode && (
          <div className="flex flex-col gap-2 rounded-lg bg-[#F8F8F8] dark:bg-[#141414] p-4">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Energy Savings</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-sm text-bolt-elements-textSecondary">Updates Reduced</span>
                <p className="text-lg font-medium text-bolt-elements-textPrimary">{energySavings.updatesReduced}</p>
              </div>
              <div>
                <span className="text-sm text-bolt-elements-textSecondary">Time in Saver Mode</span>
                <p className="text-lg font-medium text-bolt-elements-textPrimary">
                  {Math.floor(energySavings.timeInSaverMode / 60)}m {Math.floor(energySavings.timeInSaverMode % 60)}s
                </p>
              </div>
              <div>
                <span className="text-sm text-bolt-elements-textSecondary">Energy Saved</span>
                <p className="text-lg font-medium text-bolt-elements-textPrimary">
                  {energySavings.estimatedEnergySaved.toFixed(2)} mWh
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
