import { useStore } from '@nanostores/react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemePreferenceControl } from '~/components/ui/ThemePreferenceControl';
import { setRequireAiChangeReview, useRequireAiChangeReview } from '~/lib/hooks/useAutoApplyEnabled';
import {
  formatApiKeysWorkspaceSettingsNumber,
  formatWorkspaceSpaces,
  getWorkspaceSettingsCopy,
  interpolateApiKeysWorkspaceSettingsCopy,
  resolveApiKeysWorkspaceSettingsLanguage,
} from '~/lib/i18n/catalogs/api-keys-workspace-settings';
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
    <section className="min-w-0 border-b border-bolt-elements-borderColor py-5 last:border-b-0">
      {/*
       * `h2` : les sections viennent directement sous le `h1` de la page. En `h3`
       * elles créaient un saut h1→h3, mesuré aux trois formats après le passage
       * du titre en `h1` — un niveau sauté reste un défaut WCAG 1.3.1, au même
       * titre que l'absence de niveau 1 qu'on venait de corriger. La taille est
       * portée par la classe, l'apparence ne bouge pas.
       */}
      <h2 className="break-words text-[14px] font-semibold text-bolt-elements-textPrimary">{title}</h2>
      {description ? (
        <p className="mt-0.5 break-words text-[12px] leading-5 text-bolt-elements-textSecondary">{description}</p>
      ) : null}
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
    <label className="flex min-w-0 cursor-pointer items-start justify-between gap-3 text-[13px] text-bolt-elements-textPrimary sm:items-center">
      <span className="min-w-0 break-words leading-5">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ecode-accent,#F26207)] sm:mt-0"
      />
    </label>
  );
}

export function WorkspaceSettings({ language }: { language?: string }) {
  const editor = useStore(editorSettingsStore);
  const requireAiChangeReview = useRequireAiChangeReview();
  const { i18n } = useTranslation();
  const resolvedLanguage = resolveApiKeysWorkspaceSettingsLanguage(language ?? i18n.resolvedLanguage ?? i18n.language);
  const copy = getWorkspaceSettingsCopy(resolvedLanguage);

  const patch = (next: Partial<EditorSettings>) => setEditorSettings(next);

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 px-4 py-2 sm:px-5">
      <header className="py-4">
        {/*
         * `h1` et non `h2` : la route monte la coque avec `hideHeader`, donc rien
         * d'autre ne fournit de titre de niveau 1. La page démarrait au niveau 2,
         * ce qui laisse un lecteur d'écran sans point d'entrée dans le document
         * (WCAG 1.3.1). L'apparence ne bouge pas — la taille reste portée par la
         * classe, pas par le niveau de titre.
         */}
        <h1 className="break-words text-[16px] font-semibold text-bolt-elements-textPrimary">{copy.header.title}</h1>
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textSecondary">{copy.header.description}</p>
      </header>

      <Section title={copy.editor.title} description={copy.editor.description}>
        <div className="flex min-w-0 flex-col items-stretch justify-between gap-2 text-[13px] text-bolt-elements-textPrimary sm:flex-row sm:items-center sm:gap-3">
          <span className="break-words">{copy.editor.fontSize}</span>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              aria-label={copy.editor.decreaseFontSize}
              onClick={() => patch({ fontSize: editor.fontSize - 1 })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-12 text-center tabular-nums">
              {interpolateApiKeysWorkspaceSettingsCopy(copy.editor.fontSizeValue, {
                size: formatApiKeysWorkspaceSettingsNumber(editor.fontSize, resolvedLanguage),
              })}
            </span>
            <button
              type="button"
              aria-label={copy.editor.increaseFontSize}
              onClick={() => patch({ fontSize: editor.fontSize + 1 })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <label className="flex min-w-0 flex-col items-stretch justify-between gap-2 text-[13px] text-bolt-elements-textPrimary sm:flex-row sm:items-center sm:gap-3">
          <span className="break-words">{copy.editor.indentation}</span>
          <select
            value={editor.tabSize}
            onChange={(e) => patch({ tabSize: Number(e.target.value) })}
            className="min-h-9 max-w-full self-end rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-[13px] sm:self-auto"
          >
            <option value={2}>{formatWorkspaceSpaces(resolvedLanguage, 2)}</option>
            <option value={4}>{formatWorkspaceSpaces(resolvedLanguage, 4)}</option>
            <option value={8}>{formatWorkspaceSpaces(resolvedLanguage, 8)}</option>
          </select>
        </label>

        <ToggleRow label={copy.editor.wordWrap} checked={editor.wordWrap} onChange={(v) => patch({ wordWrap: v })} />
        <ToggleRow label={copy.editor.vimMode} checked={editor.vimMode} onChange={(v) => patch({ vimMode: v })} />
        <ToggleRow
          label={copy.editor.formatOnSave}
          checked={editor.formatOnSave}
          onChange={(v) => patch({ formatOnSave: v })}
        />

        <button
          type="button"
          onClick={() => resetEditorSettings()}
          className="w-fit text-[12px] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:underline"
        >
          {copy.editor.reset}
        </button>
      </Section>

      <Section title={copy.appearance.title} description={copy.appearance.description}>
        <div className="flex min-w-0 flex-col items-start justify-between gap-2 text-[13px] text-bolt-elements-textPrimary sm:flex-row sm:items-center sm:gap-3">
          <span className="break-words">{copy.appearance.theme}</span>
          <ThemePreferenceControl language={resolvedLanguage} className="w-full justify-center sm:w-auto" />
        </div>
      </Section>

      <Section title={copy.layout.title} description={copy.layout.description}>
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textSecondary">{copy.layout.detail}</p>
      </Section>

      <Section title={copy.accessibleTerminal.title}>
        <ToggleRow
          label={copy.accessibleTerminal.label}
          checked={editor.accessibleTerminal}
          onChange={(v) => patch({ accessibleTerminal: v })}
        />
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textTertiary">
          {copy.accessibleTerminal.description}
        </p>
      </Section>

      <Section title={copy.agent.title} description={copy.agent.description}>
        <ToggleRow
          label={copy.agent.requireReview}
          checked={requireAiChangeReview}
          onChange={setRequireAiChangeReview}
        />
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textSecondary">
          {requireAiChangeReview ? copy.agent.reviewOn : copy.agent.reviewOff}
        </p>
        <a
          href="/settings"
          className="w-fit max-w-full break-words text-[13px] leading-5 text-[var(--ecode-accent,#F26207)] hover:underline"
        >
          {copy.agent.openSettings}
        </a>
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textTertiary">{copy.agent.settingsDetail}</p>
      </Section>

      <Section title={copy.run.title} description={copy.run.description}>
        <p className="break-words text-[12px] leading-5 text-bolt-elements-textSecondary">
          {copy.run.detailPrefix} <code>.replit</code>
          {copy.run.detailSuffix}
        </p>
      </Section>
    </div>
  );
}
