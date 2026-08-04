import { describe, expect, it } from 'vitest';

import {
  IBAN_LENGTH_BY_COUNTRY,
  IBAN_REGISTRY_PROVENANCE,
  REMIX_STATE_ORDER,
  REMIX_STORAGE_POLICIES,
  RemixInvariantError,
  assertRemixTransition,
  detachCredentials,
  ibanChecksumValid,
  ibanSpans,
  luhnValid,
  maskPiiInFiles,
  scanClonedFilesForSecrets,
  scanFilesForPii,
  scrubSecretsFromFiles,
} from './remix-pipeline.js';

describe('remix state machine', () => {
  it('accepts the full normative forward path', () => {
    for (let i = 0; i < REMIX_STATE_ORDER.length - 1; i++) {
      expect(() => assertRemixTransition(REMIX_STATE_ORDER[i], REMIX_STATE_ORDER[i + 1])).not.toThrow();
    }
  });

  it('REJECTS cloning before credentials are detached (I-RMX-2, security)', () => {
    expect(() => assertRemixTransition('SNAPSHOT_PINNED', 'CLONING')).toThrowError(RemixInvariantError);

    try {
      assertRemixTransition('SNAPSHOT_PINNED', 'CLONING');
    } catch (error) {
      expect((error as RemixInvariantError).code).toBe('REMIX_CLONE_BEFORE_DETACH');
    }
  });

  it('rejects skipping a step and going backwards', () => {
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'SCANNING')).toThrowError(/sequential/);
    expect(() => assertRemixTransition('CLONING', 'CREDENTIALS_DETACHED')).toThrowError(RemixInvariantError);
  });

  it('allows FAILED from any non-terminal state but not out of a terminal state', () => {
    expect(() => assertRemixTransition('CLONING', 'FAILED')).not.toThrow();
    expect(() => assertRemixTransition('COMPLETED', 'FAILED')).not.toThrow(); // terminal→FAILED is a no-op-safe early return
    expect(() => assertRemixTransition('COMPLETED', 'INDEXING')).toThrowError(/terminal/);
  });
});

describe('detachCredentials — references only, never values', () => {
  it('reduces secrets and env-vars to sorted, de-duplicated KEYS', () => {
    const detached = detachCredentials(
      [{ key: 'STRIPE_KEY' }, { key: 'DATABASE_URL' }, { key: 'STRIPE_KEY' }],
      [{ key: 'PUBLIC_FLAG' }, { key: 'DATABASE_URL' }],
    );

    expect(detached.secretKeys).toEqual(['DATABASE_URL', 'STRIPE_KEY']);
    expect(detached.envVarKeys).toEqual(['DATABASE_URL', 'PUBLIC_FLAG']);

    // The shape carries no `value`/`valueEncrypted` field at all.
    expect(JSON.stringify(detached)).not.toMatch(/value/i);
  });
});

describe('scanClonedFilesForSecrets — the invariant teeth', () => {
  const secretValue = 'FIXTURE-fake-value-9f8e7d6c5b4a3210';

  it('FINDS a materialized secret value committed into a cloned .env', () => {
    const findings = scanClonedFilesForSecrets(
      [
        { path: 'src/app.ts', content: 'const x = 1;\n' },
        { path: '.env', content: `PORT=3000\nSTRIPE_KEY=${secretValue}\n` },
      ],
      [{ key: 'STRIPE_KEY', value: secretValue }],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: '.env', secretKey: 'STRIPE_KEY', line: 2 });

    // The finding never carries the value itself.
    expect(JSON.stringify(findings)).not.toContain(secretValue);
  });

  it('returns NO findings when the artifact is clean (the proof state)', () => {
    const findings = scanClonedFilesForSecrets(
      [{ path: '.env', content: 'STRIPE_KEY= # detached on remix (reference only)\n' }],
      [{ key: 'STRIPE_KEY', value: secretValue }],
    );
    expect(findings).toEqual([]);
  });

  it('ignores trivially short values and binary files', () => {
    expect(scanClonedFilesForSecrets([{ path: 'a', content: 'ab' }], [{ key: 'K', value: 'ab' }])).toEqual([]);
    expect(
      scanClonedFilesForSecrets(
        [{ path: 'img', content: secretValue, encoding: 'base64' }],
        [{ key: 'K', value: secretValue }],
      ),
    ).toEqual([]);
  });
});

