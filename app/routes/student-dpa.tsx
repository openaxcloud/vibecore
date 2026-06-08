import { EcodeStudentDpaPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('student-dpa');

export default function StudentDpaRoute() {
  return <EcodeStudentDpaPage />;
}
