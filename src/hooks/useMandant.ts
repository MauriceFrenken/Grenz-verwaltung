import { useEffect, useMemo } from "react";
import { useMandantStore } from "@/store/mandant";
import { useAuthStore } from "@/store/auth";
import { mandantIdsAusBenutzer } from "@/lib/auth";

export function useMandant() {
  const aktiveMandantId = useMandantStore((s) => s.aktiveMandantId);
  const alleMandanten = useMandantStore((s) => s.mandanten);
  const waehleMandant = useMandantStore((s) => s.waehleMandant);
  const benutzer = useAuthStore((s) => s.benutzer);

  const mandanten = useMemo(() => {
    if (!benutzer) return alleMandanten;
    const zugriff = mandantIdsAusBenutzer(benutzer);
    if (zugriff === "*") return alleMandanten;
    return alleMandanten.filter((m) => zugriff.includes(m.id));
  }, [alleMandanten, benutzer]);

  const aktiveMandant =
    mandanten.find((g) => g.id === aktiveMandantId) ?? null;

  const darfAlleMandanten = useMemo(() => {
    if (!benutzer) return true;
    return mandantIdsAusBenutzer(benutzer) === "*";
  }, [benutzer]);

  useEffect(() => {
    if (aktiveMandantId && !mandanten.some((m) => m.id === aktiveMandantId)) {
      waehleMandant(mandanten.length === 1 ? (mandanten[0]?.id ?? null) : null);
    }
  }, [aktiveMandantId, mandanten, waehleMandant]);

  return { aktiveMandantId, aktiveMandant, mandanten, waehleMandant, darfAlleMandanten };
}