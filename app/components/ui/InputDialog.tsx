import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog, DialogDescription, DialogTitle } from './Dialog';
import { FieldError, fieldErrorProps } from './FieldError';
import { Input } from './Input';
import { Label } from './Label';

/**
 * Props for the InputDialog component (design handoff G5).
 */
export interface InputDialogProps {
  /**
   * Whether the dialog is open
   */
  isOpen: boolean;

  /**
   * Callback when the dialog is dismissed without submitting
   */
  onClose: () => void;

  /**
   * Called with the entered value when the user confirms
   */
  onSubmit: (value: string) => void;

  /**
   * The title of the dialog
   */
  title: string;

  /**
   * Optional supporting copy shown under the title
   */
  description?: ReactNode;

  /**
   * Label for the text input
   */
  label: string;

  /**
   * Placeholder for the text input
   */
  placeholder?: string;

  /**
   * Value the input starts with each time the dialog opens
   */
  initialValue?: string;

  /**
   * The text for the confirm button
   */
  confirmLabel?: string;

  /**
   * Optional validator. Return an error message to block submission,
   * or undefined when the value is acceptable.
   */
  validate?: (value: string) => string | undefined;
}

/**
 * A token-styled replacement for `window.prompt`: one labelled text input plus
 * Cancel/confirm actions, following the ConfirmationDialog idiom above.
 */
export function InputDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  validate,
}: InputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | undefined>(undefined);

  /* Each open starts from a fresh value; stale input from a prior use is a footgun. */
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setError(undefined);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validate?.(value);

    if (validationError) {
      setError(validationError);
      return;
    }

    onSubmit(value);
  };

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog showCloseButton={false}>
        <form onSubmit={handleSubmit} className="p-6 bg-bolt-elements-background-depth-2 relative z-10">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
          <div className="mt-4 mb-4">
            <Label htmlFor="input-dialog-value" className="mb-2 block text-bolt-elements-textPrimary">
              {label}
            </Label>
            <Input
              id="input-dialog-value"
              value={value}
              placeholder={placeholder}
              autoFocus
              onChange={(event) => {
                setValue(event.target.value);
                setError(undefined);
              }}
              {...fieldErrorProps('input-dialog-value', error)}
            />
            <FieldError fieldId="input-dialog-value" error={error} />
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:bg-bolt-elements-button-primary-backgroundHover"
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </RadixDialog.Root>
  );
}
