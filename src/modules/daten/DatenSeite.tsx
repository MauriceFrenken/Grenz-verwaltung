import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { Knopf } from "@/components/board/Knopf";
import {
  Abschnitt,
  Karte,
  BuehnenKennzahl,
  SeitenKopf,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt, StatusBadge } from "@/components/board/Status";
import { boardRepository } from "@/lib/db/config";
import type { PlanpostenEingabe } from "@/lib/db/repository";
import {
  SEGMENT_LABEL,
  SEGMENTE,
  type BoardDaten,
  type DatenLuecke,
  type QuellenStand,
  type Segment,
} from "@/lib/db/typen";
import { datum, euro, ganzzahl, parseDeutscheZahl } from "@/lib/format/de";
import { BOARD_DATEN_KEY, useBoardDaten } from "@/modules/shell/daten";

const ZIEL: Record<DatenLuecke["bereich"], string | null> = {
  gesellschaften: "#gesellschaften",
  konten: "#kontosaldo",
  darlehen: "/board/darlehen",
  immobilien: "/board/immobilien",
  transaktionen: "/board/transaktionen",
  baumaschinen: "/board/baumaschinen",
  liquiditaet: "/board/liquiditaet",
  system: null,
};

const BEREICH_LABEL: Record<DatenLuecke["bereich"], string> = {
  gesellschaften: "Gesellschaften",
  konten: "Konten",
  darlehen: "Darlehen",
  immobilien: "Immobilien",
  transaktionen: "Transaktionen",
  baumaschinen: "Baumaschinen",
  liquiditaet: "Liquidität",
  system: "System",
};

const AMPEL_QUELLE = { ok: "gruen", warn: "gelb", fehlt: "rot" } as const;

const FELD =
  "mt-1 h-8 w-full border border-hairline bg-surface px-2.5 text-sm text-foreground outline-none focus:border-input";

