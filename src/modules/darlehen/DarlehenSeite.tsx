import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, FileSpreadsheet, Landmark } from "lucide-react";
import { useMemo, useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { Knopf } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Abschnitt,
  Karte,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import { LOAN_KIND_LABEL, type Loan } from "@/lib/db/typen";
import {
  datum,
  euro,
  euroKompakt,
  ganzzahl,
  prozent,
  relativTage,
} from "@/lib/format/de";
import { tageZwischen } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import {
  useBoardDaten,
  useGesellschaftsFilter,
  useNachschlagen,
} from "@/modules/shell/daten";
import { DarlehenDetail } from "./DarlehenDetail";
import { ImportDialog } from "./ImportDialog";
import type { AbgleichErgebnis } from "./logik/abgleich";
import type { DarlehenStand, Faelligkeit } from "./logik/auswertung";
import { useDarlehenAuswertung } from "./useDarlehen";

type Reiter = "liste" | "abgleich" | "matrix" | "faelligkeiten";

const AMPEL_FILTER = [
  { wert: "rot", label: "Rot" },
  { wert: "gelb", label: "Gelb" },
  { wert: "gruen", label: "Grün" },
  { wert: "grau", label: "Offen" },
];

export function DarlehenSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const auswertung = useDarlehenAuswertung(data);
  const n = useNachschlagen(data);
  const filter = useGesellschaftsFilter();
  const { darlehen: offenId } = useSearch({ from: "/board/darlehen" });
  const navigate = useNavigate({ from: "/board/darlehen" });
  const [reiter, setReiter] = useState<Reiter>("liste");
  const [importOffen, setImportOffen] = useState(false);

  const betrifft = (l: Loan) =>
    filter.passt(l.lenderCompanyId) || filter.passt(l.borrowerCompanyId);

  const staende = useMemo(
    () => (auswertung?.staende ?? []).filter((s) => betrifft(s.loan)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auswertung, filter],
  );
  const abgleich = useMemo(
    () =>
      (auswertung?.abgleich ?? []).filter(
        (a) =>
          filter.passt(a.soll.payerCompanyId) ||
          betrifft(
            auswertung!.staende.find((s) => s.loan.id === a.soll.loanId)!.loan,
          ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auswertung, filter],
  );

  if (error) {
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  }
  if (isLoading || !data || !auswertung) return <SeitenSkelett />;

  const stichtag = auswertung.stichtag;
  const aktiv = staende.filter((s) => s.loan.status === "aktiv");
  const bank = aktiv.filter((s) => s.loan.kind === "bank");
  const intern = aktiv.filter((s) => s.loan.kind !== "bank");
  const summe = (xs: DarlehenStand[]) =>
    xs.reduce((a, s) => a + s.restschuld, 0);
  const bankSumme = summe(bank);
  const zinsSchnitt =
    bankSumme > 0
      ? bank.reduce((a, s) => a + s.restschuld * s.loan.rate, 0) / bankSumme
      : null;
  const zinsenJahr = aktiv.reduce((a, s) => a + s.zinsenLfdJahr, 0);
  const faelligAbgleich = abgleich.filter((a) => a.ampel !== "grau");
  const quote = faelligAbgleich.length
    ? faelligAbgleich.filter((a) => a.ampel === "gruen").length /
      faelligAbgleich.length
    : null;
  const rot = abgleich.filter((a) => a.ampel === "rot").length;
  const gelb = abgleich.filter((a) => a.ampel === "gelb").length;
  const faellig12 = auswertung.faelligkeiten.filter(
    (f) => betrifft(f.loan) && tageZwischen(stichtag, f.datum) <= 365,
  );
  const faellig12Summe = faellig12.reduce((a, f) => a + f.restschuld, 0);
  const offen = offenId
    ? auswertung.staende.find((s) => s.loan.id === offenId)
    : undefined;

  const setOffen = (id: string | undefined) =>
    navigate({
      search: (s) => ({ ...s, darlehen: id }),
      replace: true,
      resetScroll: false,
    });

  return (
    <>
      <SeitenKopf
        titel="Darlehen"
        unterzeile={`${aktiv.length} aktive Darlehen · Stichtag ${datum(stichtag)}`}
        aktionen={
          <Knopf onClick={() => setImportOffen(true)}>
            <FileSpreadsheet /> Excel importieren
          </Knopf>
        }
      />

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiKarte
          label="Bankverbindlichkeiten"
          wert={euroKompakt(bankSumme)}
          hinweis={`${bank.length} Darlehen · Ø ${prozent(zinsSchnitt)}`}
        />
        <KpiKarte
          label="Interne Darlehen"
          wert={euroKompakt(summe(intern))}
          hinweis={`${intern.length} Verträge (IC und Gesellschafter)`}
        />
        <KpiKarte
          label="Zinsen lfd. Jahr"
          wert={euroKompakt(zinsenJahr)}
          hinweis="laut Zinsplan, bis heute"
        />
        <KpiKarte
          label="Zinsabgleich"
          wert={quote === null ? "–" : prozent(quote, 0)}
          hinweis={`${rot} fehlend · ${gelb} abweichend`}
          ampel={rot > 0 ? "rot" : gelb > 0 ? "gelb" : "gruen"}
        />
        <KpiKarte
          label="Fällig ≤ 12 Monate"
          wert={euroKompakt(faellig12Summe)}
          hinweis={`${faellig12.length} Enden/Zinsbindungen`}
          ampel={
            faellig12.some((f) => f.ampel === "rot")
              ? "rot"
              : faellig12.length
                ? "gelb"
                : "gruen"
          }
        />
      </div>

      <div className="mb-4">
        <Segmente
          label="Ansicht"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "liste", label: "Darlehen" },
            {
              wert: "abgleich",
              label: `Zinsabgleich${rot + gelb ? ` (${rot + gelb})` : ""}`,
            },
            { wert: "matrix", label: "Geber × Nehmer" },
            { wert: "faelligkeiten", label: "Fälligkeiten" },
          ]}
        />
      </div>

      {reiter === "liste" ? (
        <DarlehenListe
          staende={staende}
          n={n}
          offenId={offenId}
          onOeffnen={setOffen}
        />
      ) : null}
      {reiter === "abgleich" ? (
        <AbgleichTabelle ergebnisse={abgleich} n={n} onOeffnen={setOffen} />
      ) : null}
      {reiter === "matrix" ? <Matrix auswertung={auswertung} n={n} /> : null}
      {reiter === "faelligkeiten" ? (
        <FaelligkeitenTabelle
          faelligkeiten={auswertung.faelligkeiten.filter((f) =>
            betrifft(f.loan),
          )}
          stichtag={stichtag}
          n={n}
          onOeffnen={setOffen}
        />
      ) : null}

      <DarlehenDetail
        stand={offen}
        abgleich={auswertung.abgleich.filter((a) => a.soll.loanId === offenId)}
        daten={data}
        stichtag={stichtag}
        onSchliessen={() => setOffen(undefined)}
      />
      <ImportDialog
        offen={importOffen}
        onSchliessen={() => setImportOffen(false)}
        daten={data}
      />
    </>
  );
}

