import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import type { ColonneDuSchema, TableDuSchema } from './tables-du-schema';
import { getDatabaseStudioCopy } from '~/lib/i18n/catalogs/database-studio';

type Mode = 'value' | 'null' | 'default';

export function hasInsertMetadata(columns: ColonneDuSchema[]): boolean {
  return (
    columns.length > 0 &&
    columns.every((c) => [c.nullable, c.identity, c.generated, c.hasDefault].every((v) => typeof v === 'boolean'))
  );
}
export interface InsertRowFormProps {
  projectId: string;
  connectionKey: string;
  table: TableDuSchema;
  columns: ColonneDuSchema[];
  metadataConfirmed?: boolean;
  metadataLoading?: boolean;
  onInserted: () => void;
  onClose: () => void;
}

/** Parent keys this form by project, connection and qualified table. No SQL is generated here. */
export function InsertRowForm({
  projectId,
  connectionKey,
  table,
  columns,
  metadataConfirmed = true,
  metadataLoading = false,
  onInserted,
  onClose,
}: InsertRowFormProps) {
  const { i18n } = useTranslation();
  const copy = getDatabaseStudioCopy(i18n.resolvedLanguage ?? i18n.language);
  const id = useId();

  const fetcher = useFetcher<{
    ok?: boolean;
    error?: unknown;
    result?: { command?: string; rowCount?: number; error?: unknown };
  }>();
  const [fields, setFields] = useState(() =>
    Object.fromEntries(
      columns
        .filter((c) => !c.identity && !c.generated)
        .map((c) => [c.nom, { mode: (c.hasDefault ? 'default' : 'value') as Mode, value: '' }]),
    ),
  );

  // Derive usable fields during render, so a submit cannot observe stale modes before effects run.
  const reconciledFields = Object.fromEntries(
    columns
      .filter((c) => !c.identity && !c.generated)
      .map((column) => {
        const previous = Object.hasOwn(fields, column.nom) ? fields[column.nom] : undefined;

        const mode: Mode = !previous
          ? column.hasDefault
            ? 'default'
            : 'value'
          : (previous.mode === 'null' && !column.nullable) || (previous.mode === 'default' && !column.hasDefault)
            ? 'value'
            : previous.mode;

        return [column.nom, { mode, value: previous?.value ?? '' }];
      }),
  );

  const metadataSignature = JSON.stringify(columns);
  const lastMetadata = useRef(metadataSignature);
  const [metadataChanged, setMetadataChanged] = useState(false);
  useEffect(() => {
    if (lastMetadata.current === metadataSignature) {
      return;
    }

    lastMetadata.current = metadataSignature;
    setFields(reconciledFields);
    setMetadataChanged(true);
  }, [metadataSignature, reconciledFields]);

  const [pending, setPending] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<{ busy: boolean; previous: typeof fetcher.data } | null>(null);

  const valid =
    !metadataLoading &&
    metadataConfirmed &&
    hasInsertMetadata(columns) &&
    Boolean(table.schema && connectionKey) &&
    columns.every((column) => column.identity || column.generated || Boolean(reconciledFields[column.nom]));
  useEffect(() => {
    const current = request.current;

    if (!current) {
      return;
    }

    if (fetcher.state !== 'idle') {
      current.busy = true;
      return;
    }

    if (!current.busy && current.previous === fetcher.data) {
      return;
    }

    request.current = null;
    setPending(false);

    if (
      fetcher.data !== current.previous &&
      fetcher.data?.ok === true &&
      !fetcher.data.error &&
      !fetcher.data.result?.error &&
      fetcher.data.result?.command === 'INSERT' &&
      fetcher.data.result.rowCount === 1
    ) {
      setInserted(true);
      onInserted();
    } else {
      setFailed(true);
    }
  }, [fetcher.state, fetcher.data, onInserted]);

  const control =
    'w-full min-w-0 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary';

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="min-w-0 space-y-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (!valid || request.current || inserted) {
          return;
        }

        const values = columns
          .filter((c) => !c.identity && !c.generated)
          .map((c) => {
            const field = reconciledFields[c.nom];
            return field.mode === 'value'
              ? { column: c.nom, mode: 'value', value: field.value }
              : { column: c.nom, mode: field.mode };
          });
        request.current = { busy: false, previous: fetcher.data };
        setPending(true);
        setFailed(false);

        try {
          fetcher.submit(
            {
              intent: 'insert-row',
              connectionKey,
              schemaName: table.schema!,
              tableName: table.nom,
              values: JSON.stringify(values),
            },
            { method: 'post', action: `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database` },
          );
        } catch {
          request.current = null;
          setPending(false);
          setFailed(true);
        }
      }}
    >
      <h3 id={`${id}-title`} className="break-words font-medium">
        {copy['databaseInsertRow.title']} — {table.schema}.{table.nom}
      </h3>
      {metadataChanged && <p role="status">{copy['databaseInsertRow.metadataChanged']}</p>}
      {metadataLoading ? (
        <p role="status">{copy['databaseStudio.loadingSchema']}</p>
      ) : (
        !valid && <p role="alert">{copy['databaseInsertRow.unavailable']}</p>
      )}
      <fieldset disabled={pending || inserted || !valid} className="min-w-0 space-y-3">
        {columns.map((column, index) => (
          <div key={column.nom} className="min-w-0 space-y-2 rounded border border-bolt-elements-borderColor p-2">
            <p className="break-words font-medium">
              {column.nom} <span className="text-sm font-normal">({column.type})</span>
            </p>
            {column.identity || column.generated ? (
              <p>{copy['databaseInsertRow.automatic']}</p>
            ) : (
              <>
                <label htmlFor={`${id}-${index}-mode`}>
                  {copy['databaseInsertRow.mode']} — {column.nom}
                </label>
                <select
                  id={`${id}-${index}-mode`}
                  className={control}
                  value={reconciledFields[column.nom]?.mode ?? 'value'}
                  onChange={(event) =>
                    setFields((old) => ({
                      ...old,
                      [column.nom]: { ...reconciledFields[column.nom], mode: event.target.value as Mode },
                    }))
                  }
                >
                  <option value="value">{copy['databaseInsertRow.value']}</option>
                  {column.nullable && <option value="null">{copy['databaseInsertRow.null']}</option>}
                  {column.hasDefault && <option value="default">{copy['databaseInsertRow.default']}</option>}
                </select>
                {reconciledFields[column.nom]?.mode === 'value' && (
                  <label className="block">
                    {copy['databaseInsertRow.value']} — {column.nom}
                    {column.type === 'boolean' ? (
                      <select
                        aria-label={`${copy['databaseInsertRow.value']} — ${column.nom}`}
                        className={control}
                        required
                        value={reconciledFields[column.nom].value}
                        onChange={(event) =>
                          setFields((old) => ({
                            ...old,
                            [column.nom]: { ...reconciledFields[column.nom], value: event.target.value },
                          }))
                        }
                      >
                        <option value="">{copy['databaseInsertRow.chooseBoolean']}</option>
                        <option value="true">{copy['databaseInsertRow.yes']}</option>
                        <option value="false">{copy['databaseInsertRow.no']}</option>
                      </select>
                    ) : (
                      <input
                        aria-label={`${copy['databaseInsertRow.value']} — ${column.nom}`}
                        aria-describedby={
                          ['timestamp with time zone', 'timestamptz'].includes(column.type)
                            ? `${id}-${index}-timezone`
                            : undefined
                        }
                        type={
                          column.type === 'date'
                            ? 'date'
                            : ['timestamp', 'timestamp without time zone'].includes(column.type)
                              ? 'datetime-local'
                              : 'text'
                        }
                        step={['timestamp', 'timestamp without time zone'].includes(column.type) ? 'any' : undefined}
                        inputMode={
                          /^(numeric|decimal|integer|bigint|smallint|real|double precision)(\(|$)/.test(column.type)
                            ? 'decimal'
                            : undefined
                        }
                        className={control}
                        value={reconciledFields[column.nom].value}
                        onChange={(event) =>
                          setFields((old) => ({
                            ...old,
                            [column.nom]: { ...reconciledFields[column.nom], value: event.target.value },
                          }))
                        }
                      />
                    )}
                    {['timestamp with time zone', 'timestamptz'].includes(column.type) && (
                      <span id={`${id}-${index}-timezone`} className="block text-sm">
                        {copy['databaseInsertRow.timezoneHint']}
                      </span>
                    )}
                  </label>
                )}
              </>
            )}
          </div>
        ))}
      </fieldset>
      {failed && <p role="alert">{copy['databaseInsertRow.failed']}</p>}
      {pending && <p role="status">{copy['databaseInsertRow.pending']}</p>}
      {inserted && <p role="status">{copy['databaseInsertRow.success']}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || inserted || !valid}
          className="min-h-11 rounded border border-bolt-elements-borderColor px-3 disabled:opacity-50"
        >
          {copy['databaseInsertRow.submit']}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="min-h-11 rounded border border-bolt-elements-borderColor px-3 disabled:opacity-50"
        >
          {copy[inserted ? 'databaseCreateTable.close' : 'databaseCreateTable.cancel']}
        </button>
      </div>
    </form>
  );
}