/** Nach einer Änderung neu laden und Ergebnis melden. */
function useSpeichern() {
  const queryClient = useQueryClient();
  return async (aktion: () => Promise<unknown>, erfolg: string) => {
    try {
      await aktion();
      await queryClient.invalidateQueries({ queryKey: BOARD_DATEN_KEY });
      toast.success(erfolg);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
}

export function DatenSeite() {
  const { data, isLoading, error } = useBoardDaten();

  if (error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Daten konnten nicht geladen werden"
        text={(error as Error).message}
      />
    );
  if (isLoading || !data) return <SeitenSkelett />;

  const rot = data.luecken.filter((l) => l.schwere === "rot").length;
  const gelb = data.luecken.length - rot;
  const quellenOk = data.datenstand.filter((q) => q.status === "ok").length;
  const ohneSaldo = data.bankAccounts.filter((k) => !k.saldoBekannt).length;

  return (
    <>
      <SeitenKopf
        titel="Datenqualität"
        unterzeile={`Woher die Zahlen kommen, was fehlt und wo es nachgetragen wird${data.quelle === "mock" ? " · Musterdaten" : ""}`}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <BuehnenKennzahl
            label="Quellen aktuell"
            wert={
              data.datenstand.length
                ? `${quellenOk} / ${data.datenstand.length}`
                : "–"
            }
            hinweis="führende Systeme mit frischen Daten"
            ampel={
              !data.datenstand.length
                ? "grau"
                : quellenOk === data.datenstand.length
                  ? "gruen"
                  : "gelb"
            }
          />
          <BuehnenKennzahl
            label="Kritische Lücken"
            wert={ganzzahl(rot)}
            hinweis="verfälschen Kennzahlen"
            ampel={rot ? "rot" : "gruen"}
          />
          <BuehnenKennzahl
            label="Weitere Lücken"
            wert={ganzzahl(gelb)}
            hinweis="Kennzahl mit Annahme gerechnet"
            ampel={gelb ? "gelb" : "gruen"}
          />
          <BuehnenKennzahl
            label="Konten ohne Saldo"
            wert={`${ohneSaldo} / ${data.bankAccounts.length}`}
            hinweis="Bestand nur aus Umsätzen"
            ampel={ohneSaldo ? "gelb" : "gruen"}
          />
        </div>
      </SeitenKopf>

      <Abschnitt
        titel="Quellen"
        beschreibung="Je Datenbereich das führende System und der letzte Stand"
      >
        {data.datenstand.length === 0 ? (
          <Karte>
            <Leerzustand
              kompakt
              icon={Database}
              titel="Musterdaten"
              text="Im Demo-Modus gibt es keine Quellen. Mit Bens Datenbank zeigt diese Tabelle den Stand jeder Quelle."
            />
          </Karte>
        ) : (
          <QuellenTabelle quellen={data.datenstand} />
        )}
      </Abschnitt>

      <Abschnitt
        titel="Lücken"
        beschreibung="Was fehlt, damit die Zahlen stimmen. Rot zuerst."
      >
        {data.luecken.length === 0 ? (
          <Karte>
            <Leerzustand
              kompakt
              icon={CheckCircle2}
              titel="Keine Lücken erkannt"
            />
          </Karte>
        ) : (
          <LueckenListe luecken={data.luecken} />
        )}
      </Abschnitt>

      <div className="grid gap-4 lg:grid-cols-2">
        <KontosaldoFormular daten={data} />
        <PlanpostenFormular daten={data} />
      </div>

      <GesellschaftenFormular daten={data} />
    </>
  );
}

function QuellenTabelle({ quellen }: { quellen: QuellenStand[] }) {
  const spalten: Spalte<QuellenStand>[] = [
    {
      id: "status",
      kopf: "",
      breite: "w-6",
      zelle: (q) => <AmpelPunkt ampel={AMPEL_QUELLE[q.status]} />,
    },
    {
      id: "label",
      kopf: "Bereich",
      zelle: (q) => <span className="font-medium text-heading">{q.label}</span>,
    },
    { id: "system", kopf: "Führendes System", zelle: (q) => q.system },
    {
      id: "stand",
      kopf: "Stand",
      sortierWert: (q) => q.stand,
      zelle: (q) => (q.stand ? datum(q.stand.slice(0, 10)) : "–"),
    },
    {
      id: "anzahl",
      kopf: "Datensätze",
      ausrichtung: "rechts",
      sortierWert: (q) => q.anzahl,
      zelle: (q) => ganzzahl(q.anzahl),
    },
    {
      id: "hinweis",
      kopf: "Hinweis",
      optional: true,
      zelle: (q) => (
        <span className="text-xs text-text-muted">{q.hinweis}</span>
      ),
    },
  ];
  return (
    <DatenTabelle
      label="Quellen"
      zeilen={quellen}
      spalten={spalten}
      schluessel={(q) => q.id}
    />
  );
}

function LueckenListe({ luecken }: { luecken: DatenLuecke[] }) {
  const sortiert = [...luecken].sort(
    (a, b) =>
      (a.schwere === "rot" ? 0 : 1) - (b.schwere === "rot" ? 0 : 1) ||
      a.bereich.localeCompare(b.bereich),
  );
  return (
    <Karte className="divide-y divide-hairline">
      {sortiert.map((l) => {
        const ziel = ZIEL[l.bereich];
        return (
          <div key={l.id} className="flex items-start gap-3 px-4 py-3">
            <AmpelPunkt ampel={l.schwere} className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-heading">
                  {l.titel}
                </span>
                <StatusBadge ampel="grau">
                  {BEREICH_LABEL[l.bereich]}
                </StatusBadge>
              </div>
              <p className="mt-0.5 text-sm text-text-muted">{l.detail}</p>
              <p className="mt-1 text-xs text-foreground">
                Nächster Schritt: {l.naechsterSchritt}
              </p>
            </div>
            {ziel ? (
              ziel.startsWith("#") ? (
                <a
                  href={ziel}
                  className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  Erfassen <ArrowRight className="size-3.5" />
                </a>
              ) : (
                <Link
                  to={ziel}
                  className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  Öffnen <ArrowRight className="size-3.5" />
                </Link>
              )
            ) : null}
          </div>
        );
      })}
    </Karte>
  );
}

function FormularKarte({
  id,
  titel,
  text,
  children,
  onSubmit,
}: {
  id: string;
  titel: string;
  text: string;
  children: ReactNode;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <Karte id={id} className="mb-10 scroll-mt-20 p-5">
      <h2 className="text-[15px] font-semibold text-heading">{titel}</h2>
      <p className="mb-4 mt-0.5 text-xs text-text-muted">{text}</p>
      <form className="space-y-3" onSubmit={onSubmit}>
        {children}
      </form>
    </Karte>
  );
}

function KontosaldoFormular({ daten }: { daten: BoardDaten }) {
  const speichern = useSpeichern();
  const konten = [...daten.bankAccounts].sort(
    (a, b) =>
      Number(a.saldoBekannt) - Number(b.saldoBekannt) ||
      a.companyId.localeCompare(b.companyId),
  );
  const [iban, setIban] = useState(konten[0]?.iban ?? "");
  const [stichtag, setStichtag] = useState(daten.stichtag);
  const [saldo, setSaldo] = useState("");
  const konto = konten.find((k) => k.iban === iban);
  const firma = (id: string) =>
    daten.companies.find((c) => c.id === id)?.shortName ?? id;

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    const betrag = parseDeutscheZahl(saldo);
    if (!konto || betrag === null) {
      toast.error("Bitte Konto und Saldo angeben.");
      return;
    }
    const ok = await speichern(
      () =>
        boardRepository().kontosaldoErfassen({
          iban: konto.iban,
          companyId: konto.companyId,
          stichtag,
          saldo: betrag,
          bankName: konto.bankName,
        }),
      `Saldo ${euro(betrag)} für ${firma(konto.companyId)} gespeichert`,
    );
    if (ok) setSaldo("");
  };

  return (
    <FormularKarte
      id="kontosaldo"
      titel="Kontosaldo erfassen"
      text="Für Konten ohne EBICS-Saldo. Ein Saldo genügt, ab dann rechnet das Board mit den Umsätzen weiter."
      onSubmit={(e) => void absenden(e)}
    >
      {konten.length === 0 ? (
        <p className="text-sm text-text-muted">Keine Konten vorhanden.</p>
      ) : (
        <>
          <label className="block text-xs text-text-muted">
            Konto
            <select
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className={`${FELD} cursor-pointer px-2`}
            >
              {konten.map((k) => (
                <option key={k.id} value={k.iban}>
                  {firma(k.companyId)} · {k.bankName} · …{k.iban.slice(-4)}
                  {k.saldoBekannt
                    ? ` (Saldo ${datum(k.saldoStichtag)})`
                    : " (kein Saldo)"}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-text-muted">
              Stichtag
              <input
                type="date"
                lang="de-DE"
                value={stichtag}
                max={daten.stichtag}
                onChange={(e) => setStichtag(e.target.value)}
                className={FELD}
              />
            </label>
            <label className="block text-xs text-text-muted">
              Saldo (€) laut Auszug
              <input
                inputMode="decimal"
                placeholder="z. B. 12.345,67"
                value={saldo}
                onChange={(e) => setSaldo(e.target.value)}
                className={`${FELD} tabular-nums`}
              />
            </label>
          </div>
          <Knopf type="submit" variante="primaer">
            Saldo speichern
          </Knopf>
        </>
      )}
    </FormularKarte>
  );
}

const PLAN_KATEGORIEN: Array<{
  wert: PlanpostenEingabe["kategorie"];
  label: string;
}> = [
  { wert: "personal", label: "Personal" },
  { wert: "steuern", label: "Steuern" },
  { wert: "rechnung", label: "Rechnung" },
  { wert: "projekt", label: "Projekt (Aufteiler)" },
  { wert: "ankauf", label: "Ankauf" },
  { wert: "verkauf", label: "Verkauf" },
  { wert: "intercompany", label: "Intercompany" },
  { wert: "sonstiges", label: "Sonstiges" },
];

function PlanpostenFormular({ daten }: { daten: BoardDaten }) {
  const speichern = useSpeichern();
  const firmen = daten.companies.filter((c) => !c.separateArea);
  const [companyId, setCompanyId] = useState(firmen[0]?.id ?? "");
  const [bezeichnung, setBezeichnung] = useState("");
  const [datumWert, setDatum] = useState(daten.stichtag);
  const [betrag, setBetrag] = useState("");
  const [richtung, setRichtung] = useState<"aus" | "ein">("aus");
  const [kategorie, setKategorie] =
    useState<PlanpostenEingabe["kategorie"]>("sonstiges");
  const [bis, setBis] = useState("");

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    const b = parseDeutscheZahl(betrag);
    if (!companyId || !bezeichnung.trim() || b === null || b <= 0) {
      toast.error("Bitte Gesellschaft, Bezeichnung und Betrag angeben.");
      return;
    }
    const ok = await speichern(
      () =>
        boardRepository().planpostenAnlegen({
          companyId,
          datum: datumWert,
          betrag: richtung === "aus" ? -b : b,
          bezeichnung: bezeichnung.trim(),
          kategorie,
          monatlichBis: bis || null,
        }),
      "Planposten angelegt",
    );
    if (ok) {
      setBezeichnung("");
      setBetrag("");
      setBis("");
    }
  };

  return (
    <FormularKarte
      id="planposten"
      titel="Planposten anlegen"
      text="Bekannte künftige Zahlungen, die noch nicht als Rechnung oder Darlehensrate im System sind: Gehälter, Steuern, Projektkosten."
      onSubmit={(e) => void absenden(e)}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-text-muted">
          Gesellschaft
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={`${FELD} cursor-pointer px-2`}
          >
            {firmen.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortName} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-text-muted">
          Kategorie
          <select
            value={kategorie}
            onChange={(e) =>
              setKategorie(e.target.value as PlanpostenEingabe["kategorie"])
            }
            className={`${FELD} cursor-pointer px-2`}
          >
            {PLAN_KATEGORIEN.map((k) => (
              <option key={k.wert} value={k.wert}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-text-muted">
        Bezeichnung
        <input
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          placeholder="z. B. Gehälter, Umsatzsteuer Q4"
          className={FELD}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-xs text-text-muted">
          Richtung
          <select
            value={richtung}
            onChange={(e) => setRichtung(e.target.value as "aus" | "ein")}
            className={`${FELD} cursor-pointer px-2`}
          >
            <option value="aus">Auszahlung</option>
            <option value="ein">Einzahlung</option>
          </select>
        </label>
        <label className="block text-xs text-text-muted">
          Betrag (€)
          <input
            inputMode="decimal"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            className={`${FELD} tabular-nums`}
          />
        </label>
        <label className="block text-xs text-text-muted">
          Datum
          <input
            type="date"
            lang="de-DE"
            value={datumWert}
            onChange={(e) => setDatum(e.target.value)}
            className={FELD}
          />
        </label>
      </div>
      <label className="block text-xs text-text-muted">
        Monatlich wiederholen bis (optional)
        <input
          type="date"
          lang="de-DE"
          value={bis}
          min={datumWert}
          onChange={(e) => setBis(e.target.value)}
          className={FELD}
        />
      </label>
      <Knopf type="submit" variante="primaer">
        Planposten anlegen
      </Knopf>
    </FormularKarte>
  );
}

function GesellschaftenFormular({ daten }: { daten: BoardDaten }) {
  const speichern = useSpeichern();
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});

  const mindestSpeichern = async (id: string) => {
    const roh = entwurf[id];
    if (roh === undefined) return;
    const betrag = roh.trim() === "" ? null : parseDeutscheZahl(roh);
    if (roh.trim() !== "" && (betrag === null || betrag < 0)) {
      toast.error("Ungültiger Betrag");
      return;
    }
    const ok = await speichern(
      () => boardRepository().mindestliquiditaetSetzen(id, betrag),
      betrag == null
        ? "Mindestliquidität entfernt"
        : `Mindestliquidität ${euro(betrag)} gespeichert`,
    );
    if (ok)
      setEntwurf((e) => {
        const { [id]: _weg, ...rest } = e;
        return rest;
      });
  };

  return (
    <Abschnitt
      titel="Gesellschaften"
      beschreibung="Segment und Mindestliquidität je Gesellschaft. Die Mindestliquidität ist der Puffer, unter dem die Liquidität rot wird."
      className="scroll-mt-20"
    >
      <Karte id="gesellschaften" className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-text-muted">
              <th className="px-4 py-2 font-medium">Gesellschaft</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 text-right font-medium">
                Mindestliquidität (€)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {daten.companies.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">
                  <div className="font-medium text-heading">{c.name}</div>
                  <div className="text-xs text-text-muted">
                    {c.id} · {c.shortName}
                    {c.separateArea ? " · getrennter Bereich" : ""}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <select
                    aria-label={`Segment ${c.shortName}`}
                    value={c.segment}
                    onChange={(e) =>
                      void speichern(
                        () =>
                          boardRepository().segmentSetzen(
                            c.id,
                            e.target.value as Segment,
                          ),
                        `Segment für ${c.shortName} gespeichert`,
                      )
                    }
                    className="h-8 cursor-pointer border border-hairline bg-surface px-2 text-sm text-foreground outline-none"
                  >
                    {SEGMENTE.map((s) => (
                      <option key={s} value={s}>
                        {SEGMENT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    {!c.minLiquidityGesetzt && entwurf[c.id] === undefined ? (
                      <StatusBadge ampel="gelb">nicht festgelegt</StatusBadge>
                    ) : null}
                    <input
                      aria-label={`Mindestliquidität ${c.shortName}`}
                      inputMode="decimal"
                      value={
                        entwurf[c.id] ??
                        (c.minLiquidityGesetzt
                          ? c.minLiquidity.toLocaleString("de-DE")
                          : "")
                      }
                      onChange={(e) =>
                        setEntwurf((x) => ({ ...x, [c.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void mindestSpeichern(c.id);
                      }}
                      className="h-8 w-32 border border-hairline bg-surface px-2.5 text-right text-sm tabular-nums text-foreground outline-none focus:border-input"
                    />
                    <Knopf
                      groesse="sm"
                      disabled={entwurf[c.id] === undefined}
                      onClick={() => void mindestSpeichern(c.id)}
                    >
                      Speichern
                    </Knopf>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </Abschnitt>
  );
}
