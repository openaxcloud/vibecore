import { useState, useEffect, useRef } from 'react';
import { formatPersistenceRuntimeCopy, getPersistenceRuntimeCopy } from '~/lib/i18n/catalogs/persistence-runtime';

/**
 * Hook to initialize and provide access to the IndexedDB database
 */
export function useIndexedDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /*
   * Track the live handle in a ref so the unmount cleanup closes the *actual*
   * connection. The effect runs once with an empty dep array, so a cleanup that
   * closed over the `db` state value would always see the render-0 value (null)
   * and never close the connection, leaking an IndexedDB handle per mount.
   */
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initDB = async () => {
      try {
        setIsLoading(true);

        const request = indexedDB.open('boltDB', 1);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Create object stores if they don't exist
          if (!db.objectStoreNames.contains('chats')) {
            const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
            chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          const database = (event.target as IDBOpenDBRequest).result;

          /*
           * The component unmounted before the async open resolved: close
           * immediately rather than leaking the freshly-opened connection.
           */
          if (cancelled) {
            database.close();
            return;
          }

          dbRef.current = database;
          setDb(database);
          setIsLoading(false);
        };

        request.onerror = (event) => {
          const copy = getPersistenceRuntimeCopy();
          const message = (event.target as IDBOpenDBRequest).error?.message ?? copy['persistence.error.unknown'];

          setError(new Error(formatPersistenceRuntimeCopy(copy['persistence.error.database'], { message })));
          setIsLoading(false);
        };
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error(getPersistenceRuntimeCopy()['persistence.error.databaseInitialization']),
        );
        setIsLoading(false);
      }
    };

    initDB();

    return () => {
      cancelled = true;

      if (dbRef.current) {
        dbRef.current.close();
        dbRef.current = null;
      }
    };
  }, []);

  return { db, isLoading, error };
}
