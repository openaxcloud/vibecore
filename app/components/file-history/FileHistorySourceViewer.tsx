import { EditorAdapter } from '@vibecore/editor';
import { useMemo } from 'react';

export interface FileHistorySourceViewerProps {
  projectId: string;
  filePath: string;
  content: string;
  theme: 'dark' | 'light';
}

const LARGE_FILE_BYTES = 1_000_000;

export function FileHistorySourceViewer({ projectId, filePath, content, theme }: FileHistorySourceViewerProps) {
  const historyModelPath = useMemo(() => createHistoryModelPath(projectId, filePath), [filePath, projectId]);

  return (
    <div className="vc-file-history-source" data-testid="file-history-source">
      <EditorAdapter
        className="h-full w-full"
        value={content}
        filePath={historyModelPath}
        readOnly
        autoFocus={false}
        theme={theme}
        minimapEnabled={false}
        largeFile={content.length > LARGE_FILE_BYTES}
      />
    </div>
  );
}

export function createHistoryModelPath(projectId: string, filePath: string): string {
  const basename = filePath.split('/').filter(Boolean).at(-1) ?? 'history.txt';
  const key = stableTargetHash(`${projectId}:${filePath}`);

  /*
   * Monaco models are keyed by URI. A dedicated, stable path keeps playback
   * changes inside a read-only history model and can never mutate the live
   * editor model for `filePath` (which would otherwise trigger autosave).
   */
  return `/.vibecore/file-history/${key}/${basename}`;
}

function stableTargetHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
