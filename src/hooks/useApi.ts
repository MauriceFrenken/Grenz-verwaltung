import { useCallback, useEffect, useRef, useState } from "react";
import { NotImplementedError } from "@/lib/errors";

interface State<T> {
  data: T | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: Error | null;
  reload: () => void;
}

// Sehr schlanker Ersatz für useQuery — bewusst ohne TanStack Query.
// Läuft die Stub-API in NotImplementedError, wird kein Fehler angezeigt,
// sondern der EmptyState. Sobald echte Endpunkte verbunden sind, verhält
// sich der Hook wie ein simpler Fetch mit Reload.
export function useApi<T>(loader: () => Promise<T>, deps: readonly unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof NotImplementedError) {
          setData(null);
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  const isEmpty =
    !isLoading &&
    !error &&
    (data === null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === "object" && data !== null && "items" in data && Array.isArray((data as { items: unknown[] }).items) && (data as { items: unknown[] }).items.length === 0));

  return { data, isLoading, isEmpty, error, reload: run };
}