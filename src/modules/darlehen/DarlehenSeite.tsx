import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, FileSpreadsheet, Landmark } from "lucide-react";
import { useMemo, useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { Knopf } from "@/components/board/Knopf";
import {
  Abschnitt,
  Karte,
  BuehnenKennzahl,
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
import {
  GeberDiagramm,
  GesellschaftDiagramm,
  LaufzeitDiagramm,
  Legende,
  NettoDiagramm,
  ProfilDiagramm,
  Zusammensetzung,
} from "./DarlehenDiagramme";
import {
  externeGeber,
  externeLaufzeiten,
  faelligkeitsProfil,
  GRUPPE_FARBE,
  gruppe,
  internNetto,
  istExterneForderung,
  kreis,
  kreisSummen,
  verbindlichkeitenJeGesellschaft,
  zinsenBeiRueckzahlung,
  type AufgelaufenZeile,
} from "./logik/kreise";
import { useDarlehenAuswertung, type DarlehenAuswertung } from "./useDarlehen";

type Reiter = "ueberblick" | "extern" | "intern" | "abgleich" | "faelligkeiten";

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
  const [reiter, setReiter] = useState<Reiter>("ueberblick");
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
  const summen = kreisSummen(staende);
  const extern = summen.bank + summen.privat;
  const zinsSchnittExtern = extern > 0 ? summen.zinsenExternPa / extern : null;
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
  const ueberfaellig = aktiv.filter(
    (s) => s.loan.maturityDate && s.loan.maturityDate < stichtag,
  );
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
        unterzeile={`${aktiv.length} aktive Darlehen, gegliedert in extern (Banken, private Geber, Dritte) und intern (Gruppe und Gesellschafter) · Stichtag ${datum(stichtag)}`}
        aktionen={
          <Knopf onClick={() => setImportOffen(true)}>
            <FileSpreadsheet /> Excel importieren
          </Knopf>
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <BuehnenKennzahl
            label="Extern"
            wert={euroKompakt(extern)}
            hinweis={`Banken ${euroKompakt(summen.bank)} · Privat ${euroKompakt(summen.privat)}`}
            title="Restschuld gegenüber Banken, privaten Darlehensgebern und Dritten"
          />
          <BuehnenKennzahl
            label="Intern"
            wert={euroKompakt(summen.intern)}
            hinweis={`${summen.anzahl.intern} Verträge, gleichen sich in der Gruppe aus`}
            title="Darlehen zwischen FRENKEN-Gesellschaften und Gesellschaftern"
          />
          <BuehnenKennzahl
            label="Zinsen extern p.a."
            wert={euroKompakt(summen.zinsenExternPa)}
            hinweis={`Ø ${prozent(zinsSchnittExtern)} auf die externe Restschuld`}
            title="Restschuld × Zinssatz, hochgerechnet auf ein Jahr"
          />
          <BuehnenKennzahl
            label="Zinsabgleich"
            wert={quote === null ? "–" : prozent(quote, 0)}
            hinweis={`${rot} fehlend · ${gelb} abweichend`}
            ampel={rot > 0 ? "rot" : gelb > 0 ? "gelb" : "gruen"}
          />
          <BuehnenKennzahl
            label="Fällig ≤ 12 Monate"
            wert={euroKompakt(faellig12Summe)}
            hinweis={
              ueberfaellig.length
                ? `${faellig12.length} Termine · ${ueberfaellig.length} überfällig`
                : `${faellig12.length} Enden/Zinsbindungen`
            }
            ampel={
              ueberfaellig.length || faellig12.some((f) => f.ampel === "rot")
                ? "rot"
                : faellig12.length
                  ? "gelb"
                  : "gruen"
            }
          />
        </div>
      </SeitenKopf>

      <div className="mb-6">
        <Segmente
          label="Ansicht"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "ueberblick", label: "Überblick" },
            {
              wert: "extern",
              label: `Extern (${summen.anzahl.bank + summen.anzahl.privat})`,
            },
            { wert: "intern", label: `Intern (${summen.anzahl.intern})` },
            {
              wert: "abgleich",
              label: `Zinsabgleich${rot + gelb ? ` (${rot + gelb})` : ""}`,
            },
            { wert: "faelligkeiten", label: "Fälligkeiten" },
          ]}
        />
      </div>

      {reiter === "ueberblick" ? (
        <Ueberblick staende={staende} stichtag={stichtag} n={n} />
      ) : null}
      {reiter === "extern" ? (
        <ExternAnsicht
          staende={staende}
          stichtag={stichtag}
          n={n}
          offenId={offenId}
          onOeffnen={setOffen}
        />
      ) : null}
      {reiter === "intern" ? (
        <InternAnsicht
          staende={staende}
          auswertung={auswertung}
          n={n}
          offenId={offenId}
          onOeffnen={setOffen}
        />
      ) : null}
      {reiter === "abgleich" ? (
        <>
          <ZinsenBeiRueckzahlung
            zeilen={zinsenBeiRueckzahlung(staende, stichtag)}
            n={n}
            onOeffnen={setOffen}
          />
          <Abschnitt
            titel="Laufende Zinszahlungen"
            beschreibung="Soll laut Vertrag gegen die Kontoumsätze der letzten 12 Monate"
          >
            <AbgleichTabelle ergebnisse={abgleich} n={n} onOeffnen={setOffen} />
          </Abschnitt>
        </>
      ) : null}
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

