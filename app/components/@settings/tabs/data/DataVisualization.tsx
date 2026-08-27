import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  formatSearchDataSettingsDate,
  formatSearchDataSettingsNumber,
  getDataSettingsCopy,
  resolveSearchDataSettingsLanguage,
} from '~/lib/i18n/catalogs/search-data-settings';
import type { Chat } from '~/lib/persistence/chats';
import { classNames } from '~/utils/classNames';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

type DataVisualizationProps = {
  chats: Chat[];
};

export function DataVisualization({ chats }: DataVisualizationProps) {
  const { i18n } = useTranslation();
  const language = resolveSearchDataSettingsLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDataSettingsCopy(language).visualization;
  const [chatsByDate, setChatsByDate] = useState<Record<string, number>>({});
  const [messagesByRole, setMessagesByRole] = useState<Record<string, number>>({});
  const [averageMessagesPerChat, setAverageMessagesPerChat] = useState<number>(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chats || chats.length === 0) {
      return;
    }

    // Process chat data
    const chatDates: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};

    let totalMessages = 0;

    chats.forEach((chat) => {
      const date = new Date(chat.timestamp);

      if (!Number.isNaN(date.getTime())) {
        const dateKey = date.toISOString().slice(0, 10);
        chatDates[dateKey] = (chatDates[dateKey] || 0) + 1;
      }

      chat.messages.forEach((message) => {
        roleCounts[message.role] = (roleCounts[message.role] || 0) + 1;
        totalMessages++;
      });
    });

    const sortedDates = Object.keys(chatDates).sort((a, b) => a.localeCompare(b));
    const sortedChatsByDate: Record<string, number> = {};
    sortedDates.forEach((date) => {
      sortedChatsByDate[date] = chatDates[date];
    });

    setChatsByDate(sortedChatsByDate);
    setMessagesByRole(roleCounts);
    setAverageMessagesPerChat(totalMessages / chats.length);
  }, [chats]);

  // Get theme colors from CSS variables to ensure theme consistency
  const getThemeColor = (varName: string): string => {
    // Get the CSS variable value from document root
    if (typeof document !== 'undefined') {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    // Fallback for SSR
    return isDarkMode ? '#FFFFFF' : '#000000';
  };

  // Theme-aware chart colors with enhanced dark mode visibility using CSS variables
  const chartColors = {
    grid: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
    text: getThemeColor('--bolt-elements-textPrimary'),
    textSecondary: getThemeColor('--bolt-elements-textSecondary'),
    background: getThemeColor('--bolt-elements-bg-depth-1'),
    accent: getThemeColor('--bolt-elements-button-primary-text'),
    border: getThemeColor('--bolt-elements-borderColor'),
  };

  const getChartColors = (index: number) => {
    // Define color palettes based on Bolt design tokens
    const baseColors = [
      // Brand (primary button token — resolves to the E-Code accent)
      {
        base: getThemeColor('--bolt-elements-button-primary-text'),
      },

      // Pink
      {
        base: isDarkMode ? 'rgb(244, 114, 182)' : 'rgb(236, 72, 153)',
      },

      // Green
      {
        base: getThemeColor('--bolt-elements-icon-success'),
      },

      // Yellow
      {
        base: isDarkMode ? 'rgb(250, 204, 21)' : 'rgb(234, 179, 8)',
      },

      // Blue
      {
        base: isDarkMode ? 'rgb(56, 189, 248)' : 'rgb(14, 165, 233)',
      },
    ];

    // Get the base color for this index
    const color = baseColors[index % baseColors.length].base;

    // Parse color and generate variations with appropriate opacity
    let r = 0,
      g = 0,
      b = 0;

    // Handle rgb/rgba format
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);

    if (rgbMatch) {
      [, r, g, b] = rgbMatch.map(Number);
    } else if (rgbaMatch) {
      [, r, g, b] = rgbaMatch.map(Number);
    } else if (color.startsWith('#')) {
      // Handle hex format
      const hex = color.slice(1);
      const bigint = parseInt(hex, 16);
      r = (bigint >> 16) & 255;
      g = (bigint >> 8) & 255;
      b = bigint & 255;
    }

    return {
      bg: `rgba(${r}, ${g}, ${b}, ${isDarkMode ? 0.7 : 0.5})`,
      border: `rgba(${r}, ${g}, ${b}, ${isDarkMode ? 0.9 : 0.8})`,
    };
  };

  const chartData = {
    history: {
      labels: Object.keys(chatsByDate).map((date) => formatSearchDataSettingsDate(`${date}T00:00:00.000Z`, language)),
      datasets: [
        {
          label: copy.chatsCreated,
          data: Object.values(chatsByDate),
          backgroundColor: getChartColors(0).bg,
          borderColor: getChartColors(0).border,
          borderWidth: 1,
        },
      ],
    },
    roles: {
      labels: Object.keys(messagesByRole).map((role) => copy.roles[role as keyof typeof copy.roles] ?? role),
      datasets: [
        {
          label: copy.messagesByRole,
          data: Object.values(messagesByRole),
          backgroundColor: Object.keys(messagesByRole).map((_, i) => getChartColors(i).bg),
          borderColor: Object.keys(messagesByRole).map((_, i) => getChartColors(i).border),
          borderWidth: 1,
        },
      ],
    },
  };

  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    locale: language === 'fr' ? 'fr-FR' : 'en-GB',
    color: chartColors.text,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: chartColors.text,
          font: {
            weight: 'bold' as const,
            size: 12,
          },
          padding: 16,
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        color: chartColors.text,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        padding: 16,
      },
      tooltip: {
        titleColor: chartColors.text,
        bodyColor: chartColors.text,
        backgroundColor: chartColors.background,
        borderColor: chartColors.border,
        borderWidth: 1,
      },
    },
  };

  const chartOptions = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      title: {
        ...baseChartOptions.plugins.title,
        text: copy.chatHistory,
      },
    },
    scales: {
      x: {
        grid: {
          color: chartColors.grid,
          drawBorder: false,
        },
        border: {
          display: false,
        },
        ticks: {
          color: chartColors.text,
          font: {
            weight: 500,
          },
        },
      },
      y: {
        grid: {
          color: chartColors.grid,
          drawBorder: false,
        },
        border: {
          display: false,
        },
        ticks: {
          color: chartColors.text,
          font: {
            weight: 500,
          },
        },
      },
    },
  };

  const pieOptions = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      title: {
        ...baseChartOptions.plugins.title,
        text: copy.messageDistribution,
      },
      legend: {
        ...baseChartOptions.plugins.legend,
        position: 'right' as const,
      },
      datalabels: {
        color: chartColors.text,
        font: {
          weight: 'bold' as const,
        },
      },
    },
  };

  if (chats.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="i-ph-chart-line-duotone w-12 h-12 mx-auto mb-4 text-bolt-elements-textTertiary opacity-80" />
        <h3 className="mb-2 break-words text-lg font-medium text-bolt-elements-textPrimary">{copy.noDataTitle}</h3>
        <p className="break-words text-bolt-elements-textSecondary">{copy.noDataDescription}</p>
      </div>
    );
  }

  const cardClasses = classNames(
    'p-6 rounded-lg shadow-sm',
    'bg-bolt-elements-background-depth-1',
    'border border-bolt-elements-borderColor',
  );

  const statClasses = classNames('text-3xl font-bold text-bolt-elements-textPrimary', 'flex items-center gap-3');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`${cardClasses} min-w-0`}>
          <h3 className="mb-4 break-words text-lg font-medium text-bolt-elements-textPrimary">{copy.totalChats}</h3>
          <div className={statClasses}>
            <div className="i-ph-chats-duotone w-8 h-8 text-blue-500 dark:text-blue-400" />
            <span>{formatSearchDataSettingsNumber(chats.length, language)}</span>
          </div>
        </div>

        <div className={`${cardClasses} min-w-0`}>
          <h3 className="mb-4 break-words text-lg font-medium text-bolt-elements-textPrimary">{copy.totalMessages}</h3>
          <div className={statClasses}>
            <div className="i-ph-chat-text-duotone w-8 h-8 text-pink-500 dark:text-pink-400" />
            <span>
              {formatSearchDataSettingsNumber(
                Object.values(messagesByRole).reduce((sum, count) => sum + count, 0),
                language,
              )}
            </span>
          </div>
        </div>

        <div className={`${cardClasses} min-w-0`}>
          <h3 className="mb-4 break-words text-lg font-medium text-bolt-elements-textPrimary">
            {copy.averageMessages}
          </h3>
          <div className={statClasses}>
            <div className="i-ph-chart-bar-duotone w-8 h-8 text-green-500 dark:text-green-400" />
            <span>
              {formatSearchDataSettingsNumber(averageMessagesPerChat, language, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${cardClasses} min-w-0`}>
          <h3 className="mb-6 break-words text-lg font-medium text-bolt-elements-textPrimary">{copy.chatHistory}</h3>
          <div className="h-64">
            <Bar data={chartData.history} options={chartOptions} />
          </div>
        </div>

        <div className={`${cardClasses} min-w-0`}>
          <h3 className="mb-6 break-words text-lg font-medium text-bolt-elements-textPrimary">
            {copy.messageDistribution}
          </h3>
          <div className="h-64">
            <Pie data={chartData.roles} options={pieOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}
