import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';

/**
 * Brand strings for the user-facing debug report produced by
 * {@link ../utils/debugLogger#downloadDebugLog}.
 *
 * The downloaded `.txt` file (its name and its summary header) is a
 * user-facing deliverable, so it must carry the product brand (E-Code) and
 * never the upstream codename ("Bolt" / "BOLT DIY"). Routing the brand through
 * a single constant here prevents the codename from regressing back into the
 * report.
 */

/** Product brand shown to end users. */
export const DEBUG_REPORT_BRAND = 'E-Code';

/**
 * Build the default download filename for the debug report, e.g.
 * `ecode-debug-2026-06-24.txt`.
 *
 * @param date - the date used for the filename suffix (defaults to now).
 */
export function debugReportFilename(date: Date = new Date()): string {
  return `ecode-debug-${date.toISOString().split('T')[0]}.txt`;
}

/** Header line that opens the human-readable debug summary. */
export function debugReportSummaryHeader(language?: string | null): string {
  const copy = getClientRuntimeResidualCopy(language);

  const label = formatClientRuntimeResidualCopy(copy['clientRuntime.debugReport.summaryHeader'], {
    brand: DEBUG_REPORT_BRAND.toUpperCase(),
  });

  return `=== ${label.toUpperCase()} ===`;
}
