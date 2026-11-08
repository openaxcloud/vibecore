/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IdeSettingsDraftProvider } from './IdeSettingsDraftState';
import { ProjectMetadataForm, type ProjectMetadataSettings } from './ProjectMetadataForm';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it('submits edited name when a delayed GET hydrates another metadata field', () => {
  const onSubmit = vi.fn((event) => {
    event.preventDefault();
    expect(new FormData(event.currentTarget).get('name')).toBe('User edited name');
  });

  const original: ProjectMetadataSettings = { id: 'p1', name: 'Old server name' };
  const view = render(<ProjectMetadataForm settings={original} onSubmit={onSubmit} busy={false} />);
  const field = (name: string) => view.container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  fireEvent.change(field('name'), { target: { value: 'User edited name' } });
  view.rerender(
    <ProjectMetadataForm
      settings={{ ...original, description: 'Delayed server description', gitDefaultBranch: 'trunk' }}
      onSubmit={onSubmit}
      busy={false}
    />,
  );
  expect(field('name').value).toBe('User edited name');
  expect(field('description').value).toBe('Delayed server description');
  expect(field('gitDefaultBranch').value).toBe('trunk');
  fireEvent.submit(field('name').closest('form')!);
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('keeps edits on failed/stale refresh, acknowledges echoed save and then follows later server updates', () => {
  const onSubmit = vi.fn((event) => event.preventDefault());
  const settings = { id: 'p1', name: 'Original' };
  const view = render(<ProjectMetadataForm settings={settings} onSubmit={onSubmit} busy={false} />);
  const name = () => view.container.querySelector<HTMLInputElement>('input[name="name"]')!;
  fireEvent.change(name(), { target: { value: 'Edited' } });
  fireEvent.submit(name().closest('form')!);
  view.rerender(
    <ProjectMetadataForm settings={{ ...settings, name: 'Stale server' }} onSubmit={onSubmit} busy={false} />,
  );
  expect(name().value).toBe('Edited');
  view.rerender(<ProjectMetadataForm settings={{ ...settings, name: 'Edited' }} onSubmit={onSubmit} busy={false} />);
  view.rerender(
    <ProjectMetadataForm settings={{ ...settings, name: 'Later remote edit' }} onSubmit={onSubmit} busy={false} />,
  );
  expect(name().value).toBe('Later remote edit');
});

it('does not carry one project draft into a different project', () => {
  const onSubmit = vi.fn();
  const view = render(<ProjectMetadataForm settings={{ id: 'p1', name: 'One' }} onSubmit={onSubmit} busy={false} />);
  const name = () => view.container.querySelector<HTMLInputElement>('input[name="name"]')!;
  fireEvent.change(name(), { target: { value: 'Unsaved one' } });
  view.rerender(<ProjectMetadataForm settings={{ id: 'p2', name: 'Two' }} onSubmit={onSubmit} busy={false} />);
  expect(name().value).toBe('Two');
});

it('keeps the metadata draft across panel remounts in its shared project/pane scope', () => {
  const fixture = (surface: string) => (
    <IdeSettingsDraftProvider projectId="p1">
      <ProjectMetadataForm
        key={surface}
        paneId="main"
        settings={{ id: 'p1', name: 'Server' }}
        onSubmit={vi.fn()}
        busy={false}
      />
    </IdeSettingsDraftProvider>
  );

  const view = render(fixture('desktop'));
  const name = () => view.container.querySelector<HTMLInputElement>('input[name="name"]')!;
  fireEvent.change(name(), { target: { value: 'Unsaved across remount' } });
  view.rerender(fixture('mobile'));
  expect(name().value).toBe('Unsaved across remount');
});
