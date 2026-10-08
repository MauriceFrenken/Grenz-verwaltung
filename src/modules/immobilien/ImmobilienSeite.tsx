import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Building2, CalendarClock } from "lucide-react";
import { useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import {
  Abschnitt,
  Karte,
  BuehnenKennzahl,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { StatusBadge } from "@/components/board/Status";
import {
  datum,
  dezimal,
  euro,
  euroKompakt,
  flaeche,
  prozent,
  relativTage,
} from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { useDarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import {
  useBoardDaten,
  useGesellschaftsFilter,
  useNachschlagen,
} from "@/modules/shell/daten";
import {
  dscrAmpel,
  leerstandAmpel,
  type ObjektKennzahlen,
  type ProjektKennzahlen,
} from "./logik/objekte";
import type { MietKonto } from "./logik/mieten";
import { MietvertragDetail, ObjektDetail } from "./ObjektDetail";
import { useImmobilienAuswertung } from "./useImmobilien";

type Reiter = "objekte" | "mieter" | "fristen" | "aufteiler";

export function ImmobilienSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const darlehen = useDarlehenAuswertung(data);
  const a = useImmobilienAuswertung(data, darlehen);
  const n = useNachschlagen(data);
  const filter = useGesellschaftsFilter();
  const search = useSearch({ from: "/board/immobilien" });
  const navigate = useNavigate({ from: "/board/immobilien" });
  const [reiter, setReiter] = useState<Reiter>("objekte");

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data || !a || !darlehen) return <SeitenSkelett />;

  const stichtag = data.stichtag;
  const objekte = a.objekte.filter((o) => filter.passt(o.property.companyId));
  const bestand = objekte.filter((o) => o.property.strategy === "bestand");
  const projekte = a.projekte.filter((p) => filter.passt(p.property.companyId));
  const propIds = new Set(objekte.map((o) => o.property.id));
  const unitProp = (unitId: string) => n.units.get(unitId)?.propertyId ?? "";
  const konten = a.mietKonten.filter((k) =>
    propIds.has(unitProp(k.lease.unitId)),
  );
  const leaseProp = (leaseId: string) =>
    unitProp(data.leases.find((l) => l.id === leaseId)?.unitId ?? "");
  const erhoehungen = a.erhoehungen.filter((e) =>
    propIds.has(leaseProp(e.event.leaseId)),
  );
  const kuendigungen = a.kuendigungen.filter((k) =>
    propIds.has(leaseProp(k.leaseId)),
  );

  const sollMiete = bestand.reduce((s, o) => s + o.sollMieteMonat, 0);
  const vermietbar = bestand.reduce((s, o) => s + o.vermietbar, 0);
  const leerFlaeche = bestand.reduce(
    (s, o) => s + o.leer.reduce((x, u) => x + u.area, 0),
    0,
  );
  const leerQuote = vermietbar ? leerFlaeche / vermietbar : 0;
  const rueckstand = konten.reduce((s, k) => s + k.rueckstand, 0);
  const imRueckstand = konten.filter((k) => k.ampel !== "gruen");
  const potenzial = bestand.reduce((s, o) => s + o.potenzialMonat, 0);
  const fristen = [
    ...erhoehungen.filter((e) => e.event.status === "offen"),
    ...kuendigungen.filter((k) => k.tageBisFristende >= 0),
  ];

  const oeffneObjekt = (id: string | undefined) =>
    navigate({
      search: { objekt: id, mietvertrag: undefined },
      replace: true,
      resetScroll: false,
    });
  const oeffneVertrag = (id: string | undefined) =>
    navigate({
      search: (s) => ({ ...s, mietvertrag: id }),
      replace: true,
      resetScroll: false,
    });

  const offenesObjekt = search.objekt
    ? a.objekte.find((o) => o.property.id === search.objekt)
    : undefined;
  const offenerVertrag = search.mietvertrag
    ? a.mietKonten.find((k) => k.lease.id === search.mietvertrag)
    : undefined;

  return (
    <>
      <SeitenKopf
        titel="Immobilien"
        unterzeile={`${bestand.length} Bestandsobjekte · ${projekte.length} Aufteiler-Projekte · ${objekte.reduce((s, o) => s + o.units.length, 0)} Einheiten`}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-5">
          <BuehnenKennzahl
            label="Soll-Miete / Monat"
            wert={euroKompakt(sollMiete)}
            hinweis="Bestand, warm"
          />
          <BuehnenKennzahl
            label="Leerstand"
            wert={prozent(leerQuote, 1)}
            hinweis={`${bestand.reduce((s, o) => s + o.leer.length, 0)} Einheiten · ${flaeche(Math.round(leerFlaeche))}`}
            ampel={leerstandAmpel(leerQuote)}
          />
          <BuehnenKennzahl
            label="Mietrückstand"
            wert={euro(rueckstand)}
            hinweis={`${imRueckstand.length} Mieter im Rückstand`}
            ampel={
              imRueckstand.some((k) => k.ampel === "rot")
                ? "rot"
                : imRueckstand.length
                  ? "gelb"
                  : "gruen"
            }
          />
          <BuehnenKennzahl
            label="Erhöhungspotenzial"
            wert={`${euroKompakt(potenzial * 12)} p.a.`}
            hinweis="§ 558 BGB, Kappung 15 %"
          />
          <BuehnenKennzahl
            label="Offene Fristen"
            wert={String(fristen.length)}
            hinweis="Mieterhöhungen und Kündigungen"
            ampel={
              erhoehungen.some((e) => e.ampel === "rot")
                ? "rot"
                : fristen.some((f) => f.ampel === "gelb")
                  ? "gelb"
                  : "grau"
            }
          />
        </div>
      </SeitenKopf>

      <div className="mb-4">
        <Segmente
          label="Ansicht"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "objekte", label: "Bestand" },
            { wert: "mieter", label: "Mieter und Mieten" },
            {
              wert: "fristen",
              label: `Fristen${fristen.length ? ` (${fristen.length})` : ""}`,
            },
            { wert: "aufteiler", label: "Aufteiler" },
          ]}
        />
      </div>

      {reiter === "objekte" ? (
        bestand.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {bestand.map((o) => (
              <ObjektKarte
                key={o.property.id}
                o={o}
                gesellschaft={n.gesellschaftName(o.property.companyId)}
                onClick={() => oeffneObjekt(o.property.id)}
              />
            ))}
          </div>
        ) : (
          <Karte>
            <Leerzustand
              icon={Building2}
              titel="Keine Bestandsobjekte in dieser Gesellschaft"
              text="Gesellschaftsfilter oben auf „Alle Gesellschaften“ stellen."
              kompakt
            />
          </Karte>
        )
      ) : null}

      {reiter === "mieter" ? (
        <MieterTabelle
          konten={konten}
          data={data}
          n={n}
          onOeffnen={(k) =>
            navigate({
              search: {
                objekt: unitProp(k.lease.unitId),
                mietvertrag: k.lease.id,
              },
              replace: true,
              resetScroll: false,
            })
          }
        />
      ) : null}

      {reiter === "fristen" ? (
        <>
          <Abschnitt
            titel="Mieterhöhungen nach § 558 BGB"
            beschreibung="Zustimmung bis Ende des zweiten Monats nach Zugang, neue Miete ab dem dritten Monat"
          >
            <DatenTabelle
              label="Mieterhöhungen"
              zeilen={erhoehungen}
              schluessel={(e) => e.event.id}
              onZeileKlick={(e) => oeffneVertrag(e.event.leaseId)}
              startSortierung={{ id: "frist", richtung: "auf" }}
              spalten={[
                {
                  id: "mieter",
                  kopf: "Mieter",
                  zelle: (e) => (
                    <MieterZelle leaseId={e.event.leaseId} data={data} n={n} />
                  ),
                },
                {
                  id: "zugang",
                  kopf: "Zugang",
                  sortierWert: (e) => e.event.receivedOn,
                  zelle: (e) => datum(e.event.receivedOn),
                },
                {
                  id: "frist",
                  kopf: "Zustimmung bis",
                  sortierWert: (e) => e.zustimmungBis,
                  zelle: (e) => (
                    <div>
                      <div>{datum(e.zustimmungBis)}</div>
                      {e.event.status === "offen" ? (
                        <div className="text-xs text-text-subtle">
                          {relativTage(e.tageBisFrist)}
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  id: "wirksam",
                  kopf: "Wirksam ab",
                  sortierWert: (e) => e.wirksamAb,
                  zelle: (e) => datum(e.wirksamAb),
                },
                {
                  id: "miete",
                  kopf: "Kaltmiete neu",
                  ausrichtung: "rechts",
                  sortierWert: (e) => e.neueMiete,
                  zelle: (e) => (
                    <div>
                      <div>{euro(e.neueMiete)}</div>
                      <div className="text-xs text-ok">
                        +{euro(e.mehrProMonat)}
                      </div>
                    </div>
                  ),
                },
                {
                  id: "status",
                  kopf: "Status",
                  sortierWert: (e) =>
                    ({ rot: 0, gelb: 1, grau: 2, gruen: 3 })[e.ampel],
                  zelle: (e) => (
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusBadge ampel={e.ampel}>
                        {
                          {
                            offen: "Offen",
                            zugestimmt: "Zugestimmt",
                            abgelehnt: "Abgelehnt",
                          }[e.event.status]
                        }
                      </StatusBadge>
                      {e.ampel === "rot" || e.ampel === "gelb" ? (
                        <span className="text-xs text-text-muted">
                          {e.hinweis}
                        </span>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </Abschnitt>
          <Abschnitt
            titel="Kündigungen nach § 573c BGB"
            beschreibung={`Leerstandsprognose: Neuvermietung nach 60 Tagen (Annahme)`}
          >
            <DatenTabelle
              label="Kündigungen"
              zeilen={kuendigungen}
              schluessel={(k) => k.event.id}
              onZeileKlick={(k) => oeffneVertrag(k.leaseId)}
              startSortierung={{ id: "frist", richtung: "auf" }}
              leer={
                <Leerzustand
                  icon={CalendarClock}
                  titel="Keine laufenden Kündigungen"
                  kompakt
                />
              }
              spalten={[
                {
                  id: "mieter",
                  kopf: "Mieter",
                  zelle: (k) => (
                    <MieterZelle leaseId={k.leaseId} data={data} n={n} />
                  ),
                },
                {
                  id: "zugang",
                  kopf: "Zugang",
                  sortierWert: (k) => k.event.receivedOn,
                  zelle: (k) => (
                    <div>
                      <div>{datum(k.event.receivedOn)}</div>
                      <div className="text-xs text-text-subtle">
                        durch {k.event.by === "mieter" ? "Mieter" : "Vermieter"}
                      </div>
                    </div>
                  ),
                },
                {
                  id: "frist",
                  kopf: "Fristende",
                  sortierWert: (k) => k.fristende,
                  zelle: (k) => (
                    <div>
                      <div>{datum(k.fristende)}</div>
                      <div className="text-xs text-text-subtle">
                        {relativTage(k.tageBisFristende)}
                      </div>
                    </div>
                  ),
                },
                {
                  id: "leer",
                  kopf: "Leer ab",
                  sortierWert: (k) => k.leerAb,
                  zelle: (k) => datum(k.leerAb),
                },
                {
                  id: "ausfall",
                  kopf: "Mietausfall (Prognose)",
                  ausrichtung: "rechts",
                  sortierWert: (k) => k.mietausfallProg,
                  zelle: (k) => euro(k.mietausfallProg),
                },
                {
                  id: "status",
                  kopf: "",
                  zelle: (k) => (
                    <StatusBadge ampel={k.ampel}>
                      {k.ampel === "gelb"
                        ? "≤ 30 Tage"
                        : k.ampel === "grau"
                          ? "Ausgezogen"
                          : "Geplant"}
                    </StatusBadge>
                  ),
                },
              ]}
            />
          </Abschnitt>
        </>
      ) : null}

      {reiter === "aufteiler" ? (
        projekte.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {projekte.map((p) => (
              <ProjektKarte
                key={p.project.id}
                p={p}
                onClick={() => oeffneObjekt(p.property.id)}
              />
            ))}
          </div>
        ) : (
          <Karte>
            <Leerzustand
              icon={Building2}
              titel="Keine Aufteiler-Projekte in dieser Gesellschaft"
              kompakt
            />
          </Karte>
        )
      ) : null}

      <ObjektDetail
        o={offenesObjekt}
        projekt={a.projekte.find((p) => p.property.id === search.objekt)}
        daten={data}
        darlehen={darlehen.staende.filter(
          (s) => s.loan.propertyId === search.objekt,
        )}
        konten={a.mietKonten}
        offen={Boolean(offenesObjekt) && !offenerVertrag}
        onSchliessen={() => oeffneObjekt(undefined)}
        onVertrag={oeffneVertrag}
      />
      <MietvertragDetail
        konto={offenerVertrag}
        daten={data}
        erhoehungen={a.erhoehungen}
        kuendigungen={a.kuendigungen}
        stichtag={stichtag}
        onSchliessen={() => oeffneVertrag(undefined)}
      />
    </>
  );
}

type N = ReturnType<typeof useNachschlagen>;

function MieterZelle({
  leaseId,
  data,
  n,
}: {
  leaseId: string;
  data: NonNullable<ReturnType<typeof useBoardDaten>["data"]>;
  n: N;
}) {
  const l = data.leases.find((x) => x.id === leaseId);
  const u = l ? n.units.get(l.unitId) : undefined;
  return (
    <div>
      <div className="font-medium text-heading">
        {l ? n.tenants.get(l.tenantId)?.name : "–"}
      </div>
      <div className="text-xs text-text-subtle">
        {u ? `${n.properties.get(u.propertyId)?.name} · ${u.label}` : ""}
      </div>
    </div>
  );
}

function Balken({
  anteil,
  ton = "akzent",
}: {
  anteil: number;
  ton?: "akzent" | "bad" | "warn";
}) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span
        className={cn(
          "block h-full rounded-full",
          ton === "akzent" && "bg-primary",
          ton === "bad" && "bg-bad",
          ton === "warn" && "bg-warn",
        )}
        style={{ width: `${Math.min(100, Math.round(anteil * 100))}%` }}
      />
    </span>
  );
}

function Zahl({
  label,
  wert,
  ton,
}: {
  label: string;
  wert: string;
  ton?: "bad" | "warn" | "ok";
}) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-medium tabular-nums text-heading",
          ton === "bad" && "text-bad",
          ton === "warn" && "text-warn",
          ton === "ok" && "text-ok",
        )}
      >
        {wert}
      </div>
    </div>
  );
}

