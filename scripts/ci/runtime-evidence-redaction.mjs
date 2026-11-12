/** Defensive filtering for CI artifacts. Never reads credential files. */
export function redactRuntimeEvidence(input, credentials = []) {
  let text = String(input);

  for (const value of credentials) {
    if (typeof value === 'string' && value.length > 0) {
      text = text.replaceAll(value, '[REDACTED]');
    }
  }

  // Keep ordinary startup placeholders and token-file paths useful to operators.
  const redactValue = (_match, prefix, value) => {
    const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : '';
    const unquoted = quote ? value.slice(1, -1) : value;

    if (/^\$(?:\{[A-Z_][A-Z0-9_]*\}|[A-Z_][A-Z0-9_]*)$/i.test(unquoted)) {
      return `${prefix}${value}`;
    }

    return `${prefix}${quote}[REDACTED]${quote}`;
  };

  return text
    .replace(/-----BEGIN ((?:[A-Z]+ )*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bK10[0-9a-f]{64}::[^\s"'<>\\]+/gi, '[REDACTED_K3S_TOKEN]')
    .replace(/(\bK3S_(?:AGENT_)?TOKEN\s*=\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/gi, redactValue)
    .replace(/((?:^|\s)--(?:agent-)?token(?:=|\s+))("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/g, redactValue)
    .replace(/(\bk3s\s+(?:agent|server)\b[^\r\n]*?\s-t(?:=|\s+))("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/g, redactValue)
    .replace(/((?:"client-key-data"|\bclient-key-data)\s*:\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,"'}]+)/gi, redactValue)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/([?&](?:token|ticket|key)=)[^&\s"']+/gi, '$1[REDACTED]');
}
