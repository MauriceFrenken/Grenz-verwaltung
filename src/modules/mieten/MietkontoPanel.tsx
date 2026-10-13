import { Info, Unlink } from "lucide-react";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Knopf } from "@/components/board/Knopf";
import { Kennzahlen } from "@/components/board/Layout";
import { Skelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import type { Mietkonto, MonatStatus } from "@/lib/db/mieten";
import { datum, euro, monat } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import {
  kontoHinweis,
  METHODE_LABEL,
  MONAT_LABEL,
  STUFE_AMPEL,
  STUFE_LABEL,
} from "./logik/mieten";
import { useMietenAktionen, useMietzahlungen } from "./useMieten";

const MONAT_AMPEL: Record<MonatStatus, "gruen" | "gelb" | "rot" | "grau"> = {
  bezahlt: "gruen",
  teilweise: "gelb",
  ueberfaellig: "rot",
  noch_nicht_faellig: "grau",
};

/** Mietkonto eines Vertrags: Stand, Monate (Soll/bezahlt) und zugeordnete Zahlungen. */
export function MietkontoPanel({
  konto: k,
  onSchliessen,
}: {
  konto: Mietkonto | null;
  onSchliessen: () => void;
}) {
  const zahlungen = useMietzahlungen(k?.leaseId ?? null);
  const aktionen = useMietenAktionen();
  if (!k) return null;
  const hinweis = kontoHinweis(k);
  return (
    <DetailPanel
      offen={Boolean(k)}
      onSchliessen={onSchliessen}
      titel={k.mieter}
      unterzeile={`${k.objektName} · ${k.einheitId}${k.einheitLage ? ` · ${k.einheitLage}` : ""}`}
      kopfzeile={
        <StatusBadge ampel={STUFE_AMPEL[k.stufe]}>
          {STUFE_LABEL[k.stufe]}
        </StatusBadge>
      }
      breite="lg"
    >
      {hinweis ? (
        <div className="mb-5 flex gap-2.5 rounded-lg border border-hairline bg-surface-muted/60 px-3.5 py-3 text-sm text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-text-muted" />
          {hinweis}
        </div>
      ) : null}

      <PanelAbschnitt titel="Mietkonto">
        <Kennzahlen
          spalten={3}
          eintraege={[
            { label: "Monatssoll (warm)", wert: euro(k.monatssoll) },
            {
              label: k.saldo >= 0 ? "Rückstand" : "Guthaben",
              wert: euro(Math.abs(k.saldo)),
              hervorheben: true,
            },
            {
              label: "Offene Monate",
              wert: k.offeneMonate
                ? `${k.offeneMonate} · seit ${monat(k.aeltesterOffenerMonat)}`
                : "keine",
            },
            { label: "Soll fällig bisher", wert: euro(k.sollFaellig) },
            { label: "Gezahlt", wert: euro(k.gezahlt) },
            { label: "Erfasst ab", wert: monat(k.erfasstAb) },
            {
              label: "Letzte Zahlung",
              wert: k.letzteZahlungAm
                ? `${datum(k.letzteZahlungAm)} · ${euro(k.letzteZahlungBetrag)}`
                : "–",
            },
            {
              label: "Zahler",
              wert: k.iban ?? (k.zahlerBekannt ? "gelernt" : "unbekannt"),
            },
            { label: "Mietbeginn", wert: k.beginn ? datum(k.beginn) : "fehlt" },
          ]}
        />
      </PanelAbschnitt>

      <PanelAbschnitt titel="Monate">
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/60 text-xs text-text-muted">
                <th className="px-3 py-2 text-left font-medium">Monat</th>
                <th className="px-3 py-2 text-left font-medium">Fällig</th>
                <th className="px-3 py-2 text-right font-medium">Soll</th>
                <th className="px-3 py-2 text-right font-medium">Bezahlt</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...k.monate].reverse().map((m) => (
                <tr key={m.monat} className="border-t border-hairline">
                  <td className="px-3 py-1.5">{monat(m.monat)}</td>
                  <td className="ziffern px-3 py-1.5 text-text-muted">
                    {datum(m.faellig)}
                  </td>
                  <td className="ziffern px-3 py-1.5 text-right">
                    {euro(m.soll)}
                    {m.quelle === "manuell" ? (
                      <span className="ml-1 text-[10px] text-text-subtle">
                        korr.
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      "ziffern px-3 py-1.5 text-right",
                      m.offen >= 0.01 && m.status !== "noch_nicht_faellig"
                        ? "text-bad"
                        : "text-foreground",
                    )}
                  >
                    {euro(m.bezahlt)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                      <AmpelPunkt ampel={MONAT_AMPEL[m.status]} />
                      {MONAT_LABEL[m.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelAbschnitt>

      <PanelAbschnitt titel="Zahlungen">
        {zahlungen.isLoading ? (
          <Skelett className="h-24" />
        ) : !zahlungen.data?.length ? (
          <p className="text-sm text-text-muted">
            Noch keine Zahlung zugeordnet.
          </p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
            {zahlungen.data.map((z) => (
              <li
                key={`${z.bankbuchungId}-${z.leaseId}`}
                className="group flex items-start justify-between gap-4 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="ziffern text-text-muted">
                      {datum(z.datum)}
                    </span>
                    <span className="truncate text-foreground">
                      {z.zahler || "–"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-subtle">
                    {METHODE_LABEL[z.methode]}
                    {z.buchungBetrag > z.betrag + 0.005
                      ? ` · Anteil aus ${euro(z.buchungBetrag)}`
                      : ""}
                    {z.zweck ? ` · ${z.zweck}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="ziffern text-sm font-medium text-heading">
                    {euro(z.betrag)}
                  </span>
                  <Knopf
                    variante="geist"
                    groesse="icon-sm"
                    title="Zuordnung lösen (Zahlung geht zurück in die offenen Eingänge)"
                    aria-label="Zuordnung lösen"
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void aktionen.loesen(z.bankbuchungId)}
                  >
                    <Unlink />
                  </Knopf>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelAbschnitt>
    </DetailPanel>
  );
}
