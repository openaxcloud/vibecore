type SubmitterValue = {
  name?: unknown;
  value?: unknown;
};

/**
 * `new FormData(form)` intentionally omits the submit button. When a form has
 * several submit intents, React's preventDefault + manual fetch flow must add
 * the button that initiated the SubmitEvent or the server receives its default
 * intent and can report success without performing the requested mutation.
 */
export function includeSubmitterValue(formData: FormData, submitter: EventTarget | null): FormData {
  if (!submitter || typeof submitter !== 'object') {
    return formData;
  }

  const candidate = submitter as SubmitterValue;

  if (typeof candidate.name === 'string' && candidate.name && typeof candidate.value === 'string') {
    formData.set(candidate.name, candidate.value);
  }

  return formData;
}
