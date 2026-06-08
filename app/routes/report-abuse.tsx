import { EcodeReportAbusePage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('report-abuse');

export default function ReportAbuseRoute() {
  return <EcodeReportAbusePage />;
}
