/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseWorkbench } from './DatabaseWorkbench';

type Fetcher = {
  state: 'idle' | 'loading';
  data?: unknown;
  load: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
};

let fetchers: Fetcher[];
let nextFetcher = 0;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));
vi.mock('react-router', () => ({
  useFetcher: () => {
    // Each real hook owns its response for the lifetime of its mounted component.
    const [index] = useState(() => nextFetcher++);

    return fetchers[index];
  },
}));
vi.mock('./DatabaseSettings', () => ({ DatabaseSettings: () => <div /> }));
vi.mock('./DatabaseStudio', () => ({ DatabaseStudio: () => <div /> }));

const connections = (key: string) => ({ connections: [{ key, environment: 'shared' }], environments: ['development'] });

beforeEach(() => {
  nextFetcher = 0;
  fetchers = Array.from({ length: 6 }, () => ({ state: 'idle', load: vi.fn(), submit: vi.fn() }));
});
afterEach(cleanup);

describe('DatabaseWorkbench initial parent response', () => {
  it('renders the real connection immediately without fetching the same list again', () => {
    render(<DatabaseWorkbench projectId="one" initialData={connections('DATABASE_URL')} />);
    expect(screen.getByText('DATABASE_URL')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(fetchers[0].load).not.toHaveBeenCalled();
  });

  it('keeps a real empty response empty without fetching or inventing connections', () => {
    render(<DatabaseWorkbench projectId="one" initialData={connections('')} />);
    expect(screen.getByText('No database yet')).toBeTruthy();
    expect(fetchers[0].load).not.toHaveBeenCalled();
  });

  it('loads once when mounted independently without a parent response', () => {
    const view = render(<DatabaseWorkbench projectId="one" />);
    view.rerender(<DatabaseWorkbench projectId="one" />);
    expect(fetchers[0].load).toHaveBeenCalledExactlyOnceWith('/api/projects/one/ide-panel/database');
  });

  it('refreshes explicitly, preserves real data while pending, then renders the response', () => {
    const initial = connections('FIRST_URL');
    const view = render(<DatabaseWorkbench projectId="one" initialData={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fetchers[0].load).toHaveBeenCalledExactlyOnceWith('/api/projects/one/ide-panel/database');
    fetchers[0].state = 'loading';
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    expect(screen.getByText('FIRST_URL')).toBeTruthy();
    fetchers[0].state = 'idle';
    fetchers[0].data = { data: connections('SECOND_URL') };
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    expect(screen.getByText('SECOND_URL')).toBeTruthy();
    expect(screen.queryByText('FIRST_URL')).toBeNull();
  });

  it('does not hide a failed refresh behind the initial response and retains retry', () => {
    const initial = connections('FIRST_URL');
    const view = render(<DatabaseWorkbench projectId="one" initialData={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('FIRST_URL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(fetchers[0].load).toHaveBeenCalledTimes(2);
  });

  it('accepts later parent updates after onboarding instead of retaining the child response', () => {
    const initial = connections('FIRST_URL');
    const view = render(<DatabaseWorkbench projectId="one" initialData={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fetchers[0].data = { data: connections('SECOND_URL') };
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    expect(screen.getByText('SECOND_URL')).toBeTruthy();

    const updated = connections('THIRD_URL');
    view.rerender(<DatabaseWorkbench projectId="one" initialData={updated} />);
    expect(screen.getByText('THIRD_URL')).toBeTruthy();
    expect(screen.queryByText('SECOND_URL')).toBeNull();
    expect(fetchers[0].load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fetchers[0].state = 'loading';
    view.rerender(<DatabaseWorkbench projectId="one" initialData={updated} />);
    expect(screen.getByText('THIRD_URL')).toBeTruthy();
    expect(screen.queryByText('SECOND_URL')).toBeNull();
  });

  it('reloads once after provisioning even with an initial response', () => {
    const initial = { connections: [] };
    const view = render(<DatabaseWorkbench projectId="one" initialData={initial} />);
    fetchers[1].data = { ok: true };
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    view.rerender(<DatabaseWorkbench projectId="one" initialData={initial} />);
    expect(fetchers[0].load).toHaveBeenCalledExactlyOnceWith('/api/projects/one/ide-panel/database');
  });

  it('discards selection and previous fetcher responses when the project changes', () => {
    const view = render(<DatabaseWorkbench projectId="one" initialData={connections('FIRST_URL')} />);
    fireEvent.click(screen.getByText('FIRST_URL'));
    expect(fetchers[2].load).toHaveBeenCalledExactlyOnceWith(
      '/api/projects/one/ide-panel/database?schemaKey=FIRST_URL',
    );
    fetchers[0].data = { data: connections('OLD_URL') };
    view.rerender(<DatabaseWorkbench projectId="two" initialData={connections('NEW_URL')} />);
    expect(screen.getByText('NEW_URL')).toBeTruthy();
    expect(screen.queryByText('FIRST_URL')).toBeNull();
    expect(screen.queryByText('OLD_URL')).toBeNull();
    expect(fetchers[3].load).not.toHaveBeenCalled();
    expect(fetchers[5].load).not.toHaveBeenCalled();
  });
});
