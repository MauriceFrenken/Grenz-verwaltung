import { ExternalLink } from "lucide-react";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Kennzahlen } from "@/components/board/Layout";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import type { BoardDaten, UnitStatus } from "@/lib/db/typen";
import {
  datum,
  dezimal,
  euro,
  euroKompakt,
  flaeche,
  monatKurz,
  prozent,
  relativTage,
} from "@/lib/format/de";
import { cn } from "@/lib/utils";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";
import {
  mietende,
  type KuendigungInfo,
  type MieterhoehungInfo,
  type MietKonto,
} from "./logik/mieten";
import {
  dscrAmpel,
  leerstandAmpel,
  type ObjektKennzahlen,
  type ProjektKennzahlen,
} from "./logik/objekte";

const EINHEIT_STATUS_LABEL: Record<UnitStatus, string> = {
  vermietet: "vermietet",
  leer: "leer",
  sanierung: "Sanierung",
  im_vertrieb: "im Vertrieb",
  reserviert: "reserviert",
  verkauft: "verkauft",
};

function DokumentListe({
  daten,
  refType,
  refId,
}: {
  daten: BoardDaten;
  refType: "property" | "lease";
  refId: string;
}) {
  const docs = daten.documents.filter(
    (d) => d.refType === refType && d.refId === refId,
  );
  if (docs.length === 0)
    return (
      <p className="text-sm text-text-muted">Keine Dokumente verknüpft.</p>
    );
  return (
    <ul className="divide-y divide-hairline border border-hairline">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-24 shrink-0 tabular-nums text-text-muted">
            {datum(d.date)}
          </span>
          <span className="min-w-0 flex-1 truncate">{d.title}</span>
          <a
            href={d.oneDriveUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> OneDrive
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ObjektDetail({
  o,
  projekt,
  daten,
  darlehen,
  konten,
  offen,
  onSchliessen,
  onVertrag,
}: {
  o: ObjektKennzahlen | undefined;
  projekt: ProjektKennzahlen | undefined;
  daten: BoardDaten | undefined;
  darlehen: DarlehenStand[];
  konten: MietKonto[];
  offen: boolean;
  onSchliessen: () => void;
  onVertrag: (leaseId: string) => void;
}) {
  const p = o?.property;
  const firma = daten?.companies.find((c) => c.id === p?.companyId);
  const kontoJeEinheit = new Map(konten.map((k) => [k.lease.unitId, k]));
  const mieter = (tenantId: string) =>
    daten?.tenants.find((t) => t.id === tenantId)?.name ?? "–";

  return (
    <DetailPanel
      offen={offen && Boolean(o)}
      onSchliessen={onSchliessen}
      breite="lg"
      titel={p ? `${p.name} · ${p.id}` : ""}
      unterzeile={
        p
          ? `${p.street}, ${p.zip} ${p.city} · ${firma?.name ?? "–"}`
          : undefined
      }
      kopfzeile={
        o ? (
          <StatusBadge ampel={o.ampel}>
            {p?.strategy === "aufteiler" ? "Aufteiler" : "Bestand"}
          </StatusBadge>
        ) : null
      }
    >
      {o && p && daten ? (
        <>
          <PanelAbschnitt titel="Kennzahlen">
            <Kennzahlen
              spalten={3}
              eintraege={[
                {
                  label: "Soll-Miete / Monat",
                  wert: euro(o.sollMieteMonat),
                  hervorheben: true,
                },
                {
                  label: "Kaltmiete je m²",
                  wert: `${dezimal(o.mieteJeQm, 2)} €`,
                },
                {
                  label: "Leerstand",
                  wert: (
                    <span className="inline-flex items-center gap-1.5">
                      <AmpelPunkt ampel={leerstandAmpel(o.leerstandsquote)} />
                      {prozent(o.leerstandsquote, 1)} ({o.leer.length} WE)
                    </span>
                  ),
                },
                {
                  label: "DSCR",
                  wert: (
                    <span className="inline-flex items-center gap-1.5">
                      <AmpelPunkt ampel={dscrAmpel(o.dscr)} />
                      {o.dscr === null ? "–" : dezimal(o.dscr, 2)}
                    </span>
                  ),
                },
                {
                  label: "LTV",
                  wert: o.ltv === null ? "–" : prozent(o.ltv, 1),
                },
                { label: "Restschuld Bank", wert: euro(o.restschuldBank) },
                { label: "Potenzial / Monat", wert: euro(o.potenzialMonat) },
                { label: "Mietrückstand", wert: euro(o.rueckstand) },
                { label: "Cashflow 12 M", wert: euro(o.cashflow12) },
                { label: "Marktwert", wert: euroKompakt(p.marketValue) },
                {
                  label: "Kaufpreis",
                  wert: `${euroKompakt(p.purchasePrice)} (${datum(p.purchaseDate)})`,
                },
                {
                  label: "Fläche",
                  wert: `${flaeche(o.flaeche)} · Bj. ${p.yearBuilt}`,
                },
              ]}
            />
            {p.oneDriveUrl ? (
              <a
                href={p.oneDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Objektordner in OneDrive
                öffnen
              </a>
            ) : null}
          </PanelAbschnitt>

          {projekt ? (
            <PanelAbschnitt titel="Aufteiler-Projekt">
              <Kennzahlen
                spalten={3}
                eintraege={[
                  {
                    label: "Budget",
                    wert: euro(projekt.project.renovationBudget),
                  },
                  {
                    label: "Budgetverbrauch",
                    wert: `${prozent(projekt.budgetVerbrauch, 0)} bei ${prozent(projekt.zeitFortschritt, 0)} Zeit`,
                  },
                  { label: "Ist-Kosten", wert: euro(projekt.istKosten) },
                  {
                    label: "Erlöse beurkundet",
                    wert: euro(projekt.erloeseIst),
                  },
                  {
                    label: "Erlöse erwartet",
                    wert: euro(projekt.erloesErwartet),
                  },
                  {
                    label: "Marge erwartet",
                    wert: `${euroKompakt(projekt.margeErwartet)} (${prozent(projekt.margeQuote, 1)})`,
                    hervorheben: true,
                  },
                  {
                    label: "Verkaufsstand",
                    wert: `${projekt.verkauft} verkauft · ${projekt.reserviert} reserviert · ${projekt.imVertrieb} im Vertrieb`,
                  },
                  {
                    label: "EK gebunden",
                    wert: euroKompakt(projekt.ekGebunden),
                  },
                  {
                    label: "Finanzierungskosten",
                    wert: euro(projekt.finanzierungskosten),
                  },
                ]}
              />
            </PanelAbschnitt>
          ) : null}

          <PanelAbschnitt titel="Objekt-Cashflow (12 Monate)">
            <ZeitreihenDiagramm
              label="Objekt-Cashflow je Monat"
              daten={o.cashflow as unknown as Record<string, unknown>[]}
              xSchluessel="monat"
              xFormat={(m) => monatKurz(`${m}-01`)}
              hoehe={180}
              kompakt
              reihen={[
                { schluessel: "miete", label: "Miete", farbe: "var(--ok)" },
                {
                  schluessel: "kapitaldienst",
                  label: "Kapitaldienst",
                  farbe: "var(--bad)",
                  gestrichelt: true,
                },
                {
                  schluessel: "cashflow",
                  label: "Cashflow",
                  farbe: "var(--primary)",
                  flaeche: true,
                },
              ]}
            />
            <div className="mt-3 overflow-auto border border-hairline">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                    <th className="h-8 px-3 text-left font-medium">Monat</th>
                    <th className="px-2 text-right font-medium">Miete</th>
                    <th className="px-2 text-right font-medium">Kosten</th>
                    <th className="px-2 text-right font-medium">
                      Kapitaldienst
                    </th>
                    <th className="px-3 text-right font-medium">Cashflow</th>
                  </tr>
                </thead>
                <tbody>
                  {o.cashflow.map((m) => (
                    <tr
                      key={m.monat}
                      className="border-t border-hairline first:border-t-0"
                    >
                      <td className="h-8 px-3">{monatKurz(`${m.monat}-01`)}</td>
                      <td className="px-2 text-right whitespace-nowrap">
                        {euro(m.miete)}
                      </td>
                      <td className="px-2 text-right whitespace-nowrap">
                        {euro(-m.kosten)}
                      </td>
                      <td className="px-2 text-right whitespace-nowrap">
                        {euro(-m.kapitaldienst)}
                      </td>
                      <td
                        className={cn(
                          "px-3 text-right font-medium whitespace-nowrap",
                          m.cashflow < 0 && "text-bad",
                        )}
                      >
                        {euro(m.cashflow)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelAbschnitt>

          <PanelAbschnitt titel={`Einheiten (${o.units.length})`}>
            <ul className="divide-y divide-hairline border border-hairline">
              {o.units.map((u) => {
                const k = kontoJeEinheit.get(u.id);
                const klickbar = Boolean(k);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={!klickbar}
                      onClick={() => k && onVertrag(k.lease.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                        klickbar
                          ? "cursor-pointer hover:bg-surface-muted"
                          : "cursor-default",
                      )}
                    >
                      <AmpelPunkt
                        ampel={
                          k ? k.ampel : u.status === "leer" ? "gelb" : "grau"
                        }
                      />
                      <span className="w-20 shrink-0 font-medium">
                        {u.label}
                      </span>
                      <span className="w-16 shrink-0 text-right tabular-nums text-text-muted">
                        {flaeche(u.area)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {k
                          ? mieter(k.lease.tenantId)
                          : EINHEIT_STATUS_LABEL[u.status]}
                      </span>
                      <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
                        {k
                          ? euro(k.lease.baseRent)
                          : u.salePrice
                            ? euro(u.salePrice)
                            : u.listPrice
                              ? euro(u.listPrice)
                              : "–"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PanelAbschnitt>

          <PanelAbschnitt titel="Darlehen am Objekt">
            {darlehen.length === 0 ? (
              <p className="text-sm text-text-muted">
                Keine Darlehen zugeordnet.
              </p>
            ) : (
              <ul className="divide-y divide-hairline border border-hairline">
                {darlehen.map((s) => (
                  <li
                    key={s.loan.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <AmpelPunkt ampel={s.ampel} />
                    <span className="w-28 shrink-0 font-medium tabular-nums">
                      {s.loan.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-muted">
                      {prozent(s.loan.rate)} · {s.kritischesEreignis ?? "Ende"}{" "}
                      {datum(s.kritischesDatum)}
                    </span>
                    <span className="shrink-0 tabular-nums whitespace-nowrap">
                      {euro(s.restschuld)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelAbschnitt>

          <PanelAbschnitt titel="Dokumente">
            <DokumentListe daten={daten} refType="property" refId={p.id} />
          </PanelAbschnitt>
        </>
      ) : null}
    </DetailPanel>
  );
}

export function MietvertragDetail({
  konto,
  daten,
  erhoehungen,
  kuendigungen,
  stichtag,
  onSchliessen,
}: {
  konto: MietKonto | undefined;
  daten: BoardDaten | undefined;
  erhoehungen: MieterhoehungInfo[];
  kuendigungen: Array<KuendigungInfo & { leaseId: string }>;
  stichtag: string;
  onSchliessen: () => void;
}) {
  const l = konto?.lease;
  const einheit = daten?.units.find((u) => u.id === l?.unitId);
  const objekt = daten?.properties.find((p) => p.id === einheit?.propertyId);
  const mieter = daten?.tenants.find((t) => t.id === l?.tenantId);
  const events = daten?.leaseEvents.filter((e) => e.leaseId === l?.id) ?? [];
  const ende = l ? mietende(l, events) : null;
  const erh = erhoehungen.filter((e) => e.event.leaseId === l?.id);
  const kue = kuendigungen.filter((k) => k.leaseId === l?.id);

  return (
    <DetailPanel
      offen={Boolean(konto)}
      onSchliessen={onSchliessen}
      titel={mieter?.name ?? ""}
      unterzeile={
        einheit && objekt
          ? `${einheit.label} · ${objekt.name} (${objekt.id})`
          : undefined
      }
      kopfzeile={
        konto ? (
          <StatusBadge ampel={konto.ampel}>
            {konto.rueckstand >= 1
              ? `Rückstand ${euro(konto.rueckstand)}`
              : "Konto ausgeglichen"}
          </StatusBadge>
        ) : null
      }
    >
      {konto && l && daten ? (
        <>
          <PanelAbschnitt titel="Vertrag">
            <Kennzahlen
              spalten={2}
              eintraege={[
                {
                  label: "Kaltmiete",
                  wert: euro(l.baseRent),
                  hervorheben: true,
                },
                { label: "Nebenkosten-VZ", wert: euro(l.serviceCharge) },
                { label: "Beginn", wert: datum(l.start) },
                { label: "Ende", wert: ende ? datum(ende) : "unbefristet" },
                { label: "Kaution", wert: euro(l.deposit) },
                {
                  label: "Letzte Erhöhung",
                  wert: l.lastRentIncrease ? datum(l.lastRentIncrease) : "–",
                },
                {
                  label: "Rückstand",
                  wert: `${euro(konto.rueckstand)} (${dezimal(konto.rueckstandMonate, 1)} Monatsmieten)`,
                },
                {
                  label: "Fläche",
                  wert: einheit ? flaeche(einheit.area) : "–",
                },
              ]}
            />
          </PanelAbschnitt>

          {erh.length > 0 || kue.length > 0 ? (
            <PanelAbschnitt titel="Fristen">
              <ul className="space-y-2">
                {erh.map((e) => (
                  <li
                    key={e.event.id}
                    className="rounded-lg border border-hairline px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AmpelPunkt ampel={e.ampel} />
                      <span className="font-medium">
                        Mieterhöhung § 558 BGB
                      </span>
                      <span className="ml-auto text-xs text-text-muted">
                        {e.event.status}
                      </span>
                    </div>
                    <p className="mt-1 text-text-muted">
                      {euro(e.bisherigeMiete)} → {euro(e.neueMiete)} (+
                      {euro(e.mehrProMonat)}) · Zustimmung bis{" "}
                      {datum(e.zustimmungBis)} · wirksam ab {datum(e.wirksamAb)}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {e.hinweis}
                    </p>
                  </li>
                ))}
                {kue.map((k) => (
                  <li
                    key={k.event.id}
                    className="rounded-lg border border-hairline px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AmpelPunkt ampel={k.ampel} />
                      <span className="font-medium">
                        Kündigung durch{" "}
                        {k.event.by === "mieter" ? "Mieter" : "Vermieter"}
                      </span>
                      <span className="ml-auto text-xs text-text-muted">
                        {relativTage(k.tageBisFristende)}
                      </span>
                    </div>
                    <p className="mt-1 text-text-muted">
                      Zugang {datum(k.event.receivedOn)} · Fristende{" "}
                      {datum(k.fristende)} · Auszug {datum(k.auszug)}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Prognose: {k.leerstandTageProg} Tage Leerstand,
                      Mietausfall {euro(k.mietausfallProg)}
                    </p>
                  </li>
                ))}
              </ul>
            </PanelAbschnitt>
          ) : null}

          <PanelAbschnitt titel="Mietkonto (12 Monate)">
            <div className="overflow-auto border border-hairline">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
                    <th className="h-8 px-3 text-left font-medium">Monat</th>
                    <th className="px-2 text-left font-medium">Fällig</th>
                    <th className="px-2 text-right font-medium">Soll</th>
                    <th className="px-2 text-right font-medium">Ist</th>
                    <th className="px-3 text-right font-medium">Differenz</th>
                  </tr>
                </thead>
                <tbody>
                  {[...konto.monate].reverse().map((m) => {
                    const diff = m.ist - m.soll;
                    return (
                      <tr
                        key={m.monat}
                        className="border-t border-hairline first:border-t-0"
                      >
                        <td className="h-8 px-3">
                          {monatKurz(`${m.monat}-01`)}
                        </td>
                        <td className="px-2 text-text-muted">
                          {datum(m.faellig)}
                        </td>
                        <td className="px-2 text-right whitespace-nowrap">
                          {euro(m.soll)}
                        </td>
                        <td className="px-2 text-right whitespace-nowrap">
                          {euro(m.ist)}
                        </td>
                        <td
                          className={cn(
                            "px-3 text-right whitespace-nowrap",
                            diff <= -1
                              ? "font-medium text-bad"
                              : "text-text-muted",
                          )}
                        >
                          {Math.abs(diff) < 1 ? "–" : euro(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mieter ? (
              <p className="mt-2 text-xs text-text-muted">
                Zahler-IBAN: {mieter.iban}
              </p>
            ) : null}
          </PanelAbschnitt>

          <PanelAbschnitt titel="Dokumente">
            <DokumentListe daten={daten} refType="lease" refId={l.id} />
          </PanelAbschnitt>
        </>
      ) : null}
    </DetailPanel>
  );
}