function ArtBadge({ loan }: { loan: Loan }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded bg-surface-muted px-1.5 text-[11px] font-medium text-text-muted">
      <span
        className="size-1.5 rounded-full"
        style={{ background: GRUPPE_FARBE[gruppe(loan)] }}
        aria-hidden
      />
      {LOAN_KIND_LABEL[loan.kind]}
    </span>
  );
}

/** Kurzname für Gesellschaft oder Partei (Diagrammachsen). */
function kurzName(n: N, id: string): string {
  return n.companies.get(id)?.shortName ?? n.parties.get(id)?.name ?? id;
}
function langName(n: N, id: string): string {
  return n.companies.get(id)?.name ?? n.parties.get(id)?.name ?? id;
}

function Ueberblick({
  staende,
  stichtag,
  n,
}: {
  staende: DarlehenStand[];
  stichtag: string;
  n: N;
}) {
  const summen = kreisSummen(staende);
  const geber = externeGeber(staende);
  const nehmer = verbindlichkeitenJeGesellschaft(staende);
  const profil = faelligkeitsProfil(staende, stichtag);
  return (
    <>
      <Abschnitt
        titel="Wie ist die Gruppe finanziert?"
        beschreibung="Restschuld aller aktiven Darlehen, an denen eine FRENKEN-Gesellschaft Geld nimmt"
      >
        <Karte className="p-5">
          <Zusammensetzung summen={summen} />
          {summen.forderungenExtern > 0 ? (
            <p className="mt-4 border-t border-hairline pt-3 text-xs text-text-muted">
              Zusätzlich verleiht die Gruppe {euro(summen.forderungenExtern)} an
              Dritte (siehe Extern → Forderungen an Dritte).
            </p>
          ) : null}
        </Karte>
      </Abschnitt>
      <div className="grid gap-x-6 xl:grid-cols-2">
        <Abschnitt
          titel="Externe Darlehensgeber"
          beschreibung="Bei wem die Gruppe extern Schulden hat; Tooltip mit Ø Zins und Zinsen p.a."
          aktionen={<Legende gruppen={["bank", "privat"]} />}
        >
          <Karte className="p-4">
            {geber.length ? (
              <GeberDiagramm zeilen={geber} name={(id) => kurzName(n, id)} />
            ) : (
              <p className="p-6 text-center text-sm text-text-muted">
                Keine externen Darlehen
              </p>
            )}
          </Karte>
        </Abschnitt>
        <Abschnitt
          titel="Verbindlichkeiten je Gesellschaft"
          beschreibung="Wer wie viel schuldet, nach Banken, privaten Gebern und intern"
          aktionen={<Legende gruppen={["bank", "privat", "intern"]} />}
        >
          <Karte className="p-4">
            <GesellschaftDiagramm
              zeilen={nehmer}
              name={(id) => kurzName(n, id)}
              langName={(id) => langName(n, id)}
            />
          </Karte>
        </Abschnitt>
      </div>
      <Abschnitt
        titel="Wann wird es fällig?"
        beschreibung="Restschuld nach Jahr des Vertragsendes oder Zinsbindungsendes (was zuerst kommt); unbefristete Darlehen rechts"
        aktionen={<Legende gruppen={["bank", "privat", "intern"]} />}
      >
        <Karte className="p-4">
          <ProfilDiagramm jahre={profil} />
        </Karte>
      </Abschnitt>
    </>
  );
}

