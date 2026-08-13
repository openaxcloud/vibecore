/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PresenceAvatars, type PresenceEntry } from './PresenceAvatars';

function entry(userId: string, name: string, status: PresenceEntry['status'] = 'viewing'): PresenceEntry {
  return { userId, name, status, lastSeenAt: Date.now() };
}

describe('<PresenceAvatars />', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no entries are present', () => {
    const { container } = render(<PresenceAvatars entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders initials when no avatar URL is set', () => {
    render(<PresenceAvatars entries={[entry('u1', 'Alice Smith'), entry('u2', 'Bob')]} />);

    expect(screen.getByText('AS')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders an image when an avatar URL is set', () => {
    const { container } = render(
      <PresenceAvatars
        entries={[
          {
            userId: 'u1',
            name: 'Alice',
            avatarUrl: 'https://example.com/a.png',
            status: 'viewing',
            lastSeenAt: Date.now(),
          },
        ]}
      />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('exposes the count of viewers via aria-label', () => {
    render(
      <PresenceAvatars
        entries={[entry('u1', 'Alice'), entry('u2', 'Bob'), entry('u3', 'Carol'), entry('u4', 'Dee')]}
      />,
    );

    expect(screen.getByLabelText('4 viewers')).toBeTruthy();
  });

  it('collapses overflow beyond maxVisible into a +N chip', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, idx) => entry(`u-${id}`, `User ${idx}`));

    render(<PresenceAvatars entries={entries} maxVisible={3} />);

    expect(screen.getByLabelText('3 more viewers').textContent).toBe('+3');
  });

  it('flags typing presence so the parent can style it differently', () => {
    render(<PresenceAvatars entries={[entry('u1', 'Alice', 'typing')]} />);

    expect(screen.getByLabelText('Alice typing').getAttribute('data-status')).toBe('typing');
  });
});
