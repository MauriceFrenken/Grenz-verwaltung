import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import type { InvestorAkte } from "@/lib/investoren/typen";
import { FELD_LABEL } from "@/lib/investoren/typen";

import { PruefMarke, StatusMarke, volumenText } from "./hilfen";

const QUELLE_LABEL: Record<string, string> = {
  aktivitaet: "Salesforce",
  deal: "Deal",
  kampagne: "Kampagne",
  radar: "Markt-Radar",
};

function Feld({ label, wert, herkunft }: { label: string; wert: string; herkunft?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-text-subtle">
        {label}
        {herkunft ? ` · aus ${herkunft === "bemerkung" ? "Bemerkung" : herkunft === "liste" ? "Liste" : herkunft}` : ""}
      </span>
      <span className="text-sm text-heading">{wert}</span>
    </div>
  );
}

/** Investorenakte: Kriterien, Prüfung, Kontakte, Zeitachse und offene Vorschläge. */
export function InvestorAkteSheet({ accountSfId, onClose }: { accountSfId: string | null; onClose: () => void }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [akte, setAkte] = useState<InvestorAkte | null>(null);

  useEffect(() => {
    if (!accountSfId || !token) return;
    setAkte(null);
    void (async () => {
      try {
        const { investorAkteFn } = await import("@/lib/investoren/server-fn");
        setAkte(await investorAkteFn({ data: { supabaseAccessToken: token, accountSfId } }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Akte konnte nicht geladen werden.");
      }
    })();
  }, [accountSfId, token]);

  const i = akte?.investor;
  return (
    <Sheet open={Boolean(accountSfId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {!i ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="flex flex-col gap-5">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {i.name} <StatusMarke status={i.status} />
              </SheetTitle>
              <SheetDescription>{i.statusGrund}</SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3">
              <Feld label="Typ" wert={i.typ ?? "k. A."} herkunft={i.typQuelle ?? undefined} />
              <Feld label="Priorität" wert={i.prioritaet ?? "k. A."} />
              <Feld label="Nutzung" wert={i.nutzungen.join(", ") || "k. A."} herkunft={i.kriterienHerkunft.nutzungen} />
              <Feld label="Objektklasse" wert={i.objektklassen.join(", ") || "k. A."} />
              <Feld label="Volumen" wert={volumenText(i.volumenMin, i.volumenMax)} herkunft={i.kriterienHerkunft.volumen} />
              <Feld
                label="Faktor bis"
                wert={i.faktorMax ? `${i.faktorMax.toLocaleString("de-DE")}-fach` : "k. A."}
                herkunft={i.kriterienHerkunft.faktor_max}
              />
              <Feld label="Einheiten ab" wert={i.einheitenMin?.toString() ?? "k. A."} herkunft={i.kriterienHerkunft.einheiten_min} />
              <Feld label={`Region${i.regionsebene ? ` (${i.regionsebene})` : ""}`} wert={i.regionenKurz.join(", ") || "k. A."} />
            </div>
            {i.bemerkung ? <p className="text-sm text-text-muted">„{i.bemerkung}“</p> : null}

            <div className="flex flex-col gap-1 border-t border-hairline pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Existenz und Ankaufsprofil</span>
              <PruefMarke pruefung={i.pruefung} />
              {i.pruefung?.begruendung ? <p className="text-sm">{i.pruefung.begruendung}</p> : null}
              {i.pruefung?.ankaufsprofilUrl ? (
                <a className="inline-flex items-center gap-1 text-sm text-brand-text hover:underline" href={i.pruefung.ankaufsprofilUrl} target="_blank" rel="noreferrer">
                  Ankaufsprofil auf der Website <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {i.pruefung?.ankaufsprofilKurz ? <p className="text-sm text-text-muted">{i.pruefung.ankaufsprofilKurz}</p> : null}
              {i.pruefung?.letzteAktivitaet ? <p className="text-sm text-text-muted">Zuletzt: {i.pruefung.letzteAktivitaet}</p> : null}
            </div>

            <div className="flex flex-col gap-1 border-t border-hairline pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                Kontakte ({akte.kontakte.length})
              </span>
              {akte.kontakte.map((k) => (
                <span key={k.sfId} className="text-sm">
                  {k.name}
                  {k.email ? ` · ${k.email}` : ""}
                  {k.telefon ? ` · ${k.telefon}` : ""}
                </span>
              ))}
            </div>

            {akte.listen.length ? (
              <div className="flex flex-col gap-1 border-t border-hairline pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">In externen Listen</span>
                {akte.listen.map((l, n) => (
                  <span key={n} className="text-sm">
                    {l.quelle}: {l.nutzungen.join(", ") || "–"}, {volumenText(l.volumenMin, l.volumenMax)}
                    {l.objekteInteresse.length ? ` · Interesse an ${l.objekteInteresse.join(", ")}` : ""}
                  </span>
                ))}
              </div>
            ) : null}

            {akte.vorschlaege.filter((v) => v.status === "offen").length ? (
              <div className="flex flex-col gap-1 border-t border-hairline pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Offene Vorschläge</span>
                {akte.vorschlaege
                  .filter((v) => v.status === "offen")
                  .map((v) => (
                    <span key={v.id} className="text-sm">
                      {FELD_LABEL[v.feld ?? ""] ?? v.feld}: {JSON.stringify(v.neuerWert)} · {v.beleg}
                    </span>
                  ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-1 border-t border-hairline pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                Zeitachse ({akte.ereignisse.length})
              </span>
              <ul className="flex flex-col">
                {akte.ereignisse.map((e, n) => (
                  <li key={n} className="flex gap-3 border-t border-hairline py-1.5 text-sm first:border-t-0">
                    <span className="w-20 shrink-0 tabular-nums text-text-subtle">{e.am ? formatDate(e.am) : "–"}</span>
                    <span className="w-24 shrink-0 text-text-muted">{QUELLE_LABEL[e.quelle] ?? e.quelle}</span>
                    <span className="min-w-0 flex-1">
                      {e.titel ?? "–"}
                      {e.art ? <span className="text-text-subtle"> · {e.art}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
