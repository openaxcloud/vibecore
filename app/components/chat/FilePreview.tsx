import React from 'react';

interface FilePreviewProps {
  files: File[];
  imageDataList: string[];
  onRemove: (index: number) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ files, imageDataList, onRemove }) => {
  if (!files || files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-row overflow-x-auto mx-2 -mt-1 p-2 bg-bolt-elements-background-depth-3 border border-b-none border-bolt-elements-borderColor rounded-lg rounded-b-none">
      {files.map((file, index) => (
        <div key={file.name + file.size} className="mr-2 relative">
          <div className="relative h-20 w-20 overflow-hidden rounded-lg">
            {imageDataList[index] ? (
              <img src={imageDataList[index]} alt={file.name} className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary">
                <span className="i-ph:image-square text-xl" aria-hidden />
              </div>
            )}
            <div className="absolute bottom-0 flex h-5 w-full items-center rounded-b-lg bg-bolt-elements-background-depth-2 px-2 text-xs text-bolt-elements-textSecondary">
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
            </div>
          </div>
          {/* 44px hit target (a11y) with a smaller visible chip in the corner. */}
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${file.name}`}
            className="absolute -right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-md transition-colors hover:bg-bolt-elements-background-depth-3">
              <span className="i-ph:x h-3.5 w-3.5 text-bolt-elements-textPrimary" aria-hidden />
            </span>
          </button>
        </div>
      ))}
    </div>
  );
};

export default FilePreview;
