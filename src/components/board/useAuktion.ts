/** Zeit und Bewegung für die Auktionssaal-Bausteine (Auktion.tsx). */
import { useEffect, useRef, useState } from "react";

/** Aktuelle Uhrzeit, minütlich aktualisiert. Auf dem Server und beim ersten Rendern null (kein Hydrationsfehler). */
export function useJetzt(intervallMs = 30_000): Date | null {
  const [jetzt, setJetzt] = useState<Date | null>(null);
  useEffect(() => {
    setJetzt(new Date());
    const t = window.setInterval(() => setJetzt(new Date()), intervallMs);
    return () => window.clearInterval(t);
  }, [intervallMs]);
  return jetzt;
}

function bewegungReduziert(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Zählt einmalig von 0 auf den Zielwert hoch (600 ms). Ohne Bewegung sofort der Zielwert. */
export function useHochzaehlen(ziel: number, dauerMs = 700): number {
  const [wert, setWert] = useState(ziel);
  const erstes = useRef(true);
  useEffect(() => {
    if (!erstes.current || bewegungReduziert() || !Number.isFinite(ziel)) {
      setWert(ziel);
      return;
    }
    erstes.current = false;
    let raf = 0;
    const start = performance.now();
    const schritt = (t: number) => {
      const p = Math.min(1, (t - start) / dauerMs);
      const e = 1 - Math.pow(1 - p, 3);
      setWert(ziel * e);
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [ziel, dauerMs]);
  return wert;
}
