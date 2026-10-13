import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { Knopf } from "@/components/board/Knopf";
import {
  Abschnitt,
  BuehnenKennzahl,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { StatusBadge } from "@/components/board/Status";
import type { MietEingang, Mietkonto } from "@/lib/db/mieten";
import {
  datum,
  euro,
  euroGanz,
  monat,
  monatKurz,
  prozent,
} from "@/lib/format/de";
import { heuteIso } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import { EingangPanel } from "./EingangPanel";
import {
  besterVorschlag,
  kontoHinweis,
  letzteMonate,
  monatsErster,
  monatsKennzahlen,
  rueckstaende,
  STUFE_AMPEL,
  STUFE_LABEL,
  ueberzahlungen,
} from "./logik/mieten";
import { MietkontoPanel } from "./MietkontoPanel";
import { useMieten, useMietenAktionen } from "./useMieten";
import { Zahlungsspiegel } from "./Zahlungsspiegel";

type Ansicht = "rueckstand" | "ueberzahlung" | "alle";

export function MietenSeite() {
  const mieten = useMieten();
  const filter = useGesellschaftsFilter();
  const aktionen = useMietenAktionen();
  const [ansicht, setAnsicht] = useState<Ansicht>("rueckstand");
  const [kontoId, setKontoId] = useState<string | null>(null);
  const [eingangId, setEingangId] = useState<string | null>(null);
  const [abgleich, setAbgleich] = useState(false);

  const heute = heuteIso();
  const monate = useMemo(() => letzteMonate(heute, 12), [heute]);
  const konten = useMemo(
    () => (mieten.data?.konten ?? []).filter((k) => filter.passt(k.companyId)),
    [mieten.data, filter],
  );
  const eingaenge = useMemo(
    () =>
      (mieten.data?.eingaenge ?? []).filter((e) => filter.passt(e.companyId)),
    [mieten.data, filter],
  );

  if (mieten.error)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Mieten nicht verfügbar"
        text={(mieten.error as Error).message}
      />
    );
  if (mieten.isLoading) return <SeitenSkelett />;
  if (mieten.data === null)
    return (
      <Leerzustand
        icon={SlidersHorizontal}
        titel="Mieten-Tracking ist noch nicht eingerichtet"
        text="Die Datenbank-Migration 20261013150000_mieten_tracking muss einmal eingespielt werden. Danach entstehen Sollstellung und Zuordnung automatisch."
      />
    );

  const aktuell = monatsErster(heute);
  const vormonat = monate[monate.length - 2];
  const diesen = monatsKennzahlen(konten, aktuell);
  // Vor dem Fälligkeitstag zeigt der Kopf den Vormonat (sonst wäre alles "offen")
  const kopfMonat = diesen.faellig
    ? diesen
    : monatsKennzahlen(konten, vormonat);
  const rueck = rueckstaende(konten);
  const ueber = ueberzahlungen(konten);
  const rueckSumme = rueck.reduce((s, k) => s + k.rueckstand, 0);
  const kritisch = rueck.filter((k) => k.stufe === "kuendigung_pruefen").length;
  const eingangSumme = eingaenge.reduce((s, e) => s + e.betrag, 0);

  const tabelle =
    ansicht === "rueckstand"
      ? rueck
      : ansicht === "ueberzahlung"
        ? ueber
        : konten;
  const konto = konten.find((k) => k.leaseId === kontoId) ?? null;
  const eingang = eingaenge.find((e) => e.bankbuchungId === eingangId) ?? null;

  const spalten: Spalte<Mietkonto>[] = [
    {
      id: "mieter",
      kopf: "Mieter",
      zelle: (k) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">{k.mieter}</div>
          <div className="truncate text-xs text-text-subtle">
            {k.objektName} · {k.einheitId}
          </div>
        </div>
      ),
      sortierWert: (k) => k.mieter.toLowerCase(),
    },
    {
      id: "soll",
      kopf: "Monatssoll",
      ausrichtung: "rechts",
      zelle: (k) => <span className="ziffern">{euro(k.monatssoll)}</span>,
      sortierWert: (k) => k.monatssoll,
      optional: true,
    },
    {
      id: "saldo",
      kopf: ansicht === "ueberzahlung" ? "Guthaben" : "Rückstand",
      ausrichtung: "rechts",
      zelle: (k) => (
        <span
          className={cn(
            "ziffern font-medium",
            k.saldo >= 1 ? "text-bad" : "text-heading",
          )}
        >
          {euro(Math.abs(k.saldo))}
        </span>
      ),
      sortierWert: (k) => k.saldo,
    },
    {
      id: "offen",
      kopf: "Offen seit",
      zelle: (k) =>
        k.offeneMonate ? (
          <span className="text-foreground">
            {monat(k.aeltesterOffenerMonat)}
            <span className="ml-1.5 text-xs text-text-subtle">
              {k.offeneMonate} {k.offeneMonate === 1 ? "Monat" : "Monate"}
            </span>
          </span>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
      sortierWert: (k) => k.aeltesterOffenerMonat,
    },
    {
      id: "letzte",
      kopf: "Letzte Zahlung",
      zelle: (k) =>
        k.letzteZahlungAm ? (
          <span className="ziffern text-text-muted">
            {datum(k.letzteZahlungAm)} · {euro(k.letzteZahlungBetrag)}
          </span>
        ) : (
          <span className="text-text-subtle">keine erkannt</span>
        ),
      sortierWert: (k) => k.letzteZahlungAm,
      optional: true,
    },
    {
      id: "stufe",
      kopf: "Status",
      zelle: (k) => (
        <div className="flex items-center gap-2">
          <StatusBadge ampel={STUFE_AMPEL[k.stufe]}>
            {STUFE_LABEL[k.stufe]}
          </StatusBadge>
          {k.anzahlZahlungen === 0 && !k.zahlerBekannt ? (
            <span
              className="text-xs text-text-subtle"
              title={kontoHinweis(k) ?? ""}
            >
              Zahler unbekannt
            </span>
          ) : null}
        </div>
      ),
      sortierWert: (k) => k.stufe,
    },
  ];

  return (
    <>
      <SeitenKopf
        titel="Mieten"
        unterzeile="Das Soll entsteht jeden Monat automatisch aus den Mietverträgen. Eingänge aus EBICS werden täglich zugeordnet, jede Zahlung tilgt die älteste offene Miete."
        aktionen={
          <Knopf
            disabled={abgleich}
            onClick={async () => {
              setAbgleich(true);
              await aktionen.abgleichen();
              setAbgleich(false);
            }}
          >
            <RefreshCw className={cn(abgleich && "animate-spin")} />
            Jetzt abgleichen
          </Knopf>
        }
      >
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <BuehnenKennzahl
            label={`Eingang ${monatKurz(kopfMonat.monat)}`}
            wert={prozent(kopfMonat.quote, 0)}
            hinweis={`${euroGanz(kopfMonat.bezahlt)} von ${euroGanz(kopfMonat.soll)}`}
            ampel={
              kopfMonat.quote >= 0.98
                ? "gruen"
                : kopfMonat.quote >= 0.9
                  ? "gelb"
                  : "rot"
            }
          />
          <BuehnenKennzahl
            label={`Offen ${monatKurz(kopfMonat.monat)}`}
            wert={euroGanz(kopfMonat.offen)}
            hinweis={
              diesen.faellig
                ? `${kopfMonat.offeneVertraege} von ${kopfMonat.vertraege} Verträgen`
                : `${monatKurz(aktuell)} fällig am ${datum(diesen.faelligAm)}`
            }
            ampel={kopfMonat.offeneVertraege ? "gelb" : "gruen"}
          />
          <BuehnenKennzahl
            label="Rückstand gesamt"
            wert={euroGanz(rueckSumme)}
            hinweis={
              rueck.length
                ? `${rueck.length} Mieter${kritisch ? ` · ${kritisch} Kündigung prüfen` : ""}`
                : "Alle Konten ausgeglichen"
            }
            ampel={kritisch ? "rot" : rueck.length ? "gelb" : "gruen"}
          />
          <BuehnenKennzahl
            label="Nicht zugeordnet"
            wert={String(eingaenge.length)}
            hinweis={
              eingaenge.length
                ? `${euroGanz(eingangSumme)} Eingänge prüfen`
                : "Alles zugeordnet"
            }
            ampel={eingaenge.length ? "gelb" : "gruen"}
          />
        </div>
      </SeitenKopf>

      <Abschnitt
        titel="Mietkonten"
        beschreibung="Rückstand = fälliges Soll minus Zahlungen. Fällig am 3. Werktag, drei Tage Banklaufzeit."
        aktionen={
          <Segmente
            label="Ansicht"
            wert={ansicht}
            onChange={setAnsicht}
            optionen={[
              { wert: "rueckstand", label: `Rückstand (${rueck.length})` },
              { wert: "ueberzahlung", label: `Überzahlung (${ueber.length})` },
              { wert: "alle", label: `Alle (${konten.length})` },
            ]}
          />
        }
      >
        <DatenTabelle
          label="Mietkonten"
          zeilen={tabelle}
          spalten={spalten}
          schluessel={(k) => k.leaseId}
          onZeileKlick={(k) => setKontoId(k.leaseId)}
          aktiveZeile={kontoId}
          suchText={(k) => `${k.mieter} ${k.einheitId} ${k.objektName}`}
          suchPlatzhalter="Mieter oder Einheit suchen"
          filter={[
            {
              id: "objekt",
              label: "Objekt",
              optionen: [
                ...new Map(konten.map((k) => [k.objektId, k.objektName])),
              ]
                .sort()
                .map(([wert, label]) => ({ wert, label })),
              passt: (k, w) => k.objektId === w,
            },
          ]}
          leer={
            <Leerzustand
              icon={CheckCircle2}
              titel={
                ansicht === "rueckstand" ? "Kein Rückstand" : "Nichts gefunden"
              }
              text={
                ansicht === "rueckstand"
                  ? "Alle fälligen Mieten sind bezahlt."
                  : "Für diese Auswahl gibt es keine Mietkonten."
              }
              kompakt
            />
          }
        />
      </Abschnitt>

      <Abschnitt
        titel="Nicht zugeordnete Eingänge"
        beschreibung="Einmal zugeordnet, merkt sich das System den Zahler und ordnet künftige und frühere Zahlungen selbst zu."
      >
        {eingaenge.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-surface schatten-karte">
            <Leerzustand
              icon={Inbox}
              titel="Alles zugeordnet"
              text="Jeder Mieteingang ist einem Vertrag zugeordnet."
              kompakt
            />
          </div>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface schatten-karte">
            {eingaenge.map((e) => (
              <EingangZeile
                key={e.bankbuchungId}
                e={e}
                konten={konten}
                onOeffnen={() => setEingangId(e.bankbuchungId)}
                onZuordnen={(leaseId) =>
                  void aktionen.zuordnen(e.bankbuchungId, [leaseId], true)
                }
              />
            ))}
          </ul>
        )}
      </Abschnitt>

      <Abschnitt
        titel="Zahlungsspiegel"
        beschreibung={`${monat(monate[0])} bis ${monat(monate.at(-1))} · Klick auf einen Mieter öffnet das Mietkonto`}
      >
        <Zahlungsspiegel
          konten={konten}
          monate={monate}
          onKlick={(k) => setKontoId(k.leaseId)}
        />
      </Abschnitt>

      <MietkontoPanel konto={konto} onSchliessen={() => setKontoId(null)} />
      <EingangPanel
        eingang={eingang}
        konten={konten}
        onSchliessen={() => setEingangId(null)}
      />
    </>
  );
}

