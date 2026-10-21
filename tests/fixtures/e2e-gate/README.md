# Complete execution is required by the E2E gate

Incident: run 39562715431, head 2d37c65eb94046c55813625a3c2cc648ae9df57b.
The tranche-1 job 119098559916 log independently confirms both global errors:
`Timed out waiting 3600s for the test suite to run` and
`Timed out waiting 3600s for the teardown for test suite to run`.
The job itself concluded success; the aggregate gate 119127212571 failed on
ordinary failures, but ignored the global errors and involuntary skips.

The coordinator's independent artifact review reports 404 direct successes,
2 flaky, 6 failures, 44 skipped: 26 intentional and 18 expected-pass cases,
17 of those with no attempt. The baseline main run 39478501987 reportedly has
425 direct successes, 26 intentional skips, 2 failures, 3 flaky, no global error
or absent attempt. These aggregate counts are attributed to that review, not
reconstructed from downloaded JSON here. Artifact 12332327097 was identified
through authorized metadata; a previously refused artifact download was not
retried. Presence of all 75 spec files is not proof of complete execution.

## Real runner fixtures

`generate.mjs` runs installed Playwright 1.59.1 in disposable directories,
without browsers or application providers. It saves actual JSON reporter
output and its test source. Only the temporary directory prefix is redacted.
It asserts runner exit 0 for completed and 1 for the three negative scenarios.
No production configuration, timeout or exemption is changed.

- completed: success, declared skip, conditional explicit skip, expected
  failure and a failed first attempt followed by a successful retry;
- serial: actual failure followed by an involuntarily skipped dependent case;
- timeout: an unfinished promise and a following test, stopped by a dedicated
  fixture-only 1500 ms global deadline, with suite and teardown errors;
- teardown: successful test followed by an actual global teardown exception.

The short deadline exists solely to generate a real timeout report. There is
no sleep, service response substitution, or change to the production 3600 s
budget. These are local fixtures, not the original CI report.

## Before/after proof

`gate-comparison.json` contains exact gate/report hashes, exit codes and raw
stdout/stderr from baseline 4af4dd1a versus the candidate. Full completed stays
0; full serial failure stays 1. Timeout and teardown change 0→1. Projections
that retain just the real involuntary skipped case, removing unrelated errors,
also change 0→1, both with a skipped attempt and with no attempt.

`e2e-report-completeness.spec.ts` executes the actual CLI in an isolated directory
with a bounded test policy. It additionally verifies that a waiver/later success
cannot erase missing execution, explicit expected skips/failures remain valid,
and the waiver count separates policy entries from matched failing tests.
Malformed empty variants and an interrupted attempt are deliberately derived
negative cases, not claimed as observed CI records. Original policy and its
expiry are untouched. Existing shard guards retain all assertions; their
minimal input records now include actual attempt and expected-status fields.

Initial counterproof: 7 failures / 1 pass against the old gate. Subsequent
complete run and exact final SHA are reported in the draft PR. The gate change
does not fix the six failing browser scenarios, remove flakes, or certify any
panel. No merge is authorized.
