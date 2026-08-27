/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const chartProps = vi.hoisted(() => ({
  bar: undefined as unknown,
  doughnut: undefined as unknown,
  line: undefined as unknown,
}));

vi.mock('chart.js', () => ({
  ArcElement: {},
  BarElement: {},
  CategoryScale: {},
  Chart: { register: vi.fn() },
  Legend: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Title: {},
  Tooltip: {},
}));

vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data: { datasets: Array<{ label: string }> } }) => {
    chartProps.bar = props;

    return <div data-testid="bar-chart">{props.data.datasets[0]?.label}</div>;
  },
  Doughnut: (props: { data: { datasets: Array<{ label: string }> } }) => {
    chartProps.doughnut = props;

    return <div data-testid="doughnut-chart">{props.data.datasets[0]?.label}</div>;
  },
  Line: (props: { data: { datasets: Array<{ label: string }> } }) => {
    chartProps.line = props;

    return <div data-testid="line-chart">{props.data.datasets[0]?.label}</div>;
  },
}));

import { CostOverTimeChart, HistogramBucketChart, TokensByProviderChart } from './MonitoringCharts';
import { formatMonitoringCurrency } from '~/lib/i18n/catalogs/monitoring-charts';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  chartProps.bar = undefined;
  chartProps.doughnut = undefined;
  chartProps.line = undefined;
});

describe('admin monitoring charts i18n', () => {
  it('switches AI cost labels live and formats USD with French number rules', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <CostOverTimeChart labels={['4 août']} values={[1234.5]} />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('line-chart').textContent).toBe('Coût de l’IA (USD)');
    expect(formatMonitoringCurrency(1234.5, 'fr')).toBe('1 234,50 $US');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByTestId('line-chart').textContent).toBe('AI cost (USD)');
    expect(formatMonitoringCurrency(1234.5, 'en')).toBe('$1,234.50');
  });

  it('localizes token tooltips while preserving provider labels', () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <TokensByProviderChart labels={['OpenAI']} values={[2000]} />
      </I18nextProvider>,
    );

    const props = chartProps.doughnut as {
      data: { labels: string[] };
      options: { plugins: { tooltip: { callbacks: { label: (context: unknown) => string } } } };
    };

    expect(screen.getByTestId('doughnut-chart').textContent).toBe('Jetons');
    expect(props.data.labels).toEqual(['OpenAI']);
    expect(props.options.plugins.tooltip.callbacks.label({ label: 'OpenAI', parsed: 2000 })).toBe(
      'OpenAI: 2 000 jetons',
    );
  });

  it('localizes histogram axis and pluralized observations', () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <HistogramBucketChart labels={['0.5']} values={[1]} />
      </I18nextProvider>,
    );

    const props = chartProps.bar as {
      options: {
        scales: { x: { title: { text: string } } };
        plugins: { tooltip: { callbacks: { label: (context: unknown) => string } } };
      };
    };

    expect(screen.getByTestId('bar-chart').textContent).toBe('Observations');
    expect(props.options.scales.x.title.text).toBe('Borne supérieure de l’intervalle (secondes)');
    expect(props.options.plugins.tooltip.callbacks.label({ parsed: { y: 1 } })).toBe('1 observation');
  });
});
