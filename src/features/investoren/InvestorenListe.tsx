import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import { INVESTOR_TYPEN } from "@/lib/investoren/bereinigung";
import type { InvestorZeile } from "@/lib/investoren/typen";
import { STATUS_LABEL } from "@/lib/investoren/typen";
import { cn } from "@/lib/utils";

import { InvestorAkteSheet } from "./InvestorAkteSheet";
import { PruefMarke, StatusMarke, volumenText } from "./hilfen";

const HERKUNFT: Record<string, string> = {
  ankaufsprofil: "Ankaufsprofil",
  kampagne: "Kampagne",
  deal: "Deal",
  radar: "Markt-Radar",
  liste: "Externe Liste",
  nur_liste: "Nur Liste, nicht in Salesforce",
};

const BESTAND: [string, string][] = [
  ["sf", "In Salesforce"],
  ["liste", "Nur in Listen"],
];

function Auswahl({
  wert,
  optionen,
  onChange,
  leer,
}: {
  wert: string;
  optionen: [string, string][];
  onChange: (v: string) => void;
  leer: string;
}) {
  return (
    <select
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      value={wert}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{leer}</option>
      {optionen.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function InvestorenListe() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [zeilen, setZeilen] = useState<InvestorZeile[] | null>(null);
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState("");
  const [typ, setTyp] = useState("");
  const [herkunft, setHerkunft] = useState("");
  const [bestand, setBestand] = useState("");
  const [sichtbar, setSichtbar] = useState(300);
  const [nurKriterien, setNurKriterien] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [busy, setBusy] = useState<"aufbau" | "pruefung" | null>(null);

  async function laden() {
    const { investorenLadenFn } = await import("@/lib/investoren/server-fn");
    setZeilen(await investorenLadenFn({ data: { supabaseAccessToken: token } }));
  }

  useEffect(() => {
    if (!token) return;
    laden().catch((e) => toast.error(e instanceof Error ? e.message : "Investoren konnten nicht geladen werden."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function aktion(art: "aufbau" | "pruefung") {
    setBusy(art);
    try {
      const fn = await import("@/lib/investoren/server-fn");
      if (art === "aufbau") {
        const r = await fn.investorenNeuAufbauenFn({ data: { supabaseAccessToken: token } });
        toast.success(`${r.investoren} Investoren abgeleitet, ${r.neueVorschlaege} neue Vorschläge.`);
      } else {
        const r = await fn.pruefungJetztFn({ data: { supabaseAccessToken: token } });
        toast.success(`${r.geprueft} Firmen geprüft, ${r.auffaellig} auffällig.`);
      }
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (zeilen ?? []).filter(
      (z) =>
        (!status || z.status === status) &&
        (!typ || (typ === "-" ? !z.typ : z.typ === typ)) &&
        (!herkunft || z.herkunft === herkunft) &&
        (!bestand || (bestand === "liste") === z.accountSfId.startsWith("quelle:")) &&
        (!nurKriterien || z.nutzungen.length > 0 || z.volumenMin != null || z.volumenMax != null) &&
        (!q ||
          [z.name, z.typ, ...z.nutzungen, ...z.regionenKurz, z.bemerkung]
            .filter(Boolean)
            .some((t) => t!.toLowerCase().includes(q))),
    );
  }, [zeilen, suche, status, typ, herkunft, bestand, nurKriterien]);

  const zahlen = useMemo(() => {
    const z = zeilen ?? [];
    return {
      gesamt: z.length,
      sf: z.filter((x) => !x.accountSfId.startsWith("quelle:")).length,
      aktiv: z.filter((x) => x.status === "aktiv").length,
      ohneTyp: z.filter((x) => !x.typ).length,
      erloschen: z.filter((x) => x.status === "erloschen").length,
      geprueft: z.filter((x) => x.pruefung).length,
    };
  }, [zeilen]);

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-muted">
        <span>
          <strong className="text-heading">{zahlen.gesamt.toLocaleString("de-DE")}</strong> Investoren, davon{" "}
          <strong className="text-heading">{zahlen.sf}</strong> in Salesforce
        </span>
        <span>
          <strong className="text-heading">{zahlen.aktiv}</strong> aktiv
        </span>
        <span>
          <strong className="text-heading">{zahlen.ohneTyp}</strong> ohne Typ
        </span>
        <span>
          <strong className="text-heading">{zahlen.geprueft}</strong> auf Existenz geprüft
        </span>
        {zahlen.erloschen ? (
          <span className="text-bad">
            <strong>{zahlen.erloschen}</strong> erloschen
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void aktion("pruefung")}>
            {busy === "pruefung" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Nächste 5 prüfen
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void aktion("aufbau")}>
            {busy === "aufbau" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Neu ableiten
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Name, Nutzung, Region"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <Auswahl wert={status} onChange={setStatus} leer="Alle Status" optionen={Object.entries(STATUS_LABEL)} />
        <Auswahl
          wert={typ}
          onChange={setTyp}
          leer="Alle Typen"
          optionen={[...INVESTOR_TYPEN.map((t) => [t, t] as [string, string]), ["-", "Ohne Typ"]]}
        />
        <Auswahl wert={bestand} onChange={setBestand} leer="Salesforce und Listen" optionen={BESTAND} />
        <Auswahl wert={herkunft} onChange={setHerkunft} leer="Alle Herkünfte" optionen={Object.entries(HERKUNFT)} />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={nurKriterien} onChange={(e) => setNurKriterien(e.target.checked)} />
          nur mit Kriterien
        </label>
        <span className="text-xs text-text-subtle">{gefiltert.length} angezeigt</span>
      </div>

      {!zeilen ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th className="py-2 pr-3 font-medium">Investor</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Typ</th>
                <th className="py-2 pr-3 font-medium">Nutzung</th>
                <th className="py-2 pr-3 font-medium">Region</th>
                <th className="py-2 pr-3 text-right font-medium">Volumen</th>
                <th className="py-2 pr-3 font-medium">Letzter Kontakt</th>
                <th className="py-2 font-medium">Prüfung</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.slice(0, sichtbar).map((z) => (
                <tr
                  key={z.accountSfId}
                  className="cursor-pointer border-t border-hairline align-top hover:bg-accent-soft"
                  onClick={() => setOffen(z.accountSfId)}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-heading">{z.name}</div>
                    <div className="text-xs text-text-subtle">{HERKUNFT[z.herkunft] ?? z.herkunft}</div>
                  </td>
                  <td className="py-2 pr-3" title={z.statusGrund ?? undefined}>
                    <StatusMarke status={z.status} />
                  </td>
                  <td className={cn("py-2 pr-3", !z.typ && "text-text-subtle")}>{z.typ ?? "k. A."}</td>
                  <td className="py-2 pr-3">{z.nutzungen.join(", ") || "k. A."}</td>
                  <td className="py-2 pr-3">{z.regionenKurz.slice(0, 3).join(", ") || "k. A."}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{volumenText(z.volumenMin, z.volumenMax)}</td>
                  <td className="py-2 pr-3 text-text-subtle">
                    {z.letzterKontaktAm ? formatDate(z.letzterKontaktAm) : "–"}
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
      {zeilen && gefiltert.length > sichtbar ? (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setSichtbar(sichtbar + 300)}>
          Weitere 300 anzeigen ({(gefiltert.length - sichtbar).toLocaleString("de-DE")} übrig)
        </Button>
      ) : null}
      <InvestorAkteSheet accountSfId={offen} onClose={() => setOffen(null)} />
    </section>
  );
}
