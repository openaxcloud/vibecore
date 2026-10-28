/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsFormDraft, type SettingsFormValues } from './IdeSettingsDraftState';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const initial: SettingsFormValues = {
  'profile.name': 'Server name',
  'profile.email': 'user@local.test',
  'preferences.theme': 'system',
  'preferences.keyboardMode': 'false',
  'keybinding:file.save': 'cmd+s',
  'preferences.creditAlertThreshold': '80',
};

function Form({
  pane = 'pane-a',
  project = 'p1',
  values = initial,
}: {
  pane?: string;
  project?: string;
  values?: SettingsFormValues;
}) {
  const draft = useIdeSettingsFormDraft(project, pane, values);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input
        aria-label={`${pane}-name`}
        value={draft.values['profile.name']}
        onChange={(event) => draft.setField('profile.name', event.currentTarget.value)}
      />
      <input
        aria-label={`${pane}-threshold`}
        value={draft.values['preferences.creditAlertThreshold']}
        onChange={(event) => draft.setField('preferences.creditAlertThreshold', event.currentTarget.value)}
      />
      {(['profile.email', 'preferences.theme', 'preferences.keyboardMode', 'keybinding:file.save'] as const).map(
        (field) => (
          <input
            key={field}
            aria-label={`${pane}-${field}`}
            value={draft.values[field]}
            onChange={(event) => draft.setField(field, event.currentTarget.value)}
          />
        ),
      )}
      <button>Submit without saving</button>
    </form>
  );
}

function tree(shell = 'desktop', project = 'p1', window = 'main', values = initial, show = true) {
  return (
    <IdePaletteProvider projectId={project} windowId={window}>
      <section key={shell}>
        {show && (
          <>
            <Form project={project} values={values} />
            <Form pane="pane-b" project={project} values={values} />
          </>
        )}
      </section>
    </IdePaletteProvider>
  );
}
it('keeps non-sensitive drafts through shell remount and tab disappearance, isolated between panes', () => {
  const view = render(tree());
  fireEvent.change(view.getByLabelText('pane-a-name'), { target: { value: 'Unsaved name' } });
  fireEvent.change(view.getByLabelText('pane-a-threshold'), { target: { value: '77' } });
  expect(view.getByLabelText<HTMLInputElement>('pane-b-name').value).toBe('Server name');
  view.rerender(tree('mobile'));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Unsaved name');
  view.rerender(tree('mobile', 'p1', 'main', initial, false));
  view.rerender(tree('desktop'));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-threshold').value).toBe('77');
});
it.each([
  ['p2', 'main'],
  ['p1', 'second'],
])('does not transfer drafts to scope %s/%s', (project, window) => {
  const view = render(tree());
  fireEvent.change(view.getByLabelText('pane-a-name'), { target: { value: 'Private draft' } });
  view.rerender(tree('mobile', project, window));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Server name');
});
it('accepts fresh server fields while preserving dirty fields and acknowledges only matching values', () => {
  const view = render(tree());
  fireEvent.change(view.getByLabelText('pane-a-name'), { target: { value: 'Unsaved name' } });

  const changed = { ...initial, 'profile.name': 'Another server name', 'preferences.creditAlertThreshold': '90' };
  view.rerender(tree('desktop', 'p1', 'main', changed));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Unsaved name');
  expect(view.getByLabelText<HTMLInputElement>('pane-a-threshold').value).toBe('90');
  view.rerender(tree('desktop', 'p1', 'main', { ...changed, 'profile.name': 'Unsaved name' }));
  view.rerender(tree('desktop', 'p1', 'main', { ...changed, 'profile.name': 'Later server value' }));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Later server value');
});
it('keeps drafts after a cancelled submission and reverts clean fields to fresh data', () => {
  const view = render(tree());
  const input = view.getByLabelText<HTMLInputElement>('pane-a-name');
  fireEvent.change(input, { target: { value: 'Unsaved name' } });
  fireEvent.submit(input.closest('form')!);
  view.rerender(tree('mobile'));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Unsaved name');
  fireEvent.change(view.getByLabelText('pane-a-name'), { target: { value: 'Server name' } });
  view.rerender(tree('desktop', 'p1', 'main', { ...initial, 'profile.name': 'Fresh' }));
  expect(view.getByLabelText<HTMLInputElement>('pane-a-name').value).toBe('Fresh');
});
it('keeps legacy callers local even inside a shared route provider', () => {
  function Legacy() {
    const draft = useIdeSettingsFormDraft('p1', undefined, initial);
    return (
      <input
        aria-label="legacy"
        value={draft.values['profile.name']}
        onChange={(e) => draft.setField('profile.name', e.currentTarget.value)}
      />
    );
  }

  const view = render(
    <IdePaletteProvider projectId="p1" windowId="main">
      <Legacy key="a" />
    </IdePaletteProvider>,
  );
  fireEvent.change(view.getByLabelText('legacy'), { target: { value: 'Local' } });
  view.rerender(
    <IdePaletteProvider projectId="p1" windowId="main">
      <Legacy key="b" />
    </IdePaletteProvider>,
  );
  expect(view.getByLabelText<HTMLInputElement>('legacy').value).toBe('Server name');
});

it.each([
  ['profile.email', 'draft@local.test'],
  ['preferences.theme', 'light'],
  ['preferences.keyboardMode', 'true'],
  ['keybinding:file.save', 'ctrl+alt+s'],
])('preserves unsaved %s and ignores unrelated global success/failure events', (field, value) => {
  const view = render(tree());
  fireEvent.change(view.getByLabelText(`pane-a-${field}`), { target: { value } });
  window.dispatchEvent(new CustomEvent('vibecore:ide-panel-action', { detail: { panel: 'settings', ok: true } }));
  window.dispatchEvent(new CustomEvent('vibecore:ide-panel-action', { detail: { panel: 'settings', ok: false } }));
  view.rerender(tree('mobile'));
  expect(view.getByLabelText<HTMLInputElement>(`pane-a-${field}`).value).toBe(value);
});
