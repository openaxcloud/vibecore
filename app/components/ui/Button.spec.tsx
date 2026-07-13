/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants, mergeAsChildProps } from './Button';

describe('mergeAsChildProps', () => {
  it('concatenates button and child classNames (button first)', () => {
    const merged = mergeAsChildProps({ className: 'child' }, { className: 'btn' });
    expect(merged.className).toBe('btn child');
  });

  it('lets button props override child props of the same key, but keeps unique child props', () => {
    const merged = mergeAsChildProps(
      { href: 'https://e-code.ai', target: '_blank', 'data-foo': 'child' },
      { className: 'btn', 'data-foo': 'button' },
    );
    expect(merged.href).toBe('https://e-code.ai');
    expect(merged.target).toBe('_blank');
    expect(merged['data-foo']).toBe('button');
    expect(merged.className).toBe('btn');
  });

  it('handles missing classNames gracefully', () => {
    expect(mergeAsChildProps({}, {}).className).toBe('');
    expect(mergeAsChildProps({ className: 'child' }, {}).className).toBe('child');
    expect(mergeAsChildProps({}, { className: 'btn' }).className).toBe('btn');
  });
});

describe('Button', () => {
  it('renders a native <button> by default with its children', () => {
    const { container } = render(<Button>Click me</Button>);
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Click me');
    expect(button?.getAttribute('data-vc-button')).toBe('true');

    // No nested anchor.
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders the child element (not a <button>) when _asChild is set', () => {
    const { container } = render(
      <Button _asChild>
        <a href="https://e-code.ai" target="_blank" rel="noreferrer">
          Get LM Studio
        </a>
      </Button>,
    );

    // The single semantic element must be the anchor, NOT a <button> wrapping an <a>.
    expect(container.querySelector('button')).toBeNull();

    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://e-code.ai');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.textContent).toBe('Get LM Studio');
  });

  it('applies the button styling and data attributes to the _asChild element', () => {
    const { container } = render(
      <Button _asChild variant="outline" size="sm" className="extra">
        <a href="/models">Browse Models</a>
      </Button>,
    );

    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('data-vc-button')).toBe('true');
    expect(anchor?.getAttribute('data-variant')).toBe('outline');
    expect(anchor?.getAttribute('data-size')).toBe('sm');
    expect(anchor?.className).toContain('extra');

    // Carries the shared variant base class.
    expect(anchor?.className).toContain('inline-flex');
  });

  it('falls back to a <button> when _asChild is set but children is not a valid element', () => {
    const { container } = render(<Button _asChild>plain text</Button>);
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('plain text');
  });

  it('exposes buttonVariants for shared styling', () => {
    expect(typeof buttonVariants).toBe('function');
    expect(buttonVariants({ variant: 'default', size: 'default' })).toContain('inline-flex');
  });

  it('uses the scoped semantic action tokens for intentional primary actions', () => {
    const classes = buttonVariants({ variant: 'primary', size: 'default' });

    expect(classes).toContain('bg-[var(--vc-action-primary)]');
    expect(classes).toContain('text-[var(--vc-action-primary-foreground)]');
    expect(classes).toContain('hover:bg-[var(--vc-action-primary-hover)]');
  });
});