function ExternAnsicht({
  staende,
  stichtag,
  n,
  offenId,
  onOeffnen,
}: {
  staende: DarlehenStand[];
  stichtag: string;
  n: N;
  offenId: string | undefined;
  onOeffnen: (id: string) => void;
}) {
  const ext = staende.filter((s) => kreis(s.loan) === "extern");
  const bank = ext.filter((s) => s.loan.kind === "bank");
  const privat = ext.filter(
    (s) => s.loan.kind !== "bank" && !istExterneForderung(s.loan),
  );
  const forderungen = ext.filter((s) => istExterneForderung(s.loan));
  const aktivSumme = (xs: DarlehenStand[]) =>
    xs
      .filter((s) => s.loan.status === "aktiv")
      .reduce((a, s) => a + s.restschuld, 0);
  const laufzeiten = externeLaufzeiten(staende);
  const kurzZeile = (z: { loan: Loan }) =>
    `${kurzName(n, z.loan.lenderPartyId ?? z.loan.lenderCompanyId ?? "")} → ${n.gesellschaftKurz(z.loan.borrowerCompanyId)}${z.loan.propertyId ? ` · ${n.properties.get(z.loan.propertyId)?.name ?? ""}` : ""}`;
  return (
    <>
      {laufzeiten.length ? (
        <Abschnitt
          titel="Zinsbindung und Laufzeit"
          beschreibung="Welche Darlehen variabel verzinst sind und wann die übrigen auslaufen oder neu verhandelt werden"
        >
          <Karte className="p-5">
            <LaufzeitDiagramm
              zeilen={laufzeiten}
              stichtag={stichtag}
              name={(z) =>
                langName(
                  n,
                  z.loan.lenderPartyId ?? z.loan.lenderCompanyId ?? "",
                )
              }
              kurz={kurzZeile}
            />
          </Karte>
        </Abschnitt>
      ) : null}
      <Abschnitt
        titel="Banken"
        beschreibung={`Restschuld ${euro(aktivSumme(bank))} · Salden laut Bank bzw. gebuchten Tilgungen`}
      >
        <DarlehenListe
          staende={bank}
          n={n}
          offenId={offenId}
          onOeffnen={onOeffnen}
        />
      </Abschnitt>
      <Abschnitt
        titel="Private Darlehensgeber und Dritte"
        beschreibung={`Restschuld ${euro(aktivSumme(privat))} · Familie und Unternehmen außerhalb der FRENKEN-Gruppe`}
      >
        <DarlehenListe
          staende={privat}
          n={n}
          offenId={offenId}
          onOeffnen={onOeffnen}
        />
      </Abschnitt>
      {forderungen.length ? (
        <Abschnitt
          titel="Forderungen an Dritte"
          beschreibung={`${euro(aktivSumme(forderungen))} hat die Gruppe an Dritte verliehen`}
        >
          <DarlehenListe
            staende={forderungen}
            n={n}
            offenId={offenId}
            onOeffnen={onOeffnen}
          />
        </Abschnitt>
      ) : null}
    </>
  );
}

