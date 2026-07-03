/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldError, FormErrorSummary, fieldErrorId, fieldErrorProps } from './FieldError';

afterEach(() => {
  cleanup();
});

describe('fieldErrorId', () => {
  it('derives the error element id from the field id', () => {
    expect(fieldErrorId('billingEmail')).toBe('billingEmail-error');
  });
});

describe('fieldErrorProps', () => {
  it('returns no attributes when there is no error', () => {
    expect(fieldErrorProps('billingEmail')).toEqual({});
    expect(fieldErrorProps('billingEmail', null)).toEqual({});
    expect(fieldErrorProps('billingEmail', '')).toEqual({});
  });

  it('ties the field to its error message when there is an error', () => {
    expect(fieldErrorProps('billingEmail', 'Invalid email')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'billingEmail-error',
    });
  });
});

describe('<FieldError />', () => {
  it('renders nothing without an error', () => {
    const { container } = render(<FieldError fieldId="billingEmail" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the message under the id the input points at via aria-describedby', () => {
    render(<FieldError fieldId="billingEmail" error="Invalid email" />);

    const message = document.getElementById('billingEmail-error');
    expect(message).not.toBeNull();
    expect(message?.textContent).toBe('Invalid email');
  });
});

describe('<FormErrorSummary />', () => {
  const twoErrors = [
    { fieldId: 'name', message: 'Name is required' },
    { fieldId: 'email', message: 'Email is invalid' },
  ];

  it('renders nothing below 3 field errors', () => {
    const { container } = render(<FormErrorSummary errors={twoErrors} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an alert listing every error as a #field-id anchor at 3+ errors', () => {
    const errors = [...twoErrors, { fieldId: 'password', message: 'Password is too short' }];

    render(<FormErrorSummary errors={errors} title="Fix these first" />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Fix these first');

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#name', '#email', '#password']);
    expect(links[2].textContent).toBe('Password is too short');
  });
});
