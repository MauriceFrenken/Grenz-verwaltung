import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Search, X } from "lucide-react";
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
import type { QuelleZeile } from "@/lib/investoren/typen";

import { PruefMarke, volumenText } from "./hilfen";

const QUELLEN = [
  ["", "Alle Listen"],
  ["7plus", "7Plus"],
  ["leadliste", "Leadliste Grenz"],
  ["suchkunden", "Suchkunden"],
  ["recherche", "Recherche 2026"],
] as const;

const PASSUNG = [
  [70, "Passung ab 70"],
  [50, "Passung ab 50"],
  [0, "Alle"],
] as const;

/** Neue Investoren aus den externen Listen, nach Passung zu Grenz sortiert. */
export function ListenInvestoren() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [quelle, setQuelle] = useState("");
  const [minPassung, setMinPassung] = useState(70);
  const [zeilen, setZeilen] = useState<QuelleZeile[] | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [frage, setFrage] = useState(false);

  async function laden() {
    setZeilen(null);
    const { quellenLadenFn } = await import("@/lib/investoren/server-fn");
    setZeilen(await quellenLadenFn({ data: { supabaseAccessToken: token, quelle: quelle || null, minPassung } }));
    setAuswahl(new Set());
  }

  useEffect(() => {
    if (!token) return;
    laden().catch((e) => toast.error(e instanceof Error ? e.message : "Listen konnten nicht geladen werden."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, quelle, minPassung]);

  async function recherchieren() {
    setBusy(true);
    try {
      const { entdeckungJetztFn } = await import("@/lib/investoren/server-fn");
      const r = await entdeckungJetztFn({ data: { supabaseAccessToken: token } });
      toast.success(r.neu ? `${r.neu} neue Investoren gefunden: ${r.firmen.slice(0, 5).join(", ")}` : "Keine neuen Investoren in diesem Suchfeld.");
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function verwerfen() {
    setBusy(true);
    try {
      const { quelleBearbeitenFn } = await import("@/lib/investoren/server-fn");
      await quelleBearbeitenFn({ data: { supabaseAccessToken: token, schluessel: [...auswahl], bearbeitung: "verworfen" } });
      toast.success(`${auswahl.size} Einträge verworfen.`);
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function anlegen() {
    setBusy(true);
    try {
      const { quellenAnlegenFn } = await import("@/lib/investoren/server-fn");
      const r = await quellenAnlegenFn({ data: { supabaseAccessToken: token, schluessel: [...auswahl].slice(0, 25), bestaetigt: true } });
      toast.success(`${r.angelegt} Investoren in Salesforce angelegt.`);
      if (r.fehler.length) toast.error(r.fehler.slice(0, 4).join("\n"));
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Anlegen fehlgeschlagen.");
    } finally {
      setBusy(false);
      setFrage(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <p className="text-sm text-text-muted">
        Investoren aus 7Plus, der Leadliste, den Suchkunden und der laufenden Recherche (zweimal pro Woche neue, 2025/2026 aktive Käufer mit Beleg), die noch nicht in Salesforce sind. Die Passung bewertet
        NRW-Bezug, Wohnen und Wohn-/Geschäftshaus, Volumen 1 bis 20 Mio. € und Erreichbarkeit. Vor dem Anlegen bitte
        die Prüfung abwarten: Insolvente oder gelöschte Firmen legt die App nicht an.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={quelle} onChange={(e) => setQuelle(e.target.value)}>
          {QUELLEN.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={minPassung}
          onChange={(e) => setMinPassung(Number(e.target.value))}
        >
          {PASSUNG.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-subtle">{zeilen?.length ?? "…"} Einträge (höchstens 500)</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void recherchieren()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Neue 2026 aktive recherchieren
          </Button>
          <Button size="sm" disabled={!auswahl.size || busy} onClick={() => setFrage(true)}>
            <Plus className="h-4 w-4" /> In Salesforce anlegen ({Math.min(auswahl.size, 25)})
          </Button>
          <Button size="sm" variant="outline" disabled={!auswahl.size || busy} onClick={() => void verwerfen()}>
            <X className="h-4 w-4" /> Verwerfen
          </Button>
        </div>
      </div>

      {!zeilen ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th className="py-2 pr-3" />
                <th className="py-2 pr-3 text-right font-medium">Passung</th>
                <th className="py-2 pr-3 font-medium">Firma / Person</th>
                <th className="py-2 pr-3 font-medium">Typ</th>
                <th className="py-2 pr-3 font-medium">Nutzung</th>
                <th className="py-2 pr-3 text-right font-medium">Volumen</th>
                <th className="py-2 pr-3 font-medium">Kontakt</th>
                <th className="py-2 font-medium">Prüfung</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.schluessel} className="border-t border-hairline align-top">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={auswahl.has(z.schluessel)}
                      onChange={() => {
                        const n = new Set(auswahl);
                        if (n.has(z.schluessel)) n.delete(z.schluessel);
                        else n.add(z.schluessel);
                        setAuswahl(n);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-heading">{z.passung}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-heading">{z.firma ?? z.person}</div>
                    <div className="text-xs text-text-subtle">
                      {z.quelle}
                      {z.adresse ? ` · ${z.adresse}` : ""}
                      {z.nrwBezug ? " · NRW" : ""}
                    </div>
                    {z.beleg ? (
                      <div className="text-xs text-text-muted">
                        {z.beleg}
                        {z.quelleLink ? (
                          <a className="ml-1 inline-flex items-center text-brand-text hover:underline" href={z.quelleLink} target="_blank" rel="noreferrer">
                            Quelle <ExternalLink className="ml-0.5 h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    {z.objekteInteresse.length ? (
                      <div className="text-xs text-text-muted">Interesse: {z.objekteInteresse.join(", ")}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{z.typ ?? "k. A."}</td>
                  <td className="py-2 pr-3">{z.nutzungen.join(", ") || "k. A."}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{volumenText(z.volumenMin, z.volumenMax)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {z.firma && z.person ? <div>{z.person}</div> : null}
                    <div className="text-text-muted">{z.emails[0] ?? z.telefon ?? "–"}</div>
                  </td>
                  <td className="py-2">
                    <PruefMarke pruefung={z.pruefung} />
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
            <AlertDialogTitle>{Math.min(auswahl.size, 25)} Investoren in Salesforce anlegen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je Eintrag entstehen ein Account (Geschäftsbereich Grenz & Co, Owner Sebastian Grenz), ein Kontakt und,
              wenn Kriterien bekannt sind, ein Ankaufsprofil. Als insolvent oder gelöscht geprüfte Firmen werden
              übersprungen, ebenso Firmen, die Salesforce schon unter gleicher E-Mail, Website oder gleichem Namen kennt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void anlegen()}>Anlegen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
