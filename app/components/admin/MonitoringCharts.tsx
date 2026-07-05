/*
 * Lazy-loaded Chart.js bundle for the admin Monitoring dashboard. Split out of
 * admin.$section.tsx so react-chartjs-2 / chart.js only load when a platform
 * admin opens the Monitoring section (React.lazy in the route) — it stays out of
 * the rest of the admin bundle.
 *
 * Registration mirrors the existing pattern in
 * app/components/@settings/tabs/data/DataVisualization.tsx and
 * app/components/chat/BaseChat.tsx (import the components, ChartJS.register(...)).
 *
 * All data is computed in the route from EXISTING admin endpoints (/admin/costs,
 * /admin/provider-health). This module is pure presentation — it receives
 * already-aggregated series/labels and renders them.
 */
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { useEffect, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

/*
 * Centralized, theme-aware palette. We read a couple of CSS custom properties off
 * the document root for grid/text so axes are legible in BOTH light and dark, and
 * use a fixed categorical palette (chosen to stay visible on dark backgrounds) for
 * the series themselves. No raw hex is scattered through the panel — everything
 * funnels through here.
 */
const SERIES_PALETTE = [
  '#f97316', // orange (brand)
  '#3b82f6', // blue
  '#10b981', // emerald
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#eab308', // amber
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
  '#22c55e', // green
];

function useChartTheme() {
  const [theme, setTheme] = useState({
    text: 'rgba(120, 120, 130, 0.9)',
    grid: 'rgba(140, 140, 150, 0.16)',
  });

  useEffect(() => {
    const read = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme({
        text: isDark ? 'rgba(220, 222, 228, 0.85)' : 'rgba(60, 62, 70, 0.85)',
        grid: isDark ? 'rgba(220, 222, 228, 0.12)' : 'rgba(60, 62, 70, 0.12)',
      });
    };

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return theme;
}

export function seriesColor(index: number): string {
  return SERIES_PALETTE[index % SERIES_PALETTE.length];
}

type Labeled = { labels: string[]; values: number[] };

/** AI cost (USD) over time — line chart. */
export function CostOverTimeChart({ labels, values }: Labeled) {
  const t = useChartTheme();

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `$${Number(c.parsed.y).toFixed(2)}` } },
    },
    scales: {
      x: { ticks: { color: t.text, maxRotation: 0, autoSkip: true }, grid: { color: t.grid } },
      y: { ticks: { color: t.text, callback: (v) => `$${v}` }, grid: { color: t.grid }, beginAtZero: true },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'AI cost (USD)',
        data: values,
        borderColor: seriesColor(0),
        backgroundColor: 'rgba(249, 115, 22, 0.18)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };

  return <Line data={data} options={options} />;
}

/** Cost (USD) broken down by provider/model — horizontal bar. */
export function CostByCategoryChart({ labels, values, axisLabel }: Labeled & { axisLabel: string }) {
  const t = useChartTheme();

  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `$${Number(c.parsed.x).toFixed(2)}` } },
    },
    scales: {
      x: { ticks: { color: t.text, callback: (v) => `$${v}` }, grid: { color: t.grid }, beginAtZero: true },
      y: { ticks: { color: t.text }, grid: { color: t.grid } },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: axisLabel,
        data: values,
        backgroundColor: labels.map((_, i) => seriesColor(i)),
        borderRadius: 4,
      },
    ],
  };

  return <Bar data={data} options={options} />;
}

/** Token volume by provider — doughnut. */
export function TokensByProviderChart({ labels, values }: Labeled) {
  const t = useChartTheme();

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12, padding: 12 } },
      tooltip: { callbacks: { label: (c) => `${c.label}: ${Number(c.parsed).toLocaleString()} tokens` } },
    },
    cutout: '58%',
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Tokens',
        data: values,
        backgroundColor: labels.map((_, i) => seriesColor(i)),
        borderWidth: 0,
      },
    ],
  };

  return <Doughnut data={data} options={options} />;
}

/*
 * ---------------------------------------------------------------------------
 * Platform-metrics charts (real Prometheus registry, via /admin/platform-metrics)
 * ---------------------------------------------------------------------------
 */

/** Generic categorical vertical bar — queue depth by queue, error rates by type, etc. */
export function CategoryBarChart({
  labels,
  values,
  axisLabel,
  colorOffset = 0,
  format,
}: Labeled & { axisLabel: string; colorOffset?: number; format?: (value: number) => string }) {
  const t = useChartTheme();
  const fmt = format ?? ((value: number) => value.toLocaleString());

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(Number(c.parsed.y))}` } },
    },
    scales: {
      x: { ticks: { color: t.text, autoSkip: false, maxRotation: 30 }, grid: { color: t.grid } },
      y: { ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, beginAtZero: true },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: axisLabel,
        data: values,
        backgroundColor: labels.map((_, i) => seriesColor(i + colorOffset)),
        borderRadius: 4,
      },
    ],
  };

  return <Bar data={data} options={options} />;
}

type Dataset = { label: string; values: number[]; colorIndex: number };

/** Multi-series grouped bar — e.g. workspace starts vs failures per label bucket. */
export function GroupedBarChart({ labels, datasets }: { labels: string[]; datasets: Dataset[] }) {
  const t = useChartTheme();

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12, padding: 12 } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${Number(c.parsed.y).toLocaleString()}` } },
    },
    scales: {
      x: { ticks: { color: t.text, autoSkip: false, maxRotation: 30 }, grid: { color: t.grid } },
      y: { ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, beginAtZero: true },
    },
  };

  const data = {
    labels,
    datasets: datasets.map((set) => ({
      label: set.label,
      data: set.values,
      backgroundColor: seriesColor(set.colorIndex),
      borderRadius: 4,
    })),
  };

  return <Bar data={data} options={options} />;
}

/** Latency histogram — per-bucket observation counts as a vertical bar. */
export function HistogramBucketChart({ labels, values }: Labeled) {
  const t = useChartTheme();

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `≤ ${items[0]?.label ?? ''}`,
          label: (c) => `${Number(c.parsed.y).toLocaleString()} observations`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Bucket upper bound (seconds)', color: t.text },
        ticks: { color: t.text, autoSkip: false, maxRotation: 0 },
        grid: { color: t.grid },
      },
      y: { ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, beginAtZero: true },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Observations',
        data: values,
        backgroundColor: seriesColor(1),
        borderRadius: 3,
      },
    ],
  };

  return <Bar data={data} options={options} />;
}

/** Cost (USD) by organization — vertical bar. */
export function CostByOrgChart({ labels, values }: Labeled) {
  const t = useChartTheme();

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `$${Number(c.parsed.y).toFixed(2)}` } },
    },
    scales: {
      x: { ticks: { color: t.text, autoSkip: false }, grid: { color: t.grid } },
      y: { ticks: { color: t.text, callback: (v) => `$${v}` }, grid: { color: t.grid }, beginAtZero: true },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'AI cost (USD)',
        data: values,
        backgroundColor: labels.map((_, i) => seriesColor(i + 1)),
        borderRadius: 4,
      },
    ],
  };

  return <Bar data={data} options={options} />;
}
