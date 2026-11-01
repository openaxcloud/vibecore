import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { buildCreateTable, columnTypes, type CreateColumn, type CreateColumnType } from './create-table';

const copies = {
  en: {
    title: 'Create a table',
    schema: 'Schema',
    name: 'Table name',
    column: 'Column name',
    type: 'Type',
    required: 'Required',
    add: 'Add column',
    remove: 'Remove column',
    create: 'Create table',
    cancel: 'Cancel',
    close: 'Close',
    pending: 'Creating table…',
    identity: 'A unique identifier is added automatically.',
    types: {
      text: 'Text',
      integer: 'Whole number',
      numeric: 'Decimal number',
      boolean: 'Yes/no',
      date: 'Date',
      timestamp: 'Date and time',
    },
    success: 'Table created.',
    failed: 'The server did not confirm table creation. Refresh and check the schema before trying again.',
    connection: 'Select a database connection first.',
    waiting: 'Wait for the request to finish before closing. Closing does not undo a creation.',
    errors: {
      identifier: 'Names must contain 1–63 UTF-8 bytes and no control characters.',
      duplicate: 'Column names must be unique.',
      reserved: 'The column name id is reserved for the automatic primary key.',
      type: 'Select a supported column type.',
    },
  },
  fr: {
    title: 'Créer une table',
    schema: 'Schéma',
    name: 'Nom de la table',
    column: 'Nom de la colonne',
    type: 'Type',
    required: 'Obligatoire',
    add: 'Ajouter une colonne',
    remove: 'Retirer la colonne',
    create: 'Créer la table',
    cancel: 'Annuler',
    close: 'Fermer',
    pending: 'Création de la table…',
    identity: 'Un identifiant unique est ajouté automatiquement.',
    types: {
      text: 'Texte',
      integer: 'Nombre entier',
      numeric: 'Nombre décimal',
      boolean: 'Oui/non',
      date: 'Date',
      timestamp: 'Date et heure',
    },
    success: 'Table créée.',
    failed: 'Le serveur n’a pas confirmé la création. Actualisez et vérifiez le schéma avant de réessayer.',
    connection: 'Sélectionnez d’abord une connexion à la base.',
    waiting: 'Attendez la fin de la requête avant de fermer. Fermer n’annule pas une création.',
    errors: {
      identifier: 'Les noms doivent contenir 1 à 63 octets UTF-8, sans caractère de contrôle.',
      duplicate: 'Les noms de colonnes doivent être uniques.',
      reserved: 'Le nom id est réservé à la clé primaire automatique.',
      type: 'Sélectionnez un type de colonne pris en charge.',
    },
  },
};

export interface CreateTableFormProps {
  projectId: string;
  connectionKey: string;
  onCreated: () => void;
  onCancel: () => void;
}

/** Mount with a project/connection key so an old request cannot refresh a different database. */
export function CreateTableForm({ projectId, connectionKey, onCreated, onCancel }: CreateTableFormProps) {
  const { i18n } = useTranslation();
  const copy = copies[(i18n.resolvedLanguage ?? i18n.language).startsWith('fr') ? 'fr' : 'en'];
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
      setError(copy.failed);
    }
  }, [fetcher.state, fetcher.data, onCreated, copy.failed]);

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
          setError(copy.connection);
          return;
        }

        const result = buildCreateTable({ schema, name, columns });

        if ('error' in result) {
          setError(copy.errors[result.error]);
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
          setError(copy.failed);
        }
      }}
    >
      <h3 id={`${id}-title`} className="font-medium">
        {copy.title}
      </h3>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <label className="block">
          {copy.schema}
          <input className={inputClass} value={schema} onChange={(event) => setSchema(event.target.value)} required />
        </label>
        <label className="block">
          {copy.name}
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <p className="text-sm text-bolt-elements-textSecondary">{copy.identity}</p>
        {columns.map((column, index) => (
          <fieldset key={column.key} className="min-w-0 space-y-2 rounded border border-bolt-elements-borderColor p-2">
            <legend className="px-1 text-sm">
              {copy.column} {index + 1}
            </legend>
            <label className="block">
              {copy.column}
              <input
                className={inputClass}
                value={column.name}
                onChange={(event) => update(column.key, { name: event.target.value })}
                required
              />
            </label>
            <label className="block">
              {copy.type}
              <select
                aria-label={copy.type}
                className={inputClass}
                value={column.type}
                onChange={(event) => update(column.key, { type: event.target.value as CreateColumnType })}
              >
                {columnTypes.map((type) => (
                  <option key={type} value={type}>
                    {copy.types[type]}
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
                {copy.required}
              </label>
              <button
                type="button"
                className="min-h-11 rounded border border-bolt-elements-borderColor px-3"
                aria-label={`${copy.remove} ${index + 1}`}
                onClick={() => setColumns((items) => items.filter((item) => item.key !== column.key))}
              >
                {copy.remove}
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
          {copy.add}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="break-words text-sm text-red-500">
          {error}
        </p>
      )}
      {pending && (
        <p role="status">
          {copy.pending} {copy.waiting}
        </p>
      )}
      {created && <p role="status">{copy.success}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={disabled || !connectionKey}
          className="min-h-11 rounded bg-bolt-elements-button-primary-background px-3 text-bolt-elements-button-primary-text disabled:opacity-50"
        >
          {copy.create}
        </button>
        <button
          type="button"
          disabled={pending}
          className="min-h-11 rounded border border-bolt-elements-borderColor px-3 disabled:opacity-50"
          onClick={onCancel}
        >
          {created ? copy.close : copy.cancel}
        </button>
      </div>
    </form>
  );
}
