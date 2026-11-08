import assert from 'node:assert/strict';
import test from 'node:test';
import { redactRuntimeEvidence as redact } from './runtime-evidence-redaction.mjs';

test('redacts generated credentials literally without treating them as regexes', () => {
  assert.equal(redact('before a.b+c a.b+c after', ['', undefined, 'a.b+c']), 'before [REDACTED] [REDACTED] after');
});

test('preserves existing bearer, JWT and query-token filtering', () => {
  const actual = redact(
    'Bearer abc-123== jwt=eyJabc.def.ghi https://local/?token=secret&ticket=another&key=third&port=8080',
  );
  assert.equal(
    actual,
    'Bearer [REDACTED] jwt=[REDACTED_JWT] https://local/?token=[REDACTED]&ticket=[REDACTED]&key=[REDACTED]&port=8080',
  );
});

test('redacts K3s secure server and agent tokens, including JSON-quoted values', () => {
  for (const role of ['server', 'agent']) {
    const token = `K10${'a'.repeat(64)}::${role}:synthetic-password`;
    assert.equal(redact(`{"token":"${token}"}`), '{"token":"[REDACTED_K3S_TOKEN]"}');
  }
});

test('redacts quoted and unquoted K3s token assignments and CLI arguments', () => {
  for (const [input, expected] of [
    ['K3S_TOKEN=synthetic', 'K3S_TOKEN=[REDACTED]'],
    ['K3S_AGENT_TOKEN="synthetic token"', 'K3S_AGENT_TOKEN="[REDACTED]"'],
    ["K3S_TOKEN='synthetic'", "K3S_TOKEN='[REDACTED]'"],
    ['k3s server --token=synthetic --port 6443', 'k3s server --token=[REDACTED] --port 6443'],
    ['k3s agent --agent-token "synthetic"', 'k3s agent --agent-token "[REDACTED]"'],
    ['k3s agent -s https://127.0.0.1:6443 -t synthetic', 'k3s agent -s https://127.0.0.1:6443 -t [REDACTED]'],
  ]) {
    assert.equal(redact(input), expected);
  }
});

test('redacts PEM private-key blocks, including escaped log newlines', () => {
  for (const type of ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'ENCRYPTED PRIVATE KEY']) {
    for (const newline of ['\n', '\\n']) {
      const input = `before -----BEGIN ${type}-----${newline}synthetic${newline}-----END ${type}----- after`;
      assert.equal(redact(input), 'before [REDACTED_PRIVATE_KEY] after');
    }
  }
});

test('redacts kubeconfig key-data while retaining field names and quoting', () => {
  assert.equal(redact('client-key-data: c3ludGhldGlj'), 'client-key-data: [REDACTED]');
  assert.equal(
    redact('{"client-key-data": "c3ludGhldGlj", "name": "ci"}'),
    '{"client-key-data": "[REDACTED]", "name": "ci"}',
  );
});

test('preserves paths, placeholders, public certificates and unrelated diagnostic text', () => {
  const input = [
    'Token saved at /var/lib/rancher/k3s/server/token',
    'k3s agent -s https://127.0.0.1:6443 -t ${NODE_TOKEN}',
    'k3s server --token-file /tmp/token --agent-token-file /tmp/agent',
    'K3S_TOKEN_FILE=/tmp/token K3S_TOKEN=${NODE_TOKEN}',
    'client-key: /tmp/client.key',
    '-----BEGIN CERTIFICATE-----\npublic-data\n-----END CERTIFICATE-----',
    'nodeReady=true listen=127.0.0.1:6443 request=/health?port=8080',
    'unrelated-command -t 30',
  ].join('\n');
  assert.equal(redact(input), input);
});
