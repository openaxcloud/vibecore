import { useTranslation } from 'react-i18next';

import { getErrorSurfacesCopy } from '~/lib/i18n/catalogs/error-surfaces';

export const LoadingOverlay = ({
  message,
  progress,
  progressText,
}: {
  message?: string;
  progress?: number;
  progressText?: string;
}) => {
  const { i18n } = useTranslation();
  const copy = getErrorSurfacesCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 z-50 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative mx-4 flex min-w-0 max-w-lg flex-col items-center gap-4 rounded-lg bg-bolt-elements-background-depth-2 p-6 text-center shadow-lg sm:p-8">
        <div
          className={'i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress'}
          style={{ fontSize: '2rem' }}
          aria-hidden="true"
        ></div>
        <p className="max-w-full break-words text-lg text-bolt-elements-textTertiary">
          {message ?? copy['loadingOverlay.default']}
        </p>
        {progress !== undefined && (
          <div className="flex w-full max-w-64 flex-col gap-2">
            <div
              className="w-full h-2 bg-bolt-elements-background-depth-1 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, progress))}
            >
              <div
                className="h-full bg-bolt-elements-loader-progress transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {progressText && (
              <p className="break-words text-center text-sm text-bolt-elements-textTertiary">{progressText}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
