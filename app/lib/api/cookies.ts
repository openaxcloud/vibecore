export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      /*
       * Decode the name and value, and join value parts in case it contains '='.
       * A malformed percent sequence in the untrusted Cookie header would otherwise
       * throw URIError out of the handler — fall back to the raw (undecoded) text.
       */
      const safeDecode = (raw: string): string => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      };

      const decodedName = safeDecode(name.trim());
      const decodedValue = safeDecode(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

function safeJsonRecord<T>(value: string | undefined): T {
  if (!value) {
    return {} as T;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    // A malformed cookie value must not crash the request handler.
    return {} as T;
  }
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  return safeJsonRecord<Record<string, string>>(cookies.apiKeys);
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);
  return safeJsonRecord<Record<string, any>>(cookies.providers);
}
