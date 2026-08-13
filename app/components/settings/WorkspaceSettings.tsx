import { useStore } from '@nanostores/react';
import { Minus, Plus } from 'lucide-react';
import { ThemePreferenceControl } from '~/components/ui/ThemePreferenceControl';
import { setRequireAiChangeReview, useRequireAiChangeReview } from '~/lib/hooks/useAutoApplyEnabled';
import {
  editorSettingsStore,
  resetEditorSettings,
  setEditorSettings,
  type EditorSettings,
} from '~/lib/stores/editor-settings';

/*
 * Workspace Settings — the editor/workspace preferences page (Replit "Workspace
 * Settings" parity) in the E-Code orange theme. The Editor section is bound live
 * to editorSettingsStore (CodeMirror reads the same store, so changes apply
 * immediately). Appearance is bound to the theme store. Layout / Accessible
 * Terminal / AI & Agent / Run & Workflows are real toggles persisted alongside
 * the editor prefs or pointers to where that config lives, kept honest — no fake
 * controls.
 */

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-bolt-elements-borderColor py-5 last:border-b-0">
      <h3 className="text-[14px] font-semibold text-bolt-elements-textPrimary">{title}</h3>
      {description ? <p className="mt-0.5 text-[12px] text-bolt-elements-textSecondary">{description}</p> : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-bolt-elements-textPrimary">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--ecode-accent,#F26207)]"
      />
    </label>
  );
}

export function WorkspaceSettings() {
  const editor = useStore(editorSettingsStore);
  const requireAiChangeReview = useRequireAiChangeReview();

  const patch = (next: Partial<EditorSettings>) => setEditorSettings(next);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-2">
      <header className="py-4">
        <h2 className="text-[16px] font-semibold text-bolt-elements-textPrimary">Workspace Settings</h2>
        <p className="text-[12px] text-bolt-elements-textSecondary">
          Editor, layout, terminal and agent preferences for this workspace.
        </p>
      </header>

      <Section title="Editor" description="Applies live to the code editor.">
        <div className="flex items-center justify-between gap-3 text-[13px] text-bolt-elements-textPrimary">
          <span>Font size</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease font size"
              onClick={() => patch({ fontSize: editor.fontSize - 1 })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-10 text-center tabular-nums">{editor.fontSize}px</span>
            <button
              type="button"
              aria-label="Increase font size"
              onClick={() => patch({ fontSize: editor.fontSize + 1 })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-[13px] text-bolt-elements-textPrimary">
          <span>Indentation (tab size)</span>
          <select
            value={editor.tabSize}
            onChange={(e) => patch({ tabSize: Number(e.target.value) })}
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-[13px]"
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
            <option value={8}>8 spaces</option>
          </select>
        </label>

        <ToggleRow label="Word wrap" checked={editor.wordWrap} onChange={(v) => patch({ wordWrap: v })} />
        <ToggleRow label="Vim mode" checked={editor.vimMode} onChange={(v) => patch({ vimMode: v })} />
        <ToggleRow label="Format on save" checked={editor.formatOnSave} onChange={(v) => patch({ formatOnSave: v })} />

        <button
          type="button"
          onClick={() => resetEditorSettings()}
          className="w-fit text-[12px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:underline"
        >
          Reset editor settings
        </button>
      </Section>

      <Section title="Appearance" description="Theme for the workspace. System follows your device setting.">
        <div className="flex items-center justify-between gap-3 text-[13px] text-bolt-elements-textPrimary">
          <span>Theme</span>
          <ThemePreferenceControl />
        </div>
      </Section>

      <Section title="Layout" description="Panel arrangement.">
        <p className="text-[12px] text-bolt-elements-textSecondary">
          Drag panel dividers in the workspace to resize; the arrangement is saved per project. A preset picker lands
          here next.
        </p>
      </Section>

      <Section title="Accessible Terminal">
        <ToggleRow
          label="Screen-reader friendly terminal output"
          checked={editor.accessibleTerminal}
          onChange={(v) => patch({ accessibleTerminal: v })}
        />
        <p className="text-[12px] text-bolt-elements-textTertiary">
          Announces terminal output for assistive technology.
        </p>
      </Section>

      <Section title="AI &amp; Agent" description="Model and agent behaviour.">
        <ToggleRow
          label="Require review of AI changes"
          checked={requireAiChangeReview}
          onChange={setRequireAiChangeReview}
        />
        <p className="text-[12px] text-bolt-elements-textSecondary">
          {requireAiChangeReview
            ? "The agent's file changes stay pending in “Pending AI changes” — accept or reject each one before it lands."
            : "Off (default): the agent's file changes apply automatically. Turn on to review and approve each change first."}
        </p>
        <a href="/settings" className="w-fit text-[13px] text-[var(--ecode-accent,#F26207)] hover:underline">
          Open model &amp; provider settings
        </a>
        <p className="text-[12px] text-bolt-elements-textTertiary">
          Model selection and provider keys are managed in account settings.
        </p>
      </Section>

      <Section title="Run &amp; Workflows" description="How this project starts.">
        <p className="text-[12px] text-bolt-elements-textSecondary">
          Run and install commands are configured per project in the project settings (the E-Code equivalent of
          Replit&apos;s <code>.replit</code>). Open a project → Settings to edit them.
        </p>
      </Section>
    </div>
  );
}
