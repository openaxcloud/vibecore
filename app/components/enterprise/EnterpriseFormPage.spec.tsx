/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrimaryButton, SelectField, TextField } from './EnterpriseFormPage';

describe('enterprise form touch targets', () => {
  it('keeps shared fields and primary actions at least 44px tall', () => {
    render(
      <>
        <TextField label="Name" name="name" />
        <SelectField label="Status" name="status" options={[{ value: 'active', label: 'Active' }]} />
        <PrimaryButton>Save</PrimaryButton>
      </>,
    );

    expect(screen.getByRole('textbox', { name: 'Name' }).className).toContain('min-h-[44px]');
    expect(screen.getByRole('combobox', { name: 'Status' }).className).toContain('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('min-h-[44px]');
  });
});
