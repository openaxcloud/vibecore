import { describe, expect, it } from 'vitest';

import {
  formatRemixPiiMetrics,
  OTHER_COUNTRY_LABEL,
  recordIbanMasked,
  recordUnknownIbanCountry,
  resetRemixPiiMetrics,
  shouldLogUnknownIbanCountry,
  snapshotRemixPiiMetrics,
} from './remix-pii-metrics.js';
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

    /*
     * R1/R2 — arbitrage Avi du 2026-08-05 : priorité CONFIDENTIALITÉ. Un IBAN
     * mal tapé reste une donnée bancaire : longueur nationale correcte => on
     * masque, que le checksum soit valide ou non.
     */
    it('R1 — checksum FAUX mais longueur correcte : MASQUÉ QUAND MÊME', () => {
      const bad = 'ES91 2100 0418 4502 0005 1333'; // dernier chiffre altéré

      expect(ibanChecksumValid(bad.replace(/ /g, ''))).toBe(false);
      expect(mask(bad)).toBe('[PII:iban masked on remix]');
      expect(mask(`${bad} EUR`)).toBe('[PII:iban masked on remix] EUR');
    });

    it('R2 — le checksum QUALIFIE seulement : ventilé dans les observations', () => {
      const { observations } = maskPiiInFiles([
        {
          path: 'a.csv',
          content: ['ES91 2100 0418 4502 0005 1332', 'ES91 2100 0418 4502 0005 1333'].join('\n'),
        },
      ]);

      expect(observations.ibanMaskedChecksumValid).toBe(1);
      expect(observations.ibanMaskedChecksumInvalid).toBe(1);
      expect(observations.ibanUnknownCandidates).toEqual([]);
    });

    it('R3 — longueur INCORRECTE pour le pays : AUCUN masquage IBAN', () => {
      /*
       * On assied l'assertion sur l'ABSENCE du marqueur IBAN, pas sur l'égalité
       * de la ligne : un IBAN tronqué peut être une suite de 19 chiffres
       * Luhn-valide, que le matcher CARTE masque alors à bon droit. Les deux
       * détecteurs sont indépendants ; c'est bien la règle IBAN qu'on teste ici.
       */
      const noIban = (line: string) => expect(mask(line), line).not.toContain('[PII:iban masked on remix]');

      noIban('ES91 2100 0418 4502 0005 133'); // 23 — ES en attend 24
      noIban('ES9121000418450200051332X'); // 25 — trop long
      noIban('FR76 3000 6000 0112 3456 7890 18'); // 26 — FR en attend 27
      noIban('GB29 NWBK 6016 1331 9268 1'); // 21 — GB en attend 22

      // Sans chiffres exploitables par Luhn, la ligne reste littéralement intacte.
      expect(mask('GB29 NWBK 6016 1331 9268 1')).toBe('GB29 NWBK 6016 1331 9268 1');
    });

    it('R4 — pays ABSENT du registre : NON masqué, mais SIGNALÉ', () => {
      const line = 'ZZ91 2100 0418 4502 0005 1332';
      const { files, observations } = maskPiiInFiles([{ path: 'a.csv', content: line }]);

      expect(files[0].content).toBe(line);
      expect(observations.ibanUnknownCandidates).toEqual([
        { countryCode: 'ZZ', normalizedLength: 24, decision: 'UNKNOWN_COUNTRY_CODE' },
      ]);
    });

    it('R4 — AUCUN fragment du candidat ne sort : ni corps, ni clé, ni préfixe', () => {
      const iban = 'ZZ91 2100 0418 4502 0005 1332';
      const compact = iban.replace(/ /g, '');
      const { observations } = maskPiiInFiles([{ path: 'a.csv', content: iban }]);
      const [candidate] = observations.ibanUnknownCandidates;

      // La charge utile se limite à des métadonnées non sensibles.
      expect(Object.keys(candidate).sort()).toEqual(['countryCode', 'decision', 'normalizedLength']);
      expect(candidate.decision).toBe('UNKNOWN_COUNTRY_CODE');

      const payload = JSON.stringify(observations);

      /*
       * Ni la valeur complète, ni la forme espacée, ni la clé de contrôle,
       * ni AUCUN préfixe du corps au-delà du code pays.
       */
      expect(payload).not.toContain(compact);
      expect(payload).not.toContain(iban);
      expect(payload).not.toContain('ZZ91');
      expect(payload).not.toContain('91');

      for (let cut = 3; cut <= compact.length; cut += 1) {
        expect(payload, `préfixe de ${cut} caractères`).not.toContain(compact.slice(0, cut));
      }

      // Le code pays SEUL reste (c'est l'information à diagnostiquer).
      expect(candidate.countryCode).toBe('ZZ');
    });

    it('R4 — pas de faux signal sur du bruit court', () => {
      const { observations } = maskPiiInFiles([{ path: 'a.ts', content: 'const ab12 = 3; // xy99 ok' }]);

      expect(observations.ibanUnknownCandidates).toEqual([]);
    });

    it('R4 — définition du candidat plausible : bornes 15-34 et délimitation', () => {
      const tooShort = maskPiiInFiles([{ path: 'a.txt', content: 'ZZ91 2100 0418 45' }]); // 14
      expect(tooShort.observations.ibanUnknownCandidates).toEqual([]);

      const tooLong = maskPiiInFiles([
        { path: 'a.txt', content: `ZZ91${'A'.repeat(31)}` }, // 35
      ]);
      expect(tooLong.observations.ibanUnknownCandidates).toEqual([]);

      const justRight = maskPiiInFiles([{ path: 'a.txt', content: `ZZ91${'A'.repeat(11)}` }]); // 15
      expect(justRight.observations.ibanUnknownCandidates).toHaveLength(1);
      expect(justRight.observations.ibanUnknownCandidates[0].normalizedLength).toBe(15);
    });

    it('R4 — le compteur métrique `unknown_country_code` est incrémenté', () => {
      resetRemixPiiMetrics();

      const { observations } = maskPiiInFiles([
        { path: 'a.csv', content: 'ZZ91 2100 0418 4502 0005 1332\nES91 2100 0418 4502 0005 1333' },
      ]);

      for (const candidate of observations.ibanUnknownCandidates) {
        recordUnknownIbanCountry(candidate.countryCode);
      }

      for (let n = 0; n < observations.ibanMaskedChecksumInvalid; n += 1) {
        recordIbanMasked(false);
      }

      const snapshot = snapshotRemixPiiMetrics();

      expect(snapshot.unknownCountryCode).toEqual({ ZZ: 1 });
      expect(snapshot.ibanMasked.checksumInvalid).toBe(1);
      expect(formatRemixPiiMetrics()).toContain('remix_pii_iban_unknown_country_code{country="ZZ"} 1');
      expect(formatRemixPiiMetrics()).toContain('remix_pii_iban_masked{checksum_valid="false"} 1');

      resetRemixPiiMetrics();
    });

    it('la table du registre est versionnée et porte sa provenance', () => {
      expect(IBAN_REGISTRY_PROVENANCE).toMatch(/ISO 13616/);
      expect(IBAN_REGISTRY_PROVENANCE).toMatch(/2026-08-04/);
      expect(IBAN_LENGTH_BY_COUNTRY.FR).toBe(27);
      expect(IBAN_LENGTH_BY_COUNTRY.ES).toBe(24);
      expect(IBAN_LENGTH_BY_COUNTRY.NO).toBe(15);
      expect(Object.isFrozen(IBAN_LENGTH_BY_COUNTRY)).toBe(true);
    });

    it('GARDE-FOU — la métrique compte TOUT, le log est BORNÉ (échantillonnage)', () => {
      resetRemixPiiMetrics();

      // 5 occurrences du même pays inconnu + 1 d'un second pays.
      const rows = Array.from({ length: 5 }, () => 'ZZ91 2100 0418 4502 0005 1332');
      rows.push('QQ91 2100 0418 4502 0005 1332');

      const { observations } = maskPiiInFiles([{ path: 'seed.csv', content: rows.join('\n') }]);

      // Aucune déduplication : 6 candidats observés.
      expect(observations.ibanUnknownCandidates).toHaveLength(6);

      let logLines = 0;

      for (const candidate of observations.ibanUnknownCandidates) {
        recordUnknownIbanCountry(candidate.countryCode);

        if (shouldLogUnknownIbanCountry(candidate.countryCode)) {
          logLines += 1;
        }
      }

      // LA MÉTRIQUE compte chaque occurrence…
      expect(snapshotRemixPiiMetrics().unknownCountryCode).toEqual({ ZZ: 5, QQ: 1 });

      // …mais le LOG est borné à un exemple par code pays.
      expect(logLines).toBe(2);

      resetRemixPiiMetrics();
    });

    it('GARDE-FOU — la cardinalité des codes journalisés est plafonnée', () => {
      resetRemixPiiMetrics();

      const codes = Array.from({ length: 25 }, (_, n) => `Q${String.fromCharCode(65 + (n % 25))}`);
      const logged = codes.filter((code) => shouldLogUnknownIbanCountry(code)).length;

      expect(logged).toBe(10); // MAX_LOGGED_COUNTRIES

      resetRemixPiiMetrics();
    });

    it('GARDE-FOU — après remise à zéro de la fenêtre, on re-journalise', () => {
      resetRemixPiiMetrics();
      expect(shouldLogUnknownIbanCountry('ZZ')).toBe(true);
      expect(shouldLogUnknownIbanCountry('ZZ')).toBe(false);

      resetRemixPiiMetrics();
      expect(shouldLogUnknownIbanCountry('ZZ')).toBe(true);

      resetRemixPiiMetrics();
    });

    it('GARDE-FOU — la CARDINALITÉ DES MÉTRIQUES est bornée, le total reste exact', () => {
      resetRemixPiiMetrics();

      // 60 codes pays distincts : de quoi faire exploser les séries temporelles.
      const codes: string[] = [];

      for (let a = 0; a < 6; a += 1) {
        for (let b = 0; b < 10; b += 1) {
          codes.push(`${String.fromCharCode(74 + a)}${String.fromCharCode(48 + b)}`);
        }
      }

      for (const code of codes) {
        recordUnknownIbanCountry(code);
      }

      const snapshot = snapshotRemixPiiMetrics();
      const labels = Object.keys(snapshot.unknownCountryCode);

      // Au plus 20 libellés nommés + le fourre-tout.
      expect(labels.length).toBeLessThanOrEqual(21);
      expect(labels).toContain(OTHER_COUNTRY_LABEL);

      // Le TOTAL est préservé : rien n'est perdu, seule la ventilation est bornée.
      const total = Object.values(snapshot.unknownCountryCode).reduce((sum, n) => sum + n, 0);
      expect(total).toBe(codes.length);

      // Le rendu Prometheus ne produit pas plus de séries que de libellés.
      const series = formatRemixPiiMetrics()
        .split('\n')
        .filter((line) => line.startsWith('remix_pii_iban_unknown_country_code'));
      expect(series.length).toBe(labels.length);

      resetRemixPiiMetrics();
    });

    it('MAPPING — les bornes restent celles du texte ORIGINAL malgré la normalisation', () => {
      const cases: Array<{ label: string; line: string; expected: string }> = [
        {
          label: 'espaces ordinaires',
          line: 'solde ES91 2100 0418 4502 0005 1332 EUR',
          expected: 'ES91 2100 0418 4502 0005 1332',
        },
        {
          label: 'espaces INSÉCABLES',
          line: 'solde ES91\u00A02100\u00A00418\u00A04502\u00A00005\u00A01332 EUR',
          expected: 'ES91\u00A02100\u00A00418\u00A04502\u00A00005\u00A01332',
        },
        {
          label: 'forme COMPACTE',
          line: 'solde ES9121000418450200051332 EUR',
          expected: 'ES9121000418450200051332',
        },
        {
          label: 'insécable ÉTROITE mélangée',
          line: 'solde ES91\u202F2100 0418\u202F4502 0005\u202F1332 EUR',
          expected: 'ES91\u202F2100 0418\u202F4502 0005\u202F1332',
        },
      ];

      for (const { label, line, expected } of cases) {
        const [span] = ibanSpans(line);

        // La tranche du texte ORIGINAL redonne exactement le candidat…
        expect(line.slice(span.start, span.end), label).toBe(expected);

        // …et ce qui suit est intact, au caractère près.
        expect(line.slice(span.end), label).toBe(' EUR');

        // …et ce qui précède aussi.
        expect(line.slice(0, span.start), label).toBe('solde ');
      }
    });

    it('MAPPING — plusieurs IBAN sur UNE MÊME LIGNE : bornes distinctes et exactes', () => {
      const line = 'de ES91 2100 0418 4502 0005 1332 vers NL91 ABNA 0417 1643 00, 50 EUR';
      const spans = ibanSpans(line);

      expect(spans).toHaveLength(2);
      expect(line.slice(spans[0].start, spans[0].end)).toBe('ES91 2100 0418 4502 0005 1332');
      expect(line.slice(spans[1].start, spans[1].end)).toBe('NL91 ABNA 0417 1643 00');

      // Les plages ne se chevauchent pas et respectent l'ordre du texte.
      expect(spans[0].end).toBeLessThan(spans[1].start);
      expect(line.slice(spans[1].end)).toBe(', 50 EUR');
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
