import { appPublicEnglish } from './app-public-copy.js';

/** Reject transaction control before opening a connection. Fail closed on ambiguous quoting. */
export function assertMigrationOwnsNoTransaction(sql: string): void {
  let plain = '';
  let i = 0;

  const refuse = () => {
    throw new Error(appPublicEnglish('MIGRATION_TRANSACTION_CONTROL_REFUSED'));
  };

  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const lineEnd = sql.slice(i + 2).search(/[\r\n]/);
      i = lineEnd < 0 ? sql.length : i + 2 + lineEnd;
      plain += ' ';
    } else if (sql.startsWith('/*', i)) {
      let depth = 1;
      i += 2;

      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith('*/', i)) {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }

      if (depth) {
        refuse();
      }

      plain += ' ';
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];

      let closed = false;

      while (i < sql.length) {
        // Avoid dependence on standard_conforming_strings or E-string escape rules.
        if (sql[i] === '\\') {
          refuse();
        }

        if (sql[i++] === quote) {
          if (sql[i] === quote) {
            i++;
          } else {
            closed = true;
            break;
          }
        }
      }

      if (!closed) {
        refuse();
      }

      plain += ' quoted ';
    } else if (sql[i] === '$') {
      const tag = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];

      if (!tag) {
        refuse();
      }

      const end = sql.indexOf(tag!, i + tag!.length);

      if (end < 0) {
        refuse();
      }

      i = end + tag!.length;
      plain += ' quoted ';
    } else {
      plain += sql[i++];
    }
  }

  for (const statement of plain.split(';')) {
    if (/^\s*(?:BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE)\b/i.test(statement)) {
      refuse();
    }
  }
}
