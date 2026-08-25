import { useEffect, useMemo } from "react";
import { useGesellschaftStore } from "@/store/gesellschaft";
import { useAuthStore } from "@/store/auth";
import { gesellschaftIdsAusBenutzer } from "@/lib/auth";

export function useGesellschaft() {
  const aktiveGesellschaftId = useGesellschaftStore((s) => s.aktiveGesellschaftId);
  const alleGesellschaften = useGesellschaftStore((s) => s.gesellschaften);
  const waehleGesellschaft = useGesellschaftStore((s) => s.waehleGesellschaft);
  const benutzer = useAuthStore((s) => s.benutzer);

  const gesellschaften = useMemo(() => {
    if (!benutzer) return alleGesellschaften;
    const zugriff = gesellschaftIdsAusBenutzer(benutzer);
    if (zugriff === "*") return alleGesellschaften;
    return alleGesellschaften.filter((m) => zugriff.includes(m.id));
  }, [alleGesellschaften, benutzer]);

  const aktiveGesellschaft =
    gesellschaften.find((g) => g.id === aktiveGesellschaftId) ?? null;

  const darfAlleGesellschaften = useMemo(() => {
    if (!benutzer) return true;
    return gesellschaftIdsAusBenutzer(benutzer) === "*";
  }, [benutzer]);

  useEffect(() => {
    if (aktiveGesellschaftId && !gesellschaften.some((m) => m.id === aktiveGesellschaftId)) {
      waehleGesellschaft(gesellschaften.length === 1 ? (gesellschaften[0]?.id ?? null) : null);
    }
  }, [aktiveGesellschaftId, gesellschaften, waehleGesellschaft]);

  return { aktiveGesellschaftId, aktiveGesellschaft, gesellschaften, waehleGesellschaft, darfAlleGesellschaften };
}