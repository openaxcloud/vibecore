/** Only an explicit affirmative value requests the database in a checkpoint restore. */
export function shouldRestoreDatabase(field: unknown): boolean {
  if (field === true) {
    return true;
  }

  if (typeof field !== 'string') {
    return false;
  }

  const normalized = field.trim().toLowerCase();

  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}