function EingangZeile({
  e,
  konten,
  onOeffnen,
  onZuordnen,
}: {
  e: MietEingang;
  konten: Mietkonto[];
  onOeffnen: () => void;
  onZuordnen: (leaseId: string) => void;
}) {
  const v = besterVorschlag(e, konten);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="ziffern w-20 shrink-0 text-sm text-text-muted">
        {datum(e.datum)}
      </span>
      <button
        type="button"
        onClick={onOeffnen}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <span className="block truncate text-sm text-foreground">
          {e.zahler || "Unbekannter Zahler"}
          {e.sammelzahler ? (
            <span className="ml-2 text-xs text-text-subtle">Amt</span>
          ) : null}
          {e.entscheidung === "pruefen" ? (
            <span className="ml-2 text-xs text-text-subtle">
              zurückgestellt
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-text-subtle">
          {e.zweck}
        </span>
      </button>
      <span className="ziffern shrink-0 text-sm font-medium text-heading">
        {euro(e.betrag)}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {v ? (
          <Knopf
            groesse="sm"
            variante="sekundaer"
            title={`Vorschlag: ${v.gruende.join(", ")}`}
            onClick={() => onZuordnen(v.konto.leaseId)}
          >
            <ArrowRight />
            {v.konto.mieter.length > 22
              ? `${v.konto.mieter.slice(0, 21)}…`
              : v.konto.mieter}
          </Knopf>
        ) : null}
        <Knopf groesse="sm" variante="geist" onClick={onOeffnen}>
          Bearbeiten
        </Knopf>
      </div>
    </li>
  );
}
