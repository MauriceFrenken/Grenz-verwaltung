import { useEffect, useState } from "react";

/** Aktuelle Uhrzeit, alle 30 Sekunden aktualisiert. Auf dem Server und beim ersten Rendern null (kein Hydrationsfehler). */
export function useJetzt(intervallMs = 30_000): Date | null {
  const [jetzt, setJetzt] = useState<Date | null>(null);
  useEffect(() => {
    setJetzt(new Date());
    const t = window.setInterval(() => setJetzt(new Date()), intervallMs);
    return () => window.clearInterval(t);
  }, [intervallMs]);
  return jetzt;
}