describe('scrubSecretsFromFiles — CLONING strips materialized values', () => {
  const secretValue = 'FIXTURE-fake-token-0011223344556677';

  it('removes the value line, keeps the key as a reference, and re-scan is clean', () => {
    const { files, removed } = scrubSecretsFromFiles(
      [{ path: '.env', content: `API_TOKEN=${secretValue}\nDEBUG=true\n` }],
      [{ key: 'API_TOKEN', value: secretValue }],
    );

    expect(removed).toHaveLength(1);
    expect(files[0].content).toContain('API_TOKEN='); // reference preserved
    expect(files[0].content).not.toContain(secretValue); // value gone
    expect(files[0].content).toContain('DEBUG=true'); // untouched line kept

    // The scrubbed artifact passes the scan — the whole point.
    expect(scanClonedFilesForSecrets(files, [{ key: 'API_TOKEN', value: secretValue }])).toEqual([]);
  });

  it('is a no-op when there are no materialized values', () => {
    const input = [{ path: 'x', content: 'nothing secret here' }];
    const { files, removed } = scrubSecretsFromFiles(input, [{ key: 'K', value: 'unusedLongValue123' }]);
    expect(removed).toEqual([]);
    expect(files).toEqual(input);
  });
});

describe('storage policies', () => {
  it('exposes exactly DETACH / CLONE / SHARE_WITH_CONSENT', () => {
    expect(REMIX_STORAGE_POLICIES).toEqual(['DETACH', 'CLONE', 'SHARE_WITH_CONSENT']);
  });
});

describe('SOURCE_SANITIZED — PII masking (I-RMX-3, P0-V3-05)', () => {
  it('sits between CREDENTIALS_DETACHED and CLONING in the normative order', () => {
    const detachedIdx = REMIX_STATE_ORDER.indexOf('CREDENTIALS_DETACHED');
    expect(REMIX_STATE_ORDER[detachedIdx + 1]).toBe('SOURCE_SANITIZED');
    expect(REMIX_STATE_ORDER[detachedIdx + 2]).toBe('CLONING');
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'SOURCE_SANITIZED')).not.toThrow();
    expect(() => assertRemixTransition('SOURCE_SANITIZED', 'CLONING')).not.toThrow();

    // Skipping sanitization is an illegal transition, like any skipped step.
    expect(() => assertRemixTransition('CREDENTIALS_DETACHED', 'CLONING')).toThrow(RemixInvariantError);
  });

  it('masks a real email but keeps RFC 2606 fixture addresses', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'seed.csv', content: 'jane.doe@acme-corp.fr\nsupport@example.com\nbot@sub.example.org\n' },
    ]);

    expect(files[0].content).toContain('[PII:email masked on remix]');
    expect(files[0].content).not.toContain('jane.doe@acme-corp.fr');
    expect(files[0].content).toContain('support@example.com');
    expect(files[0].content).toContain('bot@sub.example.org');
    expect(masked).toEqual([{ path: 'seed.csv', kind: 'email', line: 1 }]);
  });

  it('masks international phone numbers but never bare digit runs (ids, ports)', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'contacts.txt', content: 'call +33 6 12 34 56 78\nport 5432 id 1720000000000\n' },
    ]);

    expect(files[0].content).toContain('[PII:phone masked on remix]');
    expect(files[0].content).toContain('port 5432 id 1720000000000');
    expect(masked.map((m) => m.kind)).toEqual(['phone']);
  });

  it('masks Luhn-valid card numbers only (the check is the guard against false positives)', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);

    const { files, masked } = maskPiiInFiles([
      { path: 'cards.txt', content: 'ok 4242 4242 4242 4242\nnot-a-card 4242 4242 4242 4241\n' },
    ]);

    expect(files[0].content).toContain('[PII:card masked on remix]');
    expect(files[0].content).toContain('4242 4242 4242 4241'); // fails Luhn — untouched
    expect(masked.map((m) => m.kind)).toEqual(['card']);
  });

  it('masks IBANs and leaves binary files alone', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'pay.txt', content: 'FR76 3000 6000 0112 3456 7890 189\n' },
      { path: 'img.png', content: 'FR76 3000 6000 0112 3456 7890 189', encoding: 'base64' },
    ]);

    expect(files[0].content).toContain('[PII:iban masked on remix]');
    expect(files[1].content).toContain('FR76'); // binary blob — not text-maskable
    expect(masked).toHaveLength(1);
  });

  it('masked output re-scans CLEAN — findings carry kind + location, never the value', () => {
    const dirty = [{ path: 'seed.csv', content: 'jane@acme-corp.fr,+33612345678,4242424242424242\n' }];

    const { files, masked } = maskPiiInFiles(dirty);

    expect(masked.length).toBeGreaterThanOrEqual(3);
    expect(scanFilesForPii(files)).toEqual([]); // the proof state
    expect(JSON.stringify(masked)).not.toContain('jane@acme-corp.fr');
    expect(JSON.stringify(masked)).not.toContain('4242');
  });
});

