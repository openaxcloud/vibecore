import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { buildCreateTable, columnTypes, type CreateColumn, type CreateColumnType } from './create-table';
import { getDatabaseStudioCopy } from '~/lib/i18n/catalogs/database-studio';

export interface CreateTableFormProps {
  projectId: string;
  connectionKey: string;
  onCreated: () => void;
  onCancel: () => void;
}

/** Mount with a project/connection key so an old request cannot refresh a different database. */
export function CreateTableForm({ projectId, connectionKey, onCreated, onCancel }: CreateTableFormProps) {
  const { i18n } = useTranslation();
  const copy = getDatabaseStudioCopy(i18n.resolvedLanguage ?? i18n.language);
  const fetcher = useFetcher<{ ok?: boolean; error?: string; result?: { error?: string; command?: string } }>();
  const id = useId();
  const [schema, setSchema] = useState('public');
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<Array<CreateColumn & { key: number }>>([]);
  const nextKey = useRef(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  const request = useRef<{ busy: boolean; previousData: typeof fetcher.data } | null>(null);
  const disabled = pending || created;

  useEffect(() => {
    const current = request.current;

    if (!current) {
      return;
    }

    if (fetcher.state !== 'idle') {
      current.busy = true;
      return;
    }

    if (!current.busy && fetcher.data === current.previousData) {
      return;
    }

    request.current = null;
    setPending(false);

    if (
      fetcher.data !== current.previousData &&
      fetcher.data?.ok === true &&
      fetcher.data.result?.command === 'CREATE' &&
      !fetcher.data.error &&
      !fetcher.data.result?.error
    ) {
      setCreated(true);
      onCreated();
    } else {
      setError(copy['databaseCreateTable.failed']);
    }
  }, [fetcher.state, fetcher.data, onCreated, copy['databaseCreateTable.failed']]);

  const update = (key: number, patch: Partial<CreateColumn>) =>
    setColumns((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const inputClass =
    'w-full min-w-0 rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary';

  return (
    <form
      className="min-w-0 space-y-3 p-3"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();

        if (request.current || created) {
          return;
        }

        if (!connectionKey) {
          setError(copy['databaseCreateTable.connection']);
          return;
        }

        const result = buildCreateTable({ schema, name, columns });

        if ('errorCode' in result) {
          setError(copy[`databaseCreateTable.errors.${result.errorCode}`]);
          return;
        }

        setError('');
        request.current = { busy: false, previousData: fetcher.data };
        setPending(true);

        try {
          fetcher.submit(
            { intent: 'query', connectionKey, query: result.query },
            {
              method: 'post',
              action: `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`,
            },
          );
        } catch {
          request.current = null;
          setPending(false);
          setError(copy['databaseCreateTable.failed']);
        }
      }}
    >
      <h3 id={`${id}-title`} className="font-medium">
        {copy['databaseCreateTable.title']}
      </h3>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <label className="block">
          {copy['databaseCreateTable.schema']}
          <input className={inputClass} value={schema} onChange={(event) => setSchema(event.target.value)} required />
        </label>
        <label className="block">
          {copy['databaseCreateTable.name']}
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <p className="text-sm text-bolt-elements-textSecondary">{copy['databaseCreateTable.identity']}</p>
        {columns.map((column, index) => (
          <fieldset key={column.key} className="min-w-0 space-y-2 rounded border border-bolt-elements-borderColor p-2">
            <legend className="px-1 text-sm">
              {copy['databaseCreateTable.column']} {index + 1}
            </legend>
            <label className="block">
              {copy['databaseCreateTable.column']}
              <input
                className={inputClass}
                value={column.name}
                onChange={(event) => update(column.key, { name: event.target.value })}
                required
              />
            </label>
            <label className="block">
              {copy['databaseCreateTable.type']}
              <select
                aria-label={copy['databaseCreateTable.type']}
                className={inputClass}
                value={column.type}
                onChange={(event) => update(column.key, { type: event.target.value as CreateColumnType })}
              >
                {columnTypes.map((type) => (
                  <option key={type} value={type}>
                    {copy[`databaseCreateTable.types.${type}`]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={column.required}
                  onChange={(event) => update(column.key, { required: event.target.checked })}
                />
                {copy['databaseCreateTable.required']}
              </label>
              <button
                type="button"
                className="min-h-11 rounded border border-bolt-elements-borderColor px-3"
                aria-label={`${copy['databaseCreateTable.remove']} ${index + 1}`}
                onClick={() => setColumns((items) => items.filter((item) => item.key !== column.key))}
              >
                {copy['databaseCreateTable.remove']}
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="min-h-11 rounded border border-bolt-elements-borderColor px-3"
          onClick={() =>
            setColumns((items) => [...items, { key: nextKey.current++, name: '', type: 'text', required: false }])
          }
        >
          {copy['databaseCreateTable.add']}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="break-words text-sm text-red-500">
          {error}
        </p>
      )}
      {pending && (
        <p role="status">
          {copy['databaseCreateTable.pending']} {copy['databaseCreateTable.waiting']}
        </p>
      )}
      {created && <p role="status">{copy['databaseCreateTable.success']}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={disabled || !connectionKey}
          className="min-h-11 rounded bg-bolt-elements-button-primary-background px-3 text-bolt-elements-button-primary-text disabled:opacity-50"
        >
          {copy['databaseCreateTable.create']}
        </button>
        <button
          type="button"
          disabled={pending}
          className="min-h-11 rounded border border-bolt-elements-borderColor px-3 disabled:opacity-50"
          onClick={onCancel}
        >
          {created ? copy['databaseCreateTable.close'] : copy['databaseCreateTable.cancel']}
        </button>
      </div>
    </form>
  );
}
