import { memo } from 'react';

interface ProjectEditorToolbarProps {
  fileLabel: string;
  hasDocument: boolean;
  minimapEnabled: boolean;
  onToggleMinimap: () => void;
  onFormat: () => void;
  onGoToDefinition: () => void;
  onFindReferences: () => void;
  onRenameSymbol: () => void;
  onRefactor: () => void;
  onSave: () => void;
}

function ToolbarDivider() {
  return <span className="bolt-project-editor-toolbar-divider" aria-hidden="true" />;
}

export const ProjectEditorToolbar = memo(
  ({
    fileLabel,
    hasDocument,
    minimapEnabled,
    onToggleMinimap,
    onFormat,
    onGoToDefinition,
    onFindReferences,
    onRenameSymbol,
    onRefactor,
    onSave,
  }: ProjectEditorToolbarProps) => {
    return (
      <div className="bolt-project-editor-toolbar">
        <span className="bolt-project-editor-toolbar-file">{fileLabel}</span>
        <div className="bolt-project-editor-toolbar-actions" role="toolbar" aria-label="Editor actions">
          <div className="bolt-project-editor-toolbar-group" data-toolbar-group="view" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={minimapEnabled}
              title={minimapEnabled ? 'Hide minimap' : 'Show minimap'}
              onClick={onToggleMinimap}
              disabled={!hasDocument}
            >
              Minimap
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="navigation"
            role="group"
            aria-label="Navigation"
          >
            <button type="button" onClick={onGoToDefinition} disabled={!hasDocument} title="Go to definition">
              Definition
            </button>
            <button type="button" onClick={onFindReferences} disabled={!hasDocument} title="Find references">
              References
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="editing"
            role="group"
            aria-label="Editing"
          >
            <button type="button" onClick={onFormat} disabled={!hasDocument}>
              Format
            </button>
            <button type="button" onClick={onRenameSymbol} disabled={!hasDocument} title="Rename symbol">
              Rename
            </button>
            <button type="button" onClick={onRefactor} disabled={!hasDocument} title="Open refactor menu">
              Refactor
            </button>
          </div>

          <ToolbarDivider />

          <div className="bolt-project-editor-toolbar-group" data-toolbar-group="save" role="group" aria-label="Save">
            <button type="button" className="bolt-project-editor-save-button" onClick={onSave} disabled={!hasDocument}>
              Save
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ProjectEditorToolbar.displayName = 'ProjectEditorToolbar';
