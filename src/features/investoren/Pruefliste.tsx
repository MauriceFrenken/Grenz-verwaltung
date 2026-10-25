import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { JsonWert, VorschlagZeile } from "@/lib/investoren/typen";
import { FELD_LABEL } from "@/lib/investoren/typen";

const STATUS = [
  ["offen", "Offen"],
  ["uebernommen", "Übernommen, noch nicht in Salesforce"],
  ["zurueckgeschrieben", "In Salesforce geschrieben"],
  ["abgelehnt", "Abgelehnt"],
] as const;

const ART_LABEL: Record<string, string> = {
  feld: "Feld",
  dublette: "Dublette",
  neuer_investor: "Neuer Investor",
  neues_profil: "Neues Ankaufsprofil",
};

function wert(w: JsonWert): string {
  if (w == null) return "leer";
  if (typeof w === "number") return w >= 10_000 ? w.toLocaleString("de-DE") + " €" : w.toLocaleString("de-DE");
  if (typeof w === "string" || typeof w === "boolean") return String(w);
  if (Array.isArray(w)) return w.map(wert).join(", ");
  return Object.entries(w)
    .filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${wert(v)}`)
    .join("; ");
}

/** Prüfliste: Vorschläge sichten, übernehmen oder ablehnen; Übernommenes nach Salesforce schreiben. */
export function Pruefliste() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [status, setStatus] = useState<string>("offen");
  const [art, setArt] = useState("");
  const [zeilen, setZeilen] = useState<VorschlagZeile[] | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [frage, setFrage] = useState(false);

  async function laden() {
    setZeilen(null);
    const { vorschlaegeLadenFn } = await import("@/lib/investoren/server-fn");
    setZeilen(await vorschlaegeLadenFn({ data: { supabaseAccessToken: token, status } }));
    setAuswahl(new Set());
  }

  useEffect(() => {
    if (!token) return;
    laden().catch((e) => toast.error(e instanceof Error ? e.message : "Prüfliste konnte nicht geladen werden."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  const gefiltert = useMemo(
    () => (zeilen ?? []).filter((z) => !art || `${z.art}:${z.feld}` === art),
    [zeilen, art],
  );
  const arten = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of zeilen ?? []) m.set(`${z.art}:${z.feld}`, (m.get(`${z.art}:${z.feld}`) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [zeilen]);

  async function entscheiden(neu: "uebernommen" | "abgelehnt" | "offen") {
    setBusy(true);
    try {
      const { vorschlagEntscheidenFn } = await import("@/lib/investoren/server-fn");
      await vorschlagEntscheidenFn({ data: { supabaseAccessToken: token, ids: [...auswahl], status: neu } });
      toast.success(`${auswahl.size} Vorschläge ${neu === "uebernommen" ? "übernommen" : neu === "abgelehnt" ? "abgelehnt" : "zurückgesetzt"}.`);
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function schreiben() {
    setBusy(true);
    try {
      const { vorschlaegeZurueckschreibenFn } = await import("@/lib/investoren/server-fn");
      const r = await vorschlaegeZurueckschreibenFn({
        data: { supabaseAccessToken: token, ids: [...auswahl].slice(0, 50), bestaetigt: true },
      });
      toast.success(`${r.geschrieben} Änderungen in Salesforce geschrieben.`);
      if (r.fehler.length) toast.error(r.fehler.slice(0, 3).join("\n"));
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schreiben fehlgeschlagen.");
    } finally {
      setBusy(false);
      setFrage(false);
    }
  }

  const alleGewaehlt = gefiltert.length > 0 && gefiltert.every((z) => auswahl.has(z.id));

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <p className="text-sm text-text-muted">
        Jede Korrektur ist hier erst ein Vorschlag mit Beleg. Übernommene Werte gelten sofort in der App. Nach
        Salesforce geht nur, was du ausdrücklich zurückschreibst.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={art} onChange={(e) => setArt(e.target.value)}>
          <option value="">Alle Arten ({zeilen?.length ?? 0})</option>
          {arten.map(([k, n]) => {
            const [a, f] = k.split(":");
            return (
              <option key={k} value={k}>
                {ART_LABEL[a] ?? a}: {FELD_LABEL[f] ?? f} ({n})
              </option>
            );
          })}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          {status !== "uebernommen" && status !== "zurueckgeschrieben" ? (
            <Button size="sm" disabled={!auswahl.size || busy} onClick={() => void entscheiden("uebernommen")}>
              <Check className="h-4 w-4" /> Übernehmen ({auswahl.size})
            </Button>
          ) : null}
          {status === "uebernommen" ? (
            <Button size="sm" disabled={!auswahl.size || busy} onClick={() => setFrage(true)}>
              <Upload className="h-4 w-4" /> In Salesforce schreiben ({Math.min(auswahl.size, 50)})
            </Button>
          ) : null}
          {status !== "abgelehnt" && status !== "zurueckgeschrieben" ? (
            <Button size="sm" variant="outline" disabled={!auswahl.size || busy} onClick={() => void entscheiden("abgelehnt")}>
              <X className="h-4 w-4" /> Ablehnen
            </Button>
          ) : null}
          {status === "abgelehnt" ? (
            <Button size="sm" variant="outline" disabled={!auswahl.size || busy} onClick={() => void entscheiden("offen")}>
              Wieder öffnen
            </Button>
          ) : null}
        </div>
      </div>

      {!zeilen ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={alleGewaehlt}
                    onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(gefiltert.map((z) => z.id)))}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">Investor</th>
                <th className="py-2 pr-3 font-medium">Was</th>
                <th className="py-2 pr-3 font-medium">Bisher</th>
                <th className="py-2 pr-3 font-medium">Vorschlag</th>
                <th className="py-2 pr-3 font-medium">Beleg</th>
                <th className="py-2 font-medium">Ziel</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((z) => (
                <tr key={z.id} className="border-t border-hairline align-top">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={auswahl.has(z.id)}
                      onChange={() => {
                        const n = new Set(auswahl);
                        if (n.has(z.id)) n.delete(z.id);
                        else n.add(z.id);
                        setAuswahl(n);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3 font-medium text-heading">{z.investor ?? "–"}</td>
                  <td className="py-2 pr-3">
                    {ART_LABEL[z.art] ?? z.art}: {FELD_LABEL[z.feld ?? ""] ?? z.feld}
                  </td>
                  <td className="py-2 pr-3 text-text-subtle">{wert(z.alterWert)}</td>
                  <td className="py-2 pr-3">{wert(z.neuerWert)}</td>
                  <td className="max-w-md py-2 pr-3 text-text-muted">{z.beleg}</td>
                  <td className="py-2 text-xs text-text-subtle">
                    {z.ziel === "salesforce" ? `${z.sfObjekt ?? ""}${z.sfFeld ? `.${z.sfFeld}` : ""}` : "nur App"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={frage} onOpenChange={setFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{Math.min(auswahl.size, 50)} Änderungen in Salesforce schreiben?</AlertDialogTitle>
            <AlertDialogDescription>
              Die ausgewählten Werte werden direkt in Salesforce gesetzt (Accounts und Ankaufsprofile). Das lässt sich
              nur dort von Hand rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void schreiben()}>Schreiben</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