/*
 * P0-V3-05 réserve #2 — NOMS DE PERSONNES.
 * Avant ce lot, aucun matcher ne couvrait les noms : le clone produit par l'e2e
 * contenait encore « Jane Doe ». Le masquage se fait sur signal STRUCTUREL
 * (clé personnelle, ou colonne CSV `name` accompagnée d'une colonne
 * personnelle), jamais sur de la prose — sinon tout code source y passerait.
 */
describe('person-name masking (I-RMX-3)', () => {
  it('masks the name column of a PERSON csv — name + email + phone', () => {
    const { files, masked } = maskPiiInFiles([
      {
        path: 'seed/customers.csv',
        content:
          'name,email,phone\nJane Doe,jane.doe@acme-corp.fr,+33 6 12 34 56 78\nJean-Pierre Dupont,jp@acme-corp.fr,+33 1 44 55 66 77\n',
      },
    ]);

    expect(files[0].content).not.toContain('Jane Doe');
    expect(files[0].content).not.toContain('Jean-Pierre Dupont');
    expect(files[0].content).toContain('[PII:name masked on remix]');
    expect(masked.filter((m) => m.kind === 'name')).toHaveLength(2);
    expect(scanFilesForPii(files)).toEqual([]);
  });

  it('LEAVES a product catalogue intact — name + price + stock is not a person', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'data/products.csv', content: 'name,price,stock\nDesk Lamp,4200,7\nOak Stool,8900,3\n' },
    ]);

    expect(files[0].content).toContain('Desk Lamp');
    expect(files[0].content).toContain('Oak Stool');
    expect(masked).toEqual([]);
  });

  it('masks explicit person keys in JSON — including single-word values', () => {
    const { files } = maskPiiInFiles([
      {
        path: 'fixtures/user.json',
        content: '{\n  "firstName": "Jane",\n  "lastName": "Doe",\n  "fullName": "Jane Doe",\n  "nom": "Dupont"\n}\n',
      },
    ]);

    expect(files[0].content).not.toContain('Jane');
    expect(files[0].content).not.toContain('Doe');
    expect(files[0].content).not.toContain('Dupont');
  });

  it('does NOT mangle package.json, prose, or UI labels', () => {
    const { files, masked } = maskPiiInFiles([
      { path: 'package.json', content: '{\n  "name": "meridian-storefront",\n  "version": "1.0.0"\n}\n' },
      { path: 'README.md', content: '# Meridian Supply Co. — Storefront\nBuilt with React Router and Vite.\n' },
      { path: 'src/ui.ts', content: 'const displayName = "Dashboard";\nexport const title = "Order Summary";\n' },
    ]);

    expect(files[0].content).toContain('meridian-storefront');
    expect(files[1].content).toContain('Meridian Supply Co.');
    expect(files[1].content).toContain('React Router');
    expect(files[2].content).toContain('Dashboard');
    expect(masked).toEqual([]);
  });

  it('rejects placeholders and non-name values under person keys', () => {
    const { files, masked } = maskPiiInFiles([
      {
        path: 'template.json',
        content:
          '{\n  "firstName": "{{first}}",\n  "lastName": "",\n  "contactName": "admin",\n  "ownerName": "user_1"\n}\n',
      },
    ]);

    expect(files[0].content).toContain('{{first}}');
    expect(files[0].content).toContain('admin');
    expect(masked).toEqual([]);
  });

  /*
   * --------------------------------------------------------------------- *
   * IBAN — refus expert du 2026-08-04 sur la v2 par regex.
   *
   * v1 laissait le groupe terminal en clair (« … 189 »).
   * v2 avalait les données voisines (« ES91 … 1332 EUR » -> « EUR » détruit).
   * v3 lit le code pays et applique la longueur du registre ISO 13616.
   * ---------------------------------------------------------------------
   */
  describe('IBAN — longueur nationale (ISO 13616), pas de regex générique', () => {
    const mask = (content: string) => maskPiiInFiles([{ path: 'x.txt', content }]).files[0].content;

    it("REJEU DU REFUS EXPERT — « ES91 … 1332 EUR » : l'IBAN part, EUR RESTE", () => {
      const out = mask('ES91 2100 0418 4502 0005 1332 EUR');

      expect(out).toBe('[PII:iban masked on remix] EUR');
      expect(out).toContain('EUR');
      expect(out).not.toContain('1332');
    });

    it('ne mange pas la devise adjacente, quelle qu’elle soit', () => {
      expect(mask('FR76 3000 6000 0112 3456 7890 189 EUR')).toBe('[PII:iban masked on remix] EUR');
      expect(mask('GB29 NWBK 6016 1331 9268 19 GBP')).toBe('[PII:iban masked on remix] GBP');
      expect(mask('DE89 3704 0044 0532 0130 00 USD')).toBe('[PII:iban masked on remix] USD');
      expect(mask('NL91 ABNA 0417 1643 00 CHF')).toBe('[PII:iban masked on remix] CHF');
    });

    it('masque intégralement sur 10 formats nationaux (aucun résidu)', () => {
      const ibans = [
        'NO93 8601 1117 947', // 15
        'BE68 5390 0754 7034', // 16
        'NL91 ABNA 0417 1643 00', // 18
        'CH93 0076 2011 6238 5295 7', // 21
        'DE89 3704 0044 0532 0130 00', // 22
        'GB29 NWBK 6016 1331 9268 19', // 22
        'ES91 2100 0418 4502 0005 1332', // 24
        'FR76 3000 6000 0112 3456 7890 189', // 27 — groupe final de 3
        'IT60 X054 2811 1010 0000 0123 456', // 27 — lettre dans le BBAN
        'FR14 2004 1010 0505 0001 3M02 606', // 27 — alphanumérique
      ];

      for (const iban of ibans) {
        expect(mask(iban), iban).toBe('[PII:iban masked on remix]');
      }
    });

    it('respecte la ponctuation et les colonnes CSV', () => {
      expect(mask('iban,currency,amount\nES91 2100 0418 4502 0005 1332,EUR,1200')).toBe(
        'iban,currency,amount\n[PII:iban masked on remix],EUR,1200',
      );
      expect(mask('IBAN\tES91 2100 0418 4502 0005 1332\tEUR')).toBe('IBAN\t[PII:iban masked on remix]\tEUR');
      expect(mask('Compte (ES91 2100 0418 4502 0005 1332).')).toBe('Compte ([PII:iban masked on remix]).');
    });

    it('gère PLUSIEURS IBAN dans la même phrase', () => {
      expect(mask('Virement de ES91 2100 0418 4502 0005 1332 vers NL91 ABNA 0417 1643 00, 50 EUR.')).toBe(
        'Virement de [PII:iban masked on remix] vers [PII:iban masked on remix], 50 EUR.',
      );
    });

    it('gère les espaces INSÉCABLES et la forme COMPACTE', () => {
      expect(mask('ES91\u00A02100\u00A00418\u00A04502\u00A00005\u00A01332 EUR')).toBe('[PII:iban masked on remix] EUR');
      expect(mask('ES912100041845020005133\u202F2 EUR')).toBe('[PII:iban masked on remix] EUR');
      expect(mask('compact: ES9121000418450200051332 fin')).toBe('compact: [PII:iban masked on remix] fin');
    });

    it('NE masque PAS un texte alphanumérique qui ressemble à un IBAN', () => {
      // Bon gabarit, mauvais checksum -> laissé intact (contrepartie déclarée).
      expect(mask('ES91 2100 0418 4502 0005 1333')).toBe('ES91 2100 0418 4502 0005 1333');

      // Code pays inconnu du registre.
      expect(mask('ZZ91 2100 0418 4502 0005 1332')).toBe('ZZ91 2100 0418 4502 0005 1332');

      // Jetons quelconques de la bonne longueur.
      expect(mask('ref ABCD1234EFGH5678IJKL9012 fin')).toBe('ref ABCD1234EFGH5678IJKL9012 fin');
      expect(mask('sha AB12CDEF34567890ABCDEF12')).toBe('sha AB12CDEF34567890ABCDEF12');

      // Chaîne PLUS LONGUE que la longueur nationale -> pas un IBAN.
      expect(mask('ES9121000418450200051332EXTRA')).toBe('ES9121000418450200051332EXTRA');
    });

    it('checksum MOD-97 : accepte les vrais, refuse les altérés', () => {
      expect(ibanChecksumValid('ES9121000418450200051332')).toBe(true);
      expect(ibanChecksumValid('FR7630006000011234567890189')).toBe(true);
      expect(ibanChecksumValid('ES9121000418450200051333')).toBe(false);
      expect(ibanChecksumValid('nawak')).toBe(false);
    });

    it('la table du registre est versionnée et porte sa provenance', () => {
      expect(IBAN_REGISTRY_PROVENANCE).toMatch(/ISO 13616/);
      expect(IBAN_REGISTRY_PROVENANCE).toMatch(/2026-08-04/);
      expect(IBAN_LENGTH_BY_COUNTRY.FR).toBe(27);
      expect(IBAN_LENGTH_BY_COUNTRY.ES).toBe(24);
      expect(IBAN_LENGTH_BY_COUNTRY.NO).toBe(15);
      expect(Object.isFrozen(IBAN_LENGTH_BY_COUNTRY)).toBe(true);
    });

    it('les plages rendues sont celles du texte ORIGINAL', () => {
      const line = 'x ES91 2100 0418 4502 0005 1332 EUR';
      const [span] = ibanSpans(line);

      expect(line.slice(span.start, span.end)).toBe('ES91 2100 0418 4502 0005 1332');
      expect(line.slice(span.end)).toBe(' EUR');
    });
  });

  it('the 5 categories together re-scan CLEAN on one person record', () => {
    const { files, masked } = maskPiiInFiles([
      {
        path: 'seed/people.csv',
        content:
          'name,email,phone,iban,card\nJane Doe,jane.doe@acme-corp.fr,+33 6 12 34 56 78,FR76 3000 6000 0112 3456 7890 189,4242424242424242\n',
      },
    ]);

    const kinds = [...new Set(masked.map((m) => m.kind))].sort();
    expect(kinds).toEqual(['card', 'email', 'iban', 'name', 'phone']);

    for (const secret of ['Jane Doe', 'jane.doe@acme-corp.fr', '+33 6 12 34 56 78', 'FR76', '4242424242424242']) {
      expect(files[0].content, secret).not.toContain(secret);
    }

    expect(scanFilesForPii(files)).toEqual([]);
  });
});