function InternAnsicht({
  staende,
  auswertung,
  n,
  offenId,
  onOeffnen,
}: {
  staende: DarlehenStand[];
  auswertung: DarlehenAuswertung;
  n: N;
  offenId: string | undefined;
  onOeffnen: (id: string) => void;
}) {
  const intern = staende.filter((s) => kreis(s.loan) === "intern");
  const netto = internNetto(staende);
  return (
    <>
      <Abschnitt
        titel="Wer finanziert wen?"
        beschreibung="Netto-Position aus internen Darlehen: gegebene minus genommene Restschuld"
      >
        <Karte className="p-4">
          <NettoDiagramm
            zeilen={netto}
            name={(id) => kurzName(n, id)}
            langName={(id) => langName(n, id)}
          />
        </Karte>
      </Abschnitt>
      <Matrix auswertung={auswertung} n={n} />
      <Abschnitt titel="Alle internen Darlehen">
        <DarlehenListe
          staende={intern}
          n={n}
          offenId={offenId}
          onOeffnen={onOeffnen}
        />
      </Abschnitt>
    </>
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
      zelle: (s) => <ArtBadge loan={s.loan} />,
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
            { wert: "sonstige", label: LOAN_KIND_LABEL.sonstige },
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
      startSortierung={{ id: "restschuld", richtung: "ab" }}
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

function ZinsenBeiRueckzahlung({
  zeilen,
  n,
  onOeffnen,
}: {
  zeilen: AufgelaufenZeile[];
  n: N;
  onOeffnen: (id: string) => void;
}) {
  if (!zeilen.length) return null;
  const summe = zeilen.reduce((a, z) => a + z.aufgelaufen, 0);
  const spalten: Spalte<AufgelaufenZeile>[] = [
    {
      id: "darlehen",
      kopf: "Darlehen",
      sortierWert: (z) => z.loan.id,
      zelle: (z) => (
        <div className="min-w-0">
          <div className="font-medium text-heading">{z.loan.id}</div>
          <div className="truncate text-xs text-text-subtle">
            {n.parteiName(z.loan.lenderCompanyId, z.loan.lenderPartyId)} →{" "}
            {n.gesellschaftKurz(z.loan.borrowerCompanyId) !== "–"
              ? n.gesellschaftKurz(z.loan.borrowerCompanyId)
              : n.parteiName(null, z.loan.borrowerPartyId)}
          </div>
        </div>
      ),
    },
    {
      id: "seit",
      kopf: "Ausgezahlt",
      sortierWert: (z) => z.loan.disbursementDate,
      zelle: (z) => (
        <span className="tabular-nums">{datum(z.loan.disbursementDate)}</span>
      ),
    },
    {
      id: "rest",
      kopf: "Restschuld",
      ausrichtung: "rechts",
      sortierWert: (z) => z.restschuld,
      zelle: (z) => euro(z.restschuld),
    },
    {
      id: "zins",
      kopf: "Zins",
      ausrichtung: "rechts",
      sortierWert: (z) => z.loan.rate,
      zelle: (z) => prozent(z.loan.rate),
    },
    {
      id: "auf",
      kopf: "Aufgelaufen",
      ausrichtung: "rechts",
      sortierWert: (z) => z.aufgelaufen,
      zelle: (z) => (
        <span className="font-medium text-heading">{euro(z.aufgelaufen)}</span>
      ),
    },
  ];
  return (
    <Abschnitt
      titel="Zinsen bei Rückzahlung"
      beschreibung={`${zeilen.length} Darlehen zahlen keine laufenden Zinsen; rechnerisch aufgelaufen bis heute ${euro(summe)} (fällig mit der Rückzahlung, nicht im Abgleich)`}
    >
      <DatenTabelle
        label="Zinsen bei Rückzahlung"
        zeilen={zeilen}
        spalten={spalten}
        schluessel={(z) => z.loan.id}
        onZeileKlick={(z) => onOeffnen(z.loan.id)}
        startSortierung={{ id: "auf", richtung: "ab" }}
        fusszeile={
          <div className="flex justify-between tabular-nums">
            <span className="text-text-muted">
              Restschuld × Zins × Tage seit Auszahlung / 360, ohne Zinseszins
            </span>
            <span>Aufgelaufen gesamt {euro(summe)}</span>
          </div>
        }
      />
    </Abschnitt>
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
                          className="inline-block rounded px-1.5 py-0.5"
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
