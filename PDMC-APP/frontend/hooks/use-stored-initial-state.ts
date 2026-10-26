"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

const serverSnapshot = () => null;

// Lee la fuente externa durante la hidratación sin copiarla en un efecto.
// Las escrituras siguen en los handlers existentes; montar el componente
// nunca reemplaza el contenido guardado. El estado editado tiene prioridad.
export function useStoredInitialState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const subscribe = useCallback((notify: () => void) => {
    const listener = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [key]);
  const getSnapshot = useCallback(() => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const initial = useMemo(() => {
    if (raw === null) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }, [raw, fallback]);
  const [edited, setEdited] = useState<{ value: T } | null>(null);
  const setValue: Dispatch<SetStateAction<T>> = useCallback(action => {
    setEdited(previous => ({ value: typeof action === "function"
      ? (action as (value: T) => T)(previous ? previous.value : initial)
      : action }));
  }, [initial]);
  return [edited ? edited.value : initial, setValue];
}
