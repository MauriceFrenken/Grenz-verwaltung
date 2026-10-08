import { Countdown, type LosKarteProps } from "@/components/board/Auktion";
import type { Ampel } from "@/components/board/ampel";
import { plusTage, type IsoDatum } from "@/lib/kalender";
import { PHASE_LABEL, type Ankauf } from "@/lib/db/transaktionen";
import { MASCHINEN_STATUS_LABEL } from "@/lib/db/typen";
import { datum, euroKompakt } from "@/lib/format/de";
import type { MaschinenKennzahlen } from "@/modules/baumaschinen/logik/baumaschinen";
import type { Frist } from "./logik/antworten";

export type SaalLos = LosKarteProps & {
  sortierung: string;
  dringlichkeit: number;
};

/**
 * Die nächsten „Lose“ für das Cockpit: Darlehensfristen, Deals mit nächstem
 * Schritt und Maschinen mit langer Standzeit, nach Dringlichkeit sortiert.
 */
export function saalLose({
  stichtag,
  fristen,
  ankaeufe,
  maschinen,
  kurzName,
}: {
  stichtag: IsoDatum;
  fristen: Frist[];
  ankaeufe: Ankauf[];
  maschinen: MaschinenKennzahlen[];
  kurzName: (id: string | null) => string;
}): SaalLos[] {
  const lose: SaalLos[] = [];
  const in30 = plusTage(stichtag, 30);

  for (const f of fristen) {
    const ampel: Ampel = f.datum <= in30 ? "rot" : "gelb";
    lose.push({
      los: f.stand.loan.id,
      titel: `${f.ereignis === "Ende" ? "Darlehen endet" : "Zinsbindung endet"}`,
      untertitel: `${kurzName(f.stand.loan.lenderCompanyId)} → ${kurzName(f.stand.loan.borrowerCompanyId)} · ${datum(f.datum)}`,
      wert: euroKompakt(f.stand.restschuld),
      wertLabel: "Restschuld",
      uhr: <Countdown ziel={f.datum} stichtag={stichtag} />,
      uhrLabel: "Frist",
      ampel,
      status: "Darlehen",
      schritt: "Anschlussfinanzierung oder Rückzahlung klären",
      href: "/board/darlehen",
      search: { darlehen: f.stand.loan.id },
      sortierung: f.datum,
      dringlichkeit: ampel === "rot" ? 0 : 1,
    });
  }

  for (const a of ankaeufe) {
    if (a.phase === "gekauft" || a.phase === "abgesagt") continue;
    if (!a.naechsterSchrittAm) continue;
    const ueber = a.naechsterSchrittAm < stichtag;
    lose.push({
      los: a.id,
      titel: a.name,
      untertitel: [a.ort, a.makler].filter(Boolean).join(" · "),
      wert: euroKompakt(a.angebotspreis),
      wertLabel: "Angebotspreis",
      uhr: <Countdown ziel={a.naechsterSchrittAm} stichtag={stichtag} />,
      uhrLabel: "nächster Schritt",
      ampel: ueber ? "rot" : "gelb",
      status: PHASE_LABEL[a.phase],
      schritt: a.naechsterSchritt ?? "nächsten Schritt festlegen",
      href: "/board/transaktionen",
      sortierung: a.naechsterSchrittAm,
      dringlichkeit: ueber ? 0 : 2,
    });
  }

  for (const m of maschinen) {
    if (m.lagerTage == null || m.lagerTage < 90) continue;
    lose.push({
      los: m.machine.id,
      titel: `${m.machine.hersteller} ${m.machine.modell}`,
      untertitel: [
        m.machine.kategorie,
        m.machine.baujahr && `Bj. ${m.machine.baujahr}`,
      ]
        .filter(Boolean)
        .join(" · "),
      wert: euroKompakt(m.einstand),
      wertLabel: "Einstand",
      uhr: `${m.lagerTage} T`,
      uhrLabel: "Standzeit",
      ampel: m.ampel,
      status: MASCHINEN_STATUS_LABEL[m.machine.status],
      schritt:
        m.lagerTage >= 180
          ? "Preis senken oder in die Auktion geben"
          : "nächste Preisstufe ab Tag 90 prüfen",
      href: "/board/baumaschinen",
      sortierung: plusTage(stichtag, -m.lagerTage),
      dringlichkeit: m.ampel === "rot" ? 0 : 1,
    });
  }

  return lose.sort(
    (x, y) =>
      x.dringlichkeit - y.dringlichkeit ||
      x.sortierung.localeCompare(y.sortierung),
  );
}