function ObjektKarte({
  o,
  gesellschaft,
  onClick,
}: {
  o: ObjektKennzahlen;
  gesellschaft: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex cursor-pointer flex-col border border-hairline bg-surface p-5 text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-150 [--board-r:10px] hover:border-input hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-heading">
            {o.property.name}
          </div>
          <div className="truncate text-xs text-text-muted">
            {o.property.id} · {o.property.street}, {o.property.city} ·{" "}
            {gesellschaft}
          </div>
        </div>
        <StatusBadge ampel={o.ampel}>
          {o.ampel === "rot"
            ? "Hinter Plan"
            : o.ampel === "gelb"
              ? "Beobachten"
              : "Im Plan"}
        </StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Zahl label="Soll-Miete / Monat" wert={euro(o.sollMieteMonat)} />
        <Zahl
          label="Cashflow 12 M"
          wert={euro(o.cashflow12)}
          ton={o.cashflow12 < 0 ? "bad" : undefined}
        />
        <Zahl
          label="DSCR"
          wert={o.dscr === null ? "–" : dezimal(o.dscr)}
          ton={dscrAmpel(o.dscr) === "rot" ? "bad" : undefined}
        />
        <Zahl
          label="Leerstand"
          wert={`${prozent(o.leerstandsquote, 1)} · ${o.leer.length} WE`}
          ton={leerstandAmpel(o.leerstandsquote) === "rot" ? "bad" : undefined}
        />
        <Zahl
          label="Miete je m²"
          wert={`${dezimal(o.mieteJeQm)} / ${dezimal(o.property.targetRentPerSqm)} €`}
        />
        <Zahl label="LTV" wert={o.ltv === null ? "–" : prozent(o.ltv, 0)} />
      </div>
      {o.rueckstand > 0 ? (
        <div className="mt-4 bg-bad-soft px-3 py-1.5 text-xs text-bad">
          Mietrückstand {euro(o.rueckstand)}
        </div>
      ) : null}
    </button>
  );
}