type N = ReturnType<typeof useNachschlagen>;

function ArtBadge({ kind }: { kind: Loan["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-medium",
        kind === "bank"
          ? "bg-surface-muted text-text-muted"
          : "bg-accent-soft text-accent-foreground",
      )}
    >
      {LOAN_KIND_LABEL[kind]}
    </span>
  );
}

function DarlehenListe({
  staende,
  n,
  offenId,
  onOeffnen,
}: {
  staende: DarlehenStand[];
  n: N;
  offenId: string | undefined;
  onOeffnen: (id: string) => void;
}) {
  const filter = useGesellschaftsFilter();
  const spalten: Spalte<DarlehenStand>[] = [
    {
      id: "id",
      kopf: "Darlehen",
      sortierWert: (s) => s.loan.id,
      zelle: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-heading">{s.loan.id}</div>
          <div className="truncate text-xs text-text-subtle">
            {s.loan.bankRef ?? s.loan.purpose}
          </div>
        </div>
      ),
    },
    {
      id: "art",
      kopf: "Art",
      zelle: (s) => <ArtBadge kind={s.loan.kind} />,
      sortierWert: (s) => s.loan.kind,
    },
    {
      id: "parteien",
      kopf: "Geber → Nehmer",
      sortierWert: (s) =>
        n.parteiName(s.loan.lenderCompanyId, s.loan.lenderPartyId),
      zelle: (s) => (
        <div className="max-w-[260px] truncate text-sm">
          <span className="text-text-muted">
            {n.parteiName(s.loan.lenderCompanyId, s.loan.lenderPartyId)}
          </span>
          <span className="px-1 text-text-subtle">→</span>
          {n.gesellschaftKurz(s.loan.borrowerCompanyId)}
        </div>
      ),
    },
    {
      id: "objekt",
      kopf: "Objekt",
      optional: true,
      sortierWert: (s) => s.loan.propertyId,
      zelle: (s) =>
        s.loan.propertyId ? (
          n.properties.get(s.loan.propertyId)?.name
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    {
      id: "restschuld",
      kopf: "Restschuld",
      ausrichtung: "rechts",
      sortierWert: (s) => s.restschuld,
      zelle: (s) => (
        <div className="flex flex-col items-end gap-1">
          <span>{euro(s.restschuld)}</span>
          <span
            className="h-1 w-20 overflow-hidden rounded-full bg-surface-muted"
            title={`${prozent(s.getilgtAnteil, 0)} getilgt`}
          >
            <span
              className="block h-full rounded-full bg-primary/60"
              style={{ width: `${Math.round(s.getilgtAnteil * 100)}%` }}
            />
          </span>
        </div>
      ),
    },
    {
      id: "zins",
      kopf: "Zins",
      ausrichtung: "rechts",
      sortierWert: (s) => s.loan.rate,
      zelle: (s) => prozent(s.loan.rate),
    },
    {
      id: "frist",
      kopf: "Bindung / Ende",
      sortierWert: (s) => s.kritischesDatum,
      zelle: (s) =>
        s.kritischesDatum ? (
          <div>
            <div className="tabular-nums">{datum(s.kritischesDatum)}</div>
            <div className="text-xs text-text-subtle">
              {s.kritischesEreignis}
            </div>
          </div>
        ) : (
          <span className="text-text-subtle">unbefristet</span>
        ),
    },
    {
      id: "naechste",
      kopf: "Nächste Zahlung",
      optional: true,
      ausrichtung: "rechts",
      sortierWert: (s) => s.naechsteZahlung?.dueDate ?? null,
      zelle: (s) =>
        s.naechsteZahlung ? (
          <div>
            <div>{euro(s.naechsteZahlung.payment)}</div>
            <div className="text-xs text-text-subtle">
              {datum(s.naechsteZahlung.dueDate)}
            </div>
          </div>
        ) : (
          "–"
        ),
    },
    {
      id: "ampel",
      kopf: "",
      zelle: (s) => (
        <AmpelPunkt
          ampel={s.ampel}
          label={
            s.ampel === "gruen"
              ? "Keine Frist in 12 Monaten"
              : `${s.kritischesEreignis} ${datum(s.kritischesDatum)}`
          }
        />
      ),
      sortierWert: (s) => ({ rot: 0, gelb: 1, gruen: 2, grau: 3 })[s.ampel],
      breite: "32px",
    },
  ];
  return (
    <DatenTabelle
      label="Darlehen"
      zeilen={staende}
      spalten={spalten}
      schluessel={(s) => s.loan.id}
      onZeileKlick={(s) => onOeffnen(s.loan.id)}
      aktiveZeile={offenId ?? null}
      suchText={(s) =>
        `${s.loan.id} ${s.loan.bankRef ?? ""} ${s.loan.purpose} ${n.parteiName(s.loan.lenderCompanyId, s.loan.lenderPartyId)} ${n.gesellschaftName(s.loan.borrowerCompanyId)} ${n.properties.get(s.loan.propertyId ?? "")?.name ?? ""}`
      }
      suchPlatzhalter="ID, Bank, Gesellschaft, Objekt…"
      filter={[
        {
          id: "art",
          label: "Art",
          optionen: [
            { wert: "bank", label: "Bank" },
            { wert: "intercompany", label: "Intercompany" },
            { wert: "gesellschafter", label: "Gesellschafter" },
          ],
          passt: (s, w) => s.loan.kind === w,
        },
        {
          id: "ampel",
          label: "Frist",
          optionen: AMPEL_FILTER.slice(0, 3),
          passt: (s, w) => s.ampel === w,
        },
      ]}
      startSortierung={{ id: "frist", richtung: "auf" }}
      maxHoehe="calc(100vh - 260px)"
      leer={
        <Leerzustand
          icon={Landmark}
          titel="Keine Darlehen"
          text={
            filter.alle
              ? "Darlehensregister per Excel importieren."
              : "Diese Gesellschaft ist weder Darlehensgeber noch -nehmer."
          }
          kompakt
        />
      }
      fusszeile={
        <div className="flex justify-between tabular-nums">
          <span className="text-text-muted">{staende.length} Darlehen</span>
          <span>
            Restschuld gesamt{" "}
            {euro(staende.reduce((a, s) => a + s.restschuld, 0))}
          </span>
        </div>
      }
    />
  );
}

function AbgleichTabelle({
  ergebnisse,
  n,
  onOeffnen,
}: {
  ergebnisse: AbgleichErgebnis[];
  n: N;
  onOeffnen: (id: string) => void;
}) {
  const spalten: Spalte<AbgleichErgebnis>[] = [
    {
      id: "faellig",
      kopf: "Fällig",
      sortierWert: (e) => e.soll.dueDate,
      zelle: (e) => (
        <span className="tabular-nums">{datum(e.soll.dueDate)}</span>
      ),
    },
    {
      id: "darlehen",
      kopf: "Darlehen",
      sortierWert: (e) => e.soll.loanId,
      zelle: (e) => (
        <div>
          <div className="font-medium text-heading">{e.soll.loanId}</div>
          <div className="text-xs text-text-subtle">
            {n.gesellschaftKurz(e.soll.payerCompanyId)} → {e.soll.payeeName}
          </div>
        </div>
      ),
    },
    {
      id: "soll",
      kopf: "Soll",
      ausrichtung: "rechts",
      sortierWert: (e) => e.soll.amount,
      zelle: (e) => euro(e.soll.amount),
    },
    {
      id: "ist",
      kopf: "Ist",
      ausrichtung: "rechts",
      sortierWert: (e) => (e.transaction ? -e.transaction.amount : null),
      zelle: (e) =>
        e.transaction ? (
          <div>
            <div>{euro(-e.transaction.amount)}</div>
            <div className="text-xs text-text-subtle">
              {datum(e.transaction.bookingDate)}
            </div>
          </div>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    {
      id: "zweck",
      kopf: "Verwendungszweck",
      optional: true,
      zelle: (e) => (
        <span className="block max-w-[260px] truncate text-xs text-text-muted">
          {e.transaction?.purpose ?? "–"}
        </span>
      ),
    },
    {
      id: "status",
      kopf: "Status",
      sortierWert: (e) => ({ rot: 0, gelb: 1, grau: 2, gruen: 3 })[e.ampel],
      zelle: (e) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge ampel={e.ampel}>
            {
              {
                gruen: "Zugeordnet",
                gelb: "Prüfen",
                rot: "Fehlt",
                grau: "Ausstehend",
              }[e.ampel]
            }
          </StatusBadge>
          {e.ampel === "gelb" ? (
            <span className="text-xs text-text-muted">
              {e.gruende.join(" · ")}
            </span>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <DatenTabelle
      label="Zinsabgleich"
      zeilen={ergebnisse}
      spalten={spalten}
      schluessel={(e) => e.soll.id}
      onZeileKlick={(e) => onOeffnen(e.soll.loanId)}
      suchText={(e) =>
        `${e.soll.loanId} ${e.soll.payeeName} ${n.gesellschaftName(e.soll.payerCompanyId)} ${e.transaction?.purpose ?? ""}`
      }
      filter={[
        {
          id: "ampel",
          label: "Status",
          optionen: AMPEL_FILTER,
          passt: (e, w) => e.ampel === w,
        },
      ]}
      startSortierung={{ id: "status", richtung: "auf" }}
      maxHoehe="calc(100vh - 260px)"
    />
  );
}

function Matrix({
  auswertung,
  n,
}: {
  auswertung: NonNullable<ReturnType<typeof useDarlehenAuswertung>>;
  n: N;
}) {
  const { geber, nehmer, zellen } = auswertung.matrix;
  const name = (id: string) =>
    n.companies.get(id)?.shortName ?? n.parties.get(id)?.name ?? id;
  const zeilenSumme = (g: string) =>
    nehmer.reduce((a, x) => a + (zellen.get(`${g}|${x}`)?.summe ?? 0), 0);
  const spaltenSumme = (x: string) =>
    geber.reduce((a, g) => a + (zellen.get(`${g}|${x}`)?.summe ?? 0), 0);
  const gesamt = geber.reduce((a, g) => a + zeilenSumme(g), 0);
  const max = Math.max(...[...zellen.values()].map((z) => z.summe), 1);
  return (
    <Abschnitt
      titel="Interne Darlehen: Geber × Nehmer"
      beschreibung="Restschuld zum Stichtag; Zeilen geben, Spalten nehmen"
    >
      <Karte className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b border-hairline">
              <th className="h-9 px-4 text-left text-xs font-medium text-text-muted">
                Geber ↓ / Nehmer →
              </th>
              {nehmer.map((x) => (
                <th
                  key={x}
                  className="px-3 text-right text-xs font-medium text-text-muted"
                  title={n.gesellschaftName(x)}
                >
                  {name(x)}
                </th>
              ))}
              <th className="px-4 text-right text-xs font-semibold text-heading">
                Forderungen
              </th>
            </tr>
          </thead>
          <tbody>
            {geber.map((g) => (
              <tr key={g} className="border-b border-hairline">
                <th
                  scope="row"
                  className="h-10 whitespace-nowrap px-4 text-left font-medium text-heading"
                >
                  {n.companies.get(g)?.name ?? n.parties.get(g)?.name}
                </th>
                {nehmer.map((x) => {
                  const z = zellen.get(`${g}|${x}`);
                  return (
                    <td key={x} className="px-3 text-right">
                      {z ? (
                        <span
                          className="inline-block rounded-[5px] px-1.5 py-0.5"
                          style={{
                            background: `color-mix(in oklch, var(--primary) ${Math.round(6 + (z.summe / max) * 30)}%, transparent)`,
                          }}
                          title={`${z.anzahl} Darlehen · ${euro(z.summe)}`}
                        >
                          {euroKompakt(z.summe)}
                        </span>
                      ) : (
                        <span className="text-text-subtle">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 text-right font-semibold text-heading">
                  {euroKompakt(zeilenSumme(g))}
                </td>
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className="h-10 px-4 text-left font-semibold text-heading"
              >
                Verbindlichkeiten
              </th>
              {nehmer.map((x) => (
                <td
                  key={x}
                  className="px-3 text-right font-semibold text-heading"
                >
                  {euroKompakt(spaltenSumme(x))}
                </td>
              ))}
              <td className="px-4 text-right font-semibold text-heading">
                {euroKompakt(gesamt)}
              </td>
            </tr>
          </tbody>
        </table>
      </Karte>
      <p className="mt-2 text-xs text-text-muted">
        Größter Einzelnehmer:{" "}
        {(() => {
          const top = [...nehmer].sort(
            (a, b) => spaltenSumme(b) - spaltenSumme(a),
          )[0];
          return top
            ? `${n.gesellschaftName(top)} mit ${prozent(spaltenSumme(top) / (gesamt || 1), 0)} der internen Darlehen`
            : "–";
        })()}
      </p>
    </Abschnitt>
  );
}

function FaelligkeitenTabelle({
  faelligkeiten,
  stichtag,
  n,
  onOeffnen,
}: {
  faelligkeiten: Faelligkeit[];
  stichtag: string;
  n: N;
  onOeffnen: (id: string) => void;
}) {
  const spalten: Spalte<Faelligkeit>[] = [
    {
      id: "datum",
      kopf: "Datum",
      sortierWert: (f) => f.datum,
      zelle: (f) => (
        <div>
          <div className="tabular-nums">{datum(f.datum)}</div>
          <div className="text-xs text-text-subtle">
            {relativTage(tageZwischen(stichtag, f.datum))}
          </div>
        </div>
      ),
    },
    {
      id: "ereignis",
      kopf: "Ereignis",
      sortierWert: (f) => f.ereignis,
      zelle: (f) =>
        f.ereignis === "Ende" ? "Darlehen endet" : "Zinsbindung endet",
    },
    {
      id: "darlehen",
      kopf: "Darlehen",
      sortierWert: (f) => f.loan.id,
      zelle: (f) => (
        <div>
          <div className="font-medium text-heading">{f.loan.id}</div>
          <div className="text-xs text-text-subtle">
            {n.parteiName(f.loan.lenderCompanyId, f.loan.lenderPartyId)} →{" "}
            {n.gesellschaftKurz(f.loan.borrowerCompanyId)}
          </div>
        </div>
      ),
    },
    {
      id: "rest",
      kopf: "Restschuld",
      ausrichtung: "rechts",
      sortierWert: (f) => f.restschuld,
      zelle: (f) => euro(f.restschuld),
    },
    {
      id: "zins",
      kopf: "Zins heute",
      ausrichtung: "rechts",
      sortierWert: (f) => f.loan.rate,
      zelle: (f) => prozent(f.loan.rate),
    },
    {
      id: "p1",
      kopf: "+1 %-Pkt. p.a.",
      ausrichtung: "rechts",
      sortierWert: (f) => f.mehrbelastung1,
      zelle: (f) => euro(f.mehrbelastung1),
    },
    {
      id: "p2",
      kopf: "+2 %-Pkt. p.a.",
      ausrichtung: "rechts",
      sortierWert: (f) => f.mehrbelastung2,
      zelle: (f) => euro(f.mehrbelastung2),
    },
    {
      id: "ampel",
      kopf: "",
      zelle: (f) => (
        <StatusBadge ampel={f.ampel}>
          {
            {
              rot: "≤ 6 Monate",
              gelb: "≤ 12 Monate",
              gruen: "≤ 24 Monate",
              grau: "",
            }[f.ampel]
          }
        </StatusBadge>
      ),
    },
  ];
  const rest = faelligkeiten.reduce((a, f) => a + f.restschuld, 0);
  return (
    <Abschnitt
      titel="Fälligkeiten und Zinsbindungsenden (24 Monate)"
      beschreibung="Mehrbelastung, falls die Anschlussfinanzierung 1 bzw. 2 Prozentpunkte teurer wird"
    >
      <DatenTabelle
        label="Fälligkeiten"
        zeilen={faelligkeiten}
        spalten={spalten}
        schluessel={(f) => `${f.loan.id}-${f.ereignis}`}
        onZeileKlick={(f) => onOeffnen(f.loan.id)}
        startSortierung={{ id: "datum", richtung: "auf" }}
        fusszeile={
          <div className="flex flex-wrap justify-between gap-2 tabular-nums">
            <span className="text-text-muted">
              {ganzzahl(faelligkeiten.length)} Ereignisse · Restschuld{" "}
              {euro(rest)}
            </span>
            <span>
              Zinsänderungsrisiko p.a.: {euro(rest * 0.01)} bei +1 %-Pkt. ·{" "}
              {euro(rest * 0.02)} bei +2 %-Pkt.
            </span>
          </div>
        }
      />
    </Abschnitt>
  );
}
