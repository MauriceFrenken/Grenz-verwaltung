import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatEuro } from "@/lib/format";
import type { MandatListenEintrag } from "@/lib/mandate/daten";

import { MandateBereichReiter } from "./MandateBereichReiter";

const STATUS = [
  "Beauftragung",
  "Einwertung",
  "Akquisition",
  "Gewonnen",
  "Verloren",
];

/** Mandat ruht: letzte Aktivität älter als 30 Tage. */
function ruhtSeit(datum: string | null): boolean {
  return (
    datum != null && Date.now() - new Date(datum).getTime() > 30 * 86_400_000
  );
}

export function MandateListePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [liste, setListe] = useState<MandatListenEintrag[] | null>(null);
  const [status, setStatus] = useState<string>("Beauftragung");
  const [suche, setSuche] = useState("");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { mandateListeFn } = await import("@/lib/mandate/server-fn");
        setListe(
          await mandateListeFn({ data: { supabaseAccessToken: token } }),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Mandate konnten nicht geladen werden.",
        );
        setListe([]);
      }
    })();
  }, [token]);

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (liste ?? []).filter(
      (m) =>
        (!status || m.status === status) &&
        (!s ||
          [m.name, m.objekt, m.ort].some((x) => x?.toLowerCase().includes(s))),
    );
  }, [liste, status, suche]);

  const anzahl = (s: string) =>
    (liste ?? []).filter((m) => m.status === s).length;

  return (
    <>
      <PageHeader
        titel="Mandate & Pipeline"
        beschreibung="Alle Mandate aus Salesforce. Hier entstehen Vermarktungsberichte für Eigentümer."
        reiter={<MandateBereichReiter aktiv="liste" />}
      />
      <PageWrapper>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
            >
              {s} ({anzahl(s)})
            </Button>
          ))}
          <Button
            size="sm"
            variant={status === "" ? "default" : "outline"}
            onClick={() => setStatus("")}
          >
            Alle ({liste?.length ?? 0})
          </Button>
          <Input
            className="ml-auto w-64"
            placeholder="Suche nach Mandat, Objekt, Ort"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>

        {!liste ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : gefiltert.length === 0 ? (
          <p className="text-sm text-text-muted">
            Keine Mandate gefunden. Falls die Liste leer ist: Einstellungen ›
            Integrationen › Salesforce-Sync ausführen.
          </p>
        ) : (
          <div className="overflow-x-auto border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-text-subtle">
                <tr>
                  <th className="px-3 py-2">Mandat</th>
                  <th className="px-3 py-2">Objekt</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Angebotspreis</th>
                  <th className="px-3 py-2 text-right">Provision</th>
                  <th className="px-3 py-2">Beauftragt</th>
                  <th className="px-3 py-2 text-right">Kampagnen</th>
                  <th className="px-3 py-2 text-right">Interessenten</th>
                  <th className="px-3 py-2">Letzte Aktivität</th>
                  <th className="px-3 py-2">Letzter Bericht</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((m) => (
                  <tr
                    key={m.sfId}
                    className="border-t border-hairline hover:bg-surface-muted"
                  >
                    <td className="px-3 py-2">
                      <Link
                        to="/mandate/$sfId"
                        params={{ sfId: m.sfId }}
                        className="font-medium text-heading hover:underline"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {m.objekt ?? "k. A."}
                      {m.ort ? (
                        <span className="text-text-subtle">, {m.ort}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{m.status ?? "k. A."}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.angebotspreis
                        ? formatEuro(m.angebotspreis)
                        : "nicht gepflegt"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.provisionProzent != null
                        ? `${m.provisionProzent.toLocaleString("de-DE")} %`
                        : "k. A."}
                    </td>
                    <td className="px-3 py-2">
                      {m.beauftragtAm ? formatDate(m.beauftragtAm) : "k. A."}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.kampagnen}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.interessenten
                        ? `${m.interessentenOffen} offen / ${m.interessenten}`
                        : "0"}
                    </td>
                    <td
                      className={`px-3 py-2 ${ruhtSeit(m.letzteAktivitaet) ? "text-warn" : ""}`}
                      title={
                        ruhtSeit(m.letzteAktivitaet)
                          ? "Seit über 30 Tagen keine Aktivität in Salesforce"
                          : undefined
                      }
                    >
                      {m.letzteAktivitaet
                        ? formatDate(m.letzteAktivitaet)
                        : "keine"}
                    </td>
                    <td className="px-3 py-2">
                      {m.letzterReport
                        ? formatDate(m.letzterReport)
                        : "noch keiner"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