function ProjektKarte({
  p,
  onClick,
}: {
  p: ProjektKennzahlen;
  onClick: () => void;
}) {
  const gesamt = p.units.length || 1;
  const segmente = [
    { n: p.verkauft, klasse: "bg-primary", label: "verkauft" },
    { n: p.reserviert, klasse: "bg-primary/55", label: "reserviert" },
    { n: p.imVertrieb, klasse: "bg-primary/25", label: "im Vertrieb" },
    { n: p.inSanierung, klasse: "bg-warn/50", label: "in Sanierung" },
    { n: p.vermietet, klasse: "bg-text-subtle/40", label: "vermietet" },
  ];
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer flex-col border border-hairline bg-surface p-5 text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-150 [--board-r:10px] hover:border-input hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-heading">
            {p.project.name}
          </div>
          <div className="text-xs text-text-muted">
            {p.property.id} · {p.property.city} · Plan-Ende{" "}
            {datum(p.project.plannedEnd)}
          </div>
        </div>
        <StatusBadge ampel={p.ampel}>
          {p.ampel === "rot"
            ? "Handeln"
            : p.ampel === "gelb"
              ? "Beobachten"
              : "Im Plan"}
        </StatusBadge>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-text-muted">
          <span>Verkaufsstand</span>
          <span className="tabular-nums">
            {p.verkauft + p.reserviert} von {p.units.length} verkauft oder
            reserviert
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
          {segmente.map((s) =>
            s.n ? (
              <span
                key={s.label}
                className={s.klasse}
                style={{ width: `${(s.n / gesamt) * 100}%` }}
                title={`${s.n} ${s.label}`}
              />
            ) : null,
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {segmente
            .filter((s) => s.n)
            .map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-full", s.klasse)} /> {s.n}{" "}
                {s.label}
              </span>
            ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-text-muted">
          <span>Sanierungsbudget (Ist + offene Rechnungen)</span>
          <span
            className={cn("tabular-nums", p.budgetVerbrauch > 1 && "text-bad")}
          >
            {prozent(p.budgetVerbrauch, 0)} von{" "}
            {euroKompakt(p.project.renovationBudget)}
          </span>
        </div>
        <Balken
          anteil={p.budgetVerbrauch}
          ton={
            p.budgetVerbrauch > 1.1
              ? "bad"
              : p.budgetVerbrauch > 1
                ? "warn"
                : "akzent"
          }
        />
        <div className="mt-1 text-[11px] text-text-subtle">
          Zeit: {prozent(p.zeitFortschritt, 0)} der Projektlaufzeit
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        <Zahl label="Erlöse Ist" wert={euroKompakt(p.erloeseIst)} />
        <Zahl label="Erlös erwartet" wert={euroKompakt(p.erloesErwartet)} />
        <Zahl
          label="Marge erwartet"
          wert={prozent(p.margeQuote, 1)}
          ton={p.margeQuote < 0.12 ? "bad" : p.margeQuote < 0.2 ? "warn" : "ok"}
        />
        <Zahl label="EK gebunden" wert={euroKompakt(p.ekGebunden)} />
      </div>
    </button>
  );
}

function MieterTabelle({
  konten,
  data,
  n,
  onOeffnen,
}: {
  konten: MietKonto[];
  data: NonNullable<ReturnType<typeof useBoardDaten>["data"]>;
  n: N;
  onOeffnen: (k: MietKonto) => void;
}) {
  const spalten: Spalte<MietKonto>[] = [
    {
      id: "mieter",
      kopf: "Mieter",
      sortierWert: (k) => n.tenants.get(k.lease.tenantId)?.name ?? "",
      zelle: (k) => <MieterZelle leaseId={k.lease.id} data={data} n={n} />,
    },
    {
      id: "flaeche",
      kopf: "Fläche",
      ausrichtung: "rechts",
      optional: true,
      sortierWert: (k) => n.units.get(k.lease.unitId)?.area ?? 0,
      zelle: (k) => flaeche(n.units.get(k.lease.unitId)?.area),
    },
    {
      id: "kalt",
      kopf: "Kaltmiete",
      ausrichtung: "rechts",
      sortierWert: (k) => k.lease.baseRent,
      zelle: (k) => euro(k.lease.baseRent),
    },
    {
      id: "qm",
      kopf: "€/m²",
      ausrichtung: "rechts",
      optional: true,
      sortierWert: (k) =>
        k.lease.baseRent / (n.units.get(k.lease.unitId)?.area ?? 1),
      zelle: (k) =>
        dezimal(k.lease.baseRent / (n.units.get(k.lease.unitId)?.area ?? 1)),
    },
    {
      id: "soll",
      kopf: "Soll 12 M",
      ausrichtung: "rechts",
      sortierWert: (k) => k.sollSumme,
      zelle: (k) => euro(k.sollSumme),
    },
    {
      id: "ist",
      kopf: "Ist 12 M",
      ausrichtung: "rechts",
      sortierWert: (k) => k.istSumme,
      zelle: (k) => euro(k.istSumme),
    },
    {
      id: "rueck",
      kopf: "Rückstand",
      ausrichtung: "rechts",
      sortierWert: (k) => k.rueckstand,
      zelle: (k) =>
        k.rueckstand > 0 ? (
          <span className="font-medium text-bad">{euro(k.rueckstand)}</span>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    {
      id: "status",
      kopf: "Status",
      sortierWert: (k) => ({ rot: 0, gelb: 1, gruen: 2, grau: 3 })[k.ampel],
      zelle: (k) => (
        <StatusBadge ampel={k.ampel}>
          {k.ampel === "gruen"
            ? "Bezahlt"
            : k.ampel === "gelb"
              ? "Rückstand"
              : "≥ 2 Monate"}
        </StatusBadge>
      ),
    },
  ];
  return (
    <DatenTabelle
      label="Mieter und Mieten"
      zeilen={konten}
      spalten={spalten}
      schluessel={(k) => k.lease.id}
      onZeileKlick={onOeffnen}
      suchText={(k) =>
        `${n.tenants.get(k.lease.tenantId)?.name} ${n.properties.get(n.units.get(k.lease.unitId)?.propertyId ?? "")?.name} ${n.units.get(k.lease.unitId)?.label}`
      }
      suchPlatzhalter="Mieter, Objekt, Einheit…"
      filter={[
        {
          id: "objekt",
          label: "Objekt",
          optionen: data.properties.map((p) => ({ wert: p.id, label: p.name })),
          passt: (k, w) => n.units.get(k.lease.unitId)?.propertyId === w,
        },
        {
          id: "status",
          label: "Status",
          optionen: [
            { wert: "rot", label: "≥ 2 Monate" },
            { wert: "gelb", label: "Rückstand" },
            { wert: "gruen", label: "Bezahlt" },
          ],
          passt: (k, w) => k.ampel === w,
        },
      ]}
      startSortierung={{ id: "status", richtung: "auf" }}
      maxHoehe="calc(100vh - 260px)"
      fusszeile={
        <div className="flex justify-between tabular-nums">
          <span className="text-text-muted">{konten.length} Mietverträge</span>
          <span>
            Rückstand gesamt{" "}
            {euro(konten.reduce((s, k) => s + k.rueckstand, 0))}
          </span>
        </div>
      }
    />
  );
}
