import { parseArgs } from 'node:util';
import { capture } from './capture-rollout-diagnostics.js';

const separator = process.argv.indexOf('--', 2);
if (separator < 0) {
  throw new Error('A wrapped command is required after --');
}
const { values } = parseArgs({
  args: process.argv.slice(2, separator),
  options: { namespace: { type: 'string' }, release: { type: 'string' }, output: { type: 'string' } },
});
if (!values.namespace || !values.release || !values.output) {
  throw new Error('--namespace, --release and --output are required');
}
process.exitCode = await capture({
  namespace: values.namespace,
  release: values.release,
  output: values.output,
  command: process.argv.slice(separator + 1),
});
