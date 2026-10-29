/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserMessage } from './UserMessage';
import { DELAI_APPUI_LONG_MS, menuDeMessageOuvert } from './message-context-menu';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'fr' } }) }));
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => (
    <p>
      {children}
      <a href="#details">Détails</a>
    </p>
  ),
}));

function Message({ array = false, content = 'Un message utilisateur', id = 'a', editable = true, mobile = false }) {
  return (
    <div className={mobile ? 'bolt-responsive-ide-mobile' : ''}>
      <div className="bolt-chat-message-row" tabIndex={0} data-testid="row">
        <UserMessage
          content={array ? [{ type: 'text', text: content }] : content}
          parts={undefined}
          messageId={id}
          canEdit={editable}
        />
      </div>
      <button>Autre cible</button>
    </div>
  );
}

function open() {
  const row = screen.getByTestId('row');
  row.focus();
  fireEvent.keyDown(row, { key: 'F10', shiftKey: true });

  return row;
}

function pointer(target: Element, type: string, clientY = 100) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType: 'touch', button: 0, isPrimary: true, pointerId: 1, clientX: 150, clientY });
  fireEvent(target, event);
}
afterEach(() => {
  cleanup();
  menuDeMessageOuvert.set(null);
  vi.useRealTimers();
});

describe('menu du vrai message utilisateur', () => {
  it('garde le menu d’un très long message dans la zone mobile visible', () => {
    render(<Message mobile content={'Long message '.repeat(3000)} />);

    const row = screen.getByTestId('row');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 390,
      height: 5000,
      right: 390,
      bottom: 5000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    open();
    expect(Number.parseFloat(screen.getByRole('menu').style.top)).toBeLessThan(window.innerHeight);
  });
  it('ferme au Tab et permet de rouvrir avec la touche Menu contextuel', () => {
    render(<Message />);

    const row = open();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(row, { key: 'ContextMenu' });
    expect(screen.getByRole('menu')).toBeTruthy();

    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
      fireEvent.keyDown(screen.getByRole('menu'), { key });
      expect(document.activeElement?.tagName).toBe('BUTTON');
    }
  });

  it.each([false, true])('ouvre depuis la ligne avec Maj+F10, puis restitue le focus (tableau=%s)', (array) => {
    render(<Message array={array} />);

    const row = open();
    const menu = screen.getByRole('menu');
    expect(menu.closest('.bolt-user-message-bubble')).toBeNull();
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(row);
  });
  it('ne vole pas Entrée ou Espace à un lien du message', () => {
    render(<Message />);

    for (const key of ['Enter', ' ']) {
      expect(fireEvent.keyDown(screen.getByRole('link'), { key })).toBe(true);
    }
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it.each(['', '[Model: hidden]'])('ne consomme pas le raccourci sans texte éditable (%s)', (content) => {
    render(<Message content={content} />);
    expect(fireEvent.keyDown(screen.getByTestId('row'), { key: 'F10', shiftKey: true })).toBe(true);
    expect(menuDeMessageOuvert.get()).toBeNull();
  });
  it('ferme après édition sans voler le focus choisi par le composeur', () => {
    render(<Message />);

    const target = screen.getByRole('button', { name: 'Autre cible' });
    const edit = vi.fn(() => target.focus());
    window.addEventListener('vibecore:edit-message', edit);

    try {
      open();
      fireEvent.click(screen.getByRole('button', { name: /Modifier/ }));
      expect(edit).toHaveBeenCalledOnce();
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(target);
    } finally {
      window.removeEventListener('vibecore:edit-message', edit);
    }
  });
  it('ne ressuscite pas un menu après changement de projet et remontage du même id', () => {
    const first = render(<Message />);
    open();
    expect(screen.getByRole('menu')).toBeTruthy();
    first.unmount();
    render(<Message />);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('ferme quand édition devient indisponible sans rouvrir au rétablissement', () => {
    const view = render(<Message />);
    open();
    expect(screen.getByRole('menu')).toBeTruthy();
    view.rerender(<Message editable={false} />);
    view.rerender(<Message />);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('ouvre sur appui long dans la gouttière mobile, puis Échap revient à la ligne', () => {
    vi.useFakeTimers();
    render(<Message mobile />);

    const row = screen.getByTestId('row');
    row.focus();
    pointer(row, 'pointerdown');
    act(() => vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 1));

    const menu = screen.getByRole('menu');
    expect(menu.parentElement?.className).toBe('bolt-responsive-ide-mobile');
    expect(fireEvent(row, new Event('touchend', { bubbles: true, cancelable: true }))).toBe(false);
    expect(screen.getByRole('menu')).toBe(menu);
    expect(document.activeElement).toBe(menu);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(fireEvent(document.activeElement!, new Event('touchend', { bubbles: true, cancelable: true }))).toBe(true);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.activeElement).toBe(row);
  });
  it('annule un appui lors du changement de message et ne rouvre pas son ancien id', () => {
    vi.useFakeTimers();

    const view = render(<Message />);
    pointer(document.querySelector('.bolt-user-message')!, 'pointerdown');
    view.rerender(<Message id="b" />);
    act(() => vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 1));
    expect(menuDeMessageOuvert.get()).toBeNull();
    view.rerender(<Message />);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('annule un appui quand le doigt défile', () => {
    vi.useFakeTimers();
    render(<Message mobile />);

    const row = screen.getByTestId('row');
    pointer(row, 'pointerdown');
    pointer(row, 'pointermove', 150);
    act(() => vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 1));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(fireEvent(row, new Event('touchend', { bubbles: true, cancelable: true }))).toBe(true);
  });
});
