import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Kennzahlen } from "@/components/board/Layout";
import { StatusBadge } from "@/components/board/Status";
import type { BoardDaten } from "@/lib/db/typen";
import { datum, euro, tagKurz } from "@/lib/format/de";
import { plusTage } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import {
  HORIZONT_TAGE,
  LIQ_KATEGORIE_LABEL,
  tagesSalden,
  type GesellschaftsLiquiditaet,
  type LiquiditaetsAuswertung,
} from "./logik/liquiditaet";

const IST_TAGE = 90;

export function GesellschaftDetail({
  g,
  daten,
  auswertung,
  onSchliessen,
}: {
  g: GesellschaftsLiquiditaet | undefined;
  daten: BoardDaten;
  auswertung: LiquiditaetsAuswertung;
  onSchliessen: () => void;
}) {
  const c = g?.company;
  const stichtag = auswertung.stichtag;
  const konten = daten.bankAccounts.filter((k) => k.companyId === c?.id);
  const ist = c
    ? tagesSalden(
        { bankAccounts: konten, transactions: daten.transactions },
        plusTage(stichtag, -IST_TAGE),
        stichtag,
      )
    : null;
  const istReihe = ist
    ? ([...ist.values()][0]?.map((p, i) => ({
        x: p.datum,
        ist: [...ist.values()].reduce((s, r) => s + r[i].saldo, 0),
      })) ?? [])
    : [];
  const planReihe = c
    ? auswertung.verlauf
        .slice(1, HORIZONT_TAGE + 1)
        .map((p) => ({ x: p.datum, plan: p.saldo[c.id] ?? 0 }))
    : [];
  // Übergang: der Stichtag trägt beide Werte, damit die Linien anschließen
  const diagramm = [
    ...istReihe.map((p, i) =>
      i === istReihe.length - 1 ? { ...p, plan: p.ist } : p,
    ),
    ...planReihe,
  ];
  const kommend = c
    ? auswertung.bewegungen.filter(
        (b) =>
          b.companyId === c.id && b.datum <= plusTage(stichtag, HORIZONT_TAGE),
      )
    : [];
  const ein = kommend
    .filter((b) => b.betrag > 0)
    .reduce((s, b) => s + b.betrag, 0);
  const aus = kommend
    .filter((b) => b.betrag < 0)
    .reduce((s, b) => s + b.betrag, 0);
  const groesste = [...kommend]
    .sort((a, b) => Math.abs(b.betrag) - Math.abs(a.betrag))
    .slice(0, 12)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  return (
    <DetailPanel
      offen={Boolean(g)}
      onSchliessen={onSchliessen}
      breite="lg"
      titel={c?.name ?? ""}
      unterzeile={
        c
          ? `Mindestliquidität ${euro(c.minLiquidity)}${c.separateArea ? " · getrennter Bereich, nicht Teil der freien Gruppenliquidität" : ""}`
          : undefined
      }
      kopfzeile={
        g ? (
          <StatusBadge ampel={g.ampel}>
            {g.ampel === "rot"
              ? "Unterschreitung ≤ 13 W"
              : g.ampel === "gelb"
                ? "Beobachten"
                : "Ausreichend"}
          </StatusBadge>
        ) : null
      }
    >
      {g && c && ist ? (
        <>
          <PanelAbschnitt titel="Kennzahlen">
            <Kennzahlen
              spalten={3}
              eintraege={[
                {
                  label: "Bankbestand heute",
                  wert: euro(g.heute),
                  hervorheben: true,
                },
                { label: "In 13 Wochen", wert: euro(g.in13Wochen) },
                {
                  label: "Tiefpunkt 13 W",
                  wert: `${euro(g.tief13.saldo)} (${datum(g.tief13.datum)})`,
                },
                { label: "Einzahlungen 13 W", wert: euro(ein) },
                { label: "Auszahlungen 13 W", wert: euro(aus) },
                {
                  label: "Tiefpunkt 24 M",
                  wert: `${euro(g.tief24.saldo)} (${datum(g.tief24.datum)})`,
                },
              ]}
            />
          </PanelAbschnitt>

          <PanelAbschnitt
            titel={`Verlauf: ${IST_TAGE} Tage Ist, 13 Wochen Plan`}
          >
            <ZeitreihenDiagramm
              label="Ist- und Plansaldo"
              daten={diagramm}
              xSchluessel="x"
              xFormat={tagKurz}
              hoehe={200}
              kompakt
              referenz={{ wert: c.minLiquidity, label: "Mindestliquidität" }}
              reihen={[
                { schluessel: "ist", label: "Ist", farbe: "var(--text-muted)" },
                {
                  schluessel: "plan",
                  label: "Plan",
                  farbe: "var(--primary)",
                  flaeche: true,
                },
              ]}
            />
          </PanelAbschnitt>

          <PanelAbschnitt titel="Konten">
            <ul className="divide-y divide-hairline rounded-[8px] border border-hairline">
              {konten.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{k.label}</div>
                    <div className="truncate text-xs text-text-muted">
                      {k.bankName} · {k.iban}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {euro(ist.get(k.id)?.at(-1)?.saldo ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </PanelAbschnitt>

          <PanelAbschnitt titel="Größte Zahlungen der nächsten 13 Wochen">
            {groesste.length === 0 ? (
              <p className="text-sm text-text-muted">
                Keine geplanten Zahlungen.
              </p>
            ) : (
              <ul className="divide-y divide-hairline rounded-[8px] border border-hairline">
                {groesste.map((b, i) => (
                  <li
                    key={`${b.quelle}-${b.datum}-${i}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="w-24 shrink-0 tabular-nums text-text-muted">
                      {datum(b.datum)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{b.label}</div>
                      <div className="text-xs text-text-muted">
                        {LIQ_KATEGORIE_LABEL[b.kategorie]}
                        {b.ic ? " · intern" : ""}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums whitespace-nowrap",
                        b.betrag < 0 ? "text-foreground" : "text-ok",
                      )}
                    >
                      {euro(b.betrag)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelAbschnitt>
        </>
      ) : null}
    </DetailPanel>
  );
}
