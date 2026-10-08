import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Kennzahlen, Segmente } from "@/components/board/Layout";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import { LOAN_KIND_LABEL, type BoardDaten } from "@/lib/db/typen";
import { datum, euro, prozent } from "@/lib/format/de";
import { boardRepository } from "@/lib/db/config";
import { cn } from "@/lib/utils";
import { Kontobewegungen } from "./Kontobewegungen";
import type { AbgleichErgebnis } from "./logik/abgleich";
import type { DarlehenStand } from "./logik/auswertung";

const TILGUNG_LABEL = {
  annuitaet: "Annuität",
  ratentilgung: "Ratentilgung",
  endfaellig: "endfällig",
} as const;
const FREQ_LABEL = {
  monatlich: "monatlich",
  quartalsweise: "quartalsweise",
  jaehrlich: "jährlich",
} as const;

export function DarlehenDetail({
  stand,
  abgleich,
  daten,
  stichtag,
  onSchliessen,
}: {
  stand: DarlehenStand | undefined;
  abgleich: AbgleichErgebnis[];
  daten: BoardDaten;
  stichtag: string;
  onSchliessen: () => void;
}) {
  const [planSicht, setPlanSicht] = useState<"kommend" | "alle">("kommend");
  const l = stand?.loan;
  const name = (c: string | null, p: string | null) =>
    daten.companies.find((x) => x.id === c)?.name ??
    daten.parties.find((x) => x.id === p)?.name ??
    "–";
  const objekt = daten.properties.find((p) => p.id === l?.propertyId);
  const plan = stand
    ? planSicht === "kommend"
      ? stand.plan.filter((z) => z.dueDate >= stichtag).slice(0, 12)
      : stand.plan
    : [];

  return (
    <DetailPanel
      offen={Boolean(stand)}
      onSchliessen={onSchliessen}
      breite="lg"
      titel={l ? `${l.id} · ${l.purpose}` : ""}
      unterzeile={
        l
          ? `${name(l.lenderCompanyId, l.lenderPartyId)} → ${name(l.borrowerCompanyId, l.borrowerPartyId)}`
          : undefined
      }
      kopfzeile={
        stand ? (
          <StatusBadge ampel={stand.ampel}>
            {stand.ampel === "gruen"
              ? "Keine Frist ≤ 12 M"
              : `${stand.kritischesEreignis} ${datum(stand.kritischesDatum)}`}
          </StatusBadge>
        ) : null
      }
    >
      {stand && l ? (
        <>
          <PanelAbschnitt titel="Stand">
            <Kennzahlen
              spalten={3}
              eintraege={[
                {
                  label: "Restschuld heute",
                  wert: euro(stand.restschuld),
                  hervorheben: true,
                },
                { label: "Ursprungsbetrag", wert: euro(l.principal) },
                { label: "Getilgt", wert: prozent(stand.getilgtAnteil, 1) },
                { label: "Zinsen lfd. Jahr", wert: euro(stand.zinsenLfdJahr) },
                {
                  label: "Nächste Zahlung",
                  wert: stand.naechsteZahlung
                    ? `${euro(stand.naechsteZahlung.payment)} am ${datum(stand.naechsteZahlung.dueDate)}`
                    : "–",
                },
                {
                  label: "Zinsabgleich 12 M",
                  wert: `${abgleich.filter((a) => a.ampel === "gruen").length} / ${abgleich.filter((a) => a.ampel !== "grau").length} zugeordnet`,
                },
              ]}
            />
          </PanelAbschnitt>
          <PanelAbschnitt titel="Konditionen">
            <Kennzahlen
              spalten={3}
              eintraege={[
                { label: "Art", wert: LOAN_KIND_LABEL[l.kind] },
                { label: "Bank-ID", wert: l.bankRef ?? "–" },
                {
                  label: "Objekt",
                  wert: objekt ? `${objekt.name} (${objekt.id})` : "–",
                },
                { label: "Zinssatz", wert: `${prozent(l.rate)} ${l.rateType}` },
                { label: "Zinsmethode", wert: l.dayCount },
                { label: "Zahlweise", wert: FREQ_LABEL[l.frequency] },
                { label: "Tilgung", wert: TILGUNG_LABEL[l.repayment.kind] },
                {
                  label:
                    l.repayment.kind === "annuitaet"
                      ? "Rate je Periode"
                      : "Tilgung je Periode",
                  wert:
                    l.repayment.kind === "annuitaet"
                      ? euro(l.repayment.installment)
                      : l.repayment.kind === "ratentilgung"
                        ? euro(l.repayment.principalPerPeriod)
                        : "–",
                },
                { label: "Auszahlung", wert: datum(l.disbursementDate) },
                { label: "Zinsbindung bis", wert: datum(l.fixedUntil) },
                {
                  label: "Ende",
                  wert: l.maturityDate ? datum(l.maturityDate) : "unbefristet",
                },
                {
                  label: "Bürgschaft",
                  wert: l.guarantee
                    ? `${l.guarantee.by}, ${euro(l.guarantee.amount)}`
                    : "keine",
                },
              ]}
            />
            {l.oneDriveUrl ? (
              <a
                href={l.oneDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Vertrag in OneDrive öffnen
              </a>
            ) : null}
          </PanelAbschnitt>

          <PanelAbschnitt titel="Zinsabgleich (12 Monate)">
            {abgleich.length === 0 ? (
              <p className="text-sm text-text-muted">
                Keine Soll-Zahlungen im Zeitraum.
              </p>
            ) : (
              <ul className="divide-y divide-hairline border border-hairline">
                {[...abgleich].reverse().map((a) => (
                  <li
                    key={a.soll.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <AmpelPunkt ampel={a.ampel} />
                    <span className="w-24 tabular-nums">
                      {datum(a.soll.dueDate)}
                    </span>
                    <span className="w-28 text-right tabular-nums">
                      {euro(a.soll.amount)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
                      {a.transaction
                        ? `${datum(a.transaction.bookingDate)} · ${euro(-a.transaction.amount)} · ${a.transaction.purpose}`
                        : a.gruende[0]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelAbschnitt>

          {boardRepository().quelle === "live" ? (
            <PanelAbschnitt titel="Kontobewegungen">
              <Kontobewegungen darlehenId={l.id} />
            </PanelAbschnitt>
          ) : null}

          <PanelAbschnitt titel="Zinsplan">
            <div className="mb-2">
              <Segmente
                label="Zinsplan-Ansicht"
                wert={planSicht}
                onChange={setPlanSicht}
                optionen={[
                  { wert: "kommend", label: "Nächste 12" },
                  { wert: "alle", label: `Alle (${stand.plan.length})` },
                ]}
              />
            </div>
            <div className="max-h-[360px] overflow-auto border border-hairline">
              <table className="w-full text-sm tabular-nums">
                <thead className="sticky top-0 bg-elevated">
                  <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                    <th className="h-8 px-3 text-left font-medium">Fällig</th>
                    <th className="px-2 text-right font-medium">Tage</th>
                    <th className="px-2 text-right font-medium">Zins</th>
                    <th className="px-2 text-right font-medium">Tilgung</th>
                    <th className="px-3 text-right font-medium">Rest</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((z) => (
                    <tr
                      key={z.nr}
                      className={cn(
                        "border-b border-hairline last:border-0",
                        z.dueDate < stichtag && "text-text-muted",
                      )}
                    >
                      <td className="h-8 px-3">
                        {datum(z.dueDate)}
                        {z.stub ? (
                          <span
                            className="ml-1.5 text-[11px] text-warn"
                            title="Rumpfperiode"
                          >
                            Rumpf
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 text-right">{z.days}</td>
                      <td className="px-2 text-right">{euro(z.interest)}</td>
                      <td className="px-2 text-right">{euro(z.principal)}</td>
                      <td className="px-3 text-right">
                        {euro(z.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelAbschnitt>
        </>
      ) : null}
    </DetailPanel>
  );
}
