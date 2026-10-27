import { Link } from "@tanstack/react-router";

import { prozent } from "@/features/kennzahlen/hilfen";
import { aktivitaetenSicht } from "@/lib/akquise/berechnen";
import type {
  AkquiseDto,
  AktivitaetenSicht,
  Massnahme,
} from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Stand = "läuft" | "ausbaufähig" | "offen";

type Massnahmenkarte = {
  titel: string;
  was: string;
  praxis: string;
  kennzahl: (d: AkquiseDto) => { wert: string; text: string; stand: Stand };
  link?: { to: string; label: string };
};

const sichten = new WeakMap<AkquiseDto, AktivitaetenSicht>();

/** Erledigte Aktivitäten einer Maßnahme in den letzten 12 Monaten, alle Bereiche. */
function jahr(d: AkquiseDto, m: Massnahme): number {
  let sicht = sichten.get(d);
  if (!sicht) {
    sicht = aktivitaetenSicht(
      d.aktivitaeten.verlauf,
      { monate: 12, person: null, bereich: null },
      d.stand.slice(0, 10),
    );
    sichten.set(d, sicht);
  }
  return sicht.summen.find((s) => s.massnahme === m)?.zeitraum ?? 0;
}

/**
 * Wie ein Gewerbe- und Anlagemakler Verkäufer gewinnt, jeweils mit dem Stand bei Grenz
 * aus Salesforce. Reihenfolge: vom Massenkanal zum persönlichen Kontakt.
 */
const MASSNAHMEN: Massnahmenkarte[] = [
  {
    titel: "Eigentümer-Recherche",
    was: "Bestandshalter von Zinshäusern und Gewerbeobjekten im Zielgebiet ermitteln (Grundbuch über berechtigtes Interesse, Handelsregister, Vor-Ort-Begehung) und als Lead anlegen.",
    praxis:
      "Fester Wochenrhythmus: Desktop-Recherche, dann Vor-Ort-Prüfung, erst dann Anschreiben. Einfamilienhäuser und Makler früh aussortieren.",
    kennzahl: (d) => {
      const pool = d.pool.reduce((s, p) => s + p.anzahl, 0);
      const bereit =
        d.pool.find((p) => p.status === "Onsite Research finalized")?.anzahl ??
        0;
      return {
        wert: formatInt(pool),
        text: `Eigentümer im Pool, davon ${formatInt(bereit)} fertig recherchiert und bereit zum Anschreiben`,
        stand: "läuft",
      };
    },
  },
  {
    titel: "Persönliches Eigentümer-Anschreiben",
    was: "Individueller Brief an den Eigentümer mit Bezug auf sein Objekt, Marktlage und eine konkrete Gesprächseinladung (Werteinschätzung).",
    praxis:
      "Branchenüblich antworten 1 bis 3 % direkt, mit telefonischem Nachfassen deutlich mehr. Zweitbrief nach 6 bis 12 Monaten mit neuem Anlass (Zinsen, Vergleichsverkauf).",
    kennzahl: (d) => ({
      wert: formatInt(d.anschreiben.versendet12m),
      text: `Briefe versendet in 12 Monaten (${formatInt(d.anschreiben.offen)} weitere vorbereitet) · Reaktionsquote ${prozent(d.anschreiben.reaktionsquote, 1)}`,
      stand: d.anschreiben.versendet12m > 0 ? "läuft" : "offen",
    }),
    link: {
      to: "/akquise/anschreiben",
      label: "Auswertung Anschreiben",
    },
  },
  {
    titel: "Telefonisches Nachfassen",
    was: "Zwei bis drei Wochen nach dem Brief anrufen, solange der Brief präsent ist. Ziel: Termin zur Einwertung, nicht der Verkauf am Telefon.",
    praxis:
      "Der wirksamste Hebel der Brief-Akquise. Jede Antwort im Lead-Status festhalten, damit Absagegründe auswertbar bleiben.",
    kennzahl: (d) => ({
      wert: prozent(d.anschreiben.nachfassquote),
      text: `der Briefe nachgefasst · ${formatInt(d.nachfassen.gesamt)} Briefe warten auf einen Anruf`,
      stand: (d.anschreiben.nachfassquote ?? 0) >= 50 ? "läuft" : "ausbaufähig",
    }),
    link: { to: "/akquise/anschreiben", label: "Nachfassliste" },
  },
  {
    titel: "Wiedervorlage mit Anlass",
    was: "„Heute nicht“ ist kein Nein: Spekulationsfrist, Erbfall, Mieterwechsel oder Refinanzierung sind Anlässe, zu denen ein Eigentümer verkaufen will.",
    praxis:
      "Absagegrund und Wiedervorlagedatum immer pflegen. Vor Fristende anrufen, nicht danach.",
    kennzahl: (d) => ({
      wert: formatInt(d.wiedervorlagen.gesamt),
      text: `offene Wiedervorlagen, davon ${formatInt(d.wiedervorlagen.ueberfaellig)} überfällig`,
      stand: d.wiedervorlagen.ueberfaellig > 10 ? "ausbaufähig" : "läuft",
    }),
    link: { to: "/aufgaben", label: "Wiedervorlagen im Aufgabenboard" },
  },
  {
    titel: "Kostenlose Einwertung als Türöffner",
    was: "Fundierte Werteinschätzung mit Vergleichsdaten anbieten. Das ist der übliche Einstieg in den Alleinauftrag.",
    praxis:
      "Einwertung persönlich vorstellen, innerhalb einer Woche nachhaken, Maklervertrag direkt mitbringen.",
    kennzahl: (d) => ({
      wert: formatInt(jahr(d, "akquise_termin")),
      text: `Objektaufnahmen/Einwertungstermine in 12 Monaten · ${formatInt(d.mandate.einwertung)} Mandate in Einwertung`,
      stand: jahr(d, "akquise_termin") > 0 ? "läuft" : "ausbaufähig",
    }),
    link: { to: "/tools/marktpreis", label: "Marktpreisanalyse" },
  },
  {
    titel: "Ruhende und verlorene Mandate",
    was: "Eigentümer, die schon einmal verkaufen wollten, sind die wärmsten Kontakte. Verlorene Mandate nach 6 bis 12 Monaten erneut ansprechen.",
    praxis:
      "Verlustgrund pflegen; bei „später“ eine Wiedervorlage setzen. Gescheiterte Fremdvermarktungen im Markt beobachten.",
    kennzahl: (d) => ({
      wert: formatInt(d.mandate.verloren),
      text: `verlorene Mandate · ${formatInt(d.mandate.akquisition)} in Akquisition`,
      stand: "ausbaufähig",
    }),
    link: {
      to: "/akquise/potenzial",
      label: "Potenzial aus Salesforce",
    },
  },
  {
    titel: "Käufer von heute, Verkäufer von morgen",
    was: "Investoren, die über Grenz gekauft haben, halten Bestand und verkaufen typischerweise nach fünf bis zehn Jahren oder bei Portfolio-Umschichtung.",
    praxis:
      "Jährliches Bestandsgespräch: Welche Objekte halten Sie, was soll raus? Ankaufsprofile und Verkaufsabsichten gemeinsam pflegen.",
    kennzahl: (d) => ({
      wert: formatInt(d.kaeuferBestand),
      text: "Käufer aus Grenz-Deals als künftige Verkäufer",
      stand: d.kaeuferBestand > 0 ? "ausbaufähig" : "offen",
    }),
  },
  {
    titel: "Markt-Radar",
    was: "Täglich Immobiliennews nach Verkaufsanlässen filtern: Insolvenzen, Nachfolge, Portfolio-Bereinigung, Leerstand, Sale-and-Lease-back.",
    praxis:
      "Treffer innerhalb einer Woche ansprechen und als Lead in Salesforce anlegen, damit der Erfolg messbar wird.",
    kennzahl: () => ({
      wert: "täglich",
      text: "automatische Suche, Treffer unter Verkäufer › Markt-Radar",
      stand: "läuft",
    }),
    link: { to: "/akquise/radar", label: "Markt-Radar" },
  },
  {
    titel: "Tippgeber-Netzwerk",
    was: "Banken, Steuerberater, Notare, Hausverwaltungen, Insolvenzverwalter und Sachwalter erfahren früh von Verkaufsabsichten.",
    praxis:
      "Feste Ansprechpartner je Institution, Tippgeberprovision regeln, Quelle im Lead-Feld „Lead-Quelle“ als Empfehlung pflegen.",
    kennzahl: () => ({
      wert: "–",
      text: "Empfehlungen werden in Salesforce noch nicht als Quelle erfasst",
      stand: "offen",
    }),
  },
  {
    titel: "Referenz- und Marktbericht-Mailing",
    was: "„Verkauft in Ihrer Nachbarschaft“ nach jedem Abschluss und ein halbjährlicher Marktbericht an Eigentümer im Pool halten Grenz präsent.",
    praxis:
      "Eigentümer im Umkreis eines verkauften Objekts gezielt anschreiben; Marktbericht als PDF anhängen.",
    kennzahl: (d) => ({
      wert: formatInt(d.anschreiben.leadsAngeschrieben),
      text: "angeschriebene Eigentümer könnten den Marktbericht erhalten",
      stand: "offen",
    }),
    link: { to: "/tools/marktbericht", label: "Marktbericht" },
  },
  {
    titel: "Veranstaltungen und Sichtbarkeit",
    was: "Eigentümer-Abende, IHK- und Verbandstermine, Expo Real; dazu LinkedIn-Beiträge zu Abschlüssen und Marktdaten.",
    praxis:
      "Teilnehmer als Kampagne in Salesforce erfassen, damit Folgekontakte zugeordnet werden können.",
    kennzahl: () => ({
      wert: "–",
      text: "Akquise-Veranstaltungen werden in Salesforce nicht erfasst",
      stand: "offen",
    }),
  },
];

const STAND_STIL: Record<Stand, string> = {
  läuft: "bg-[var(--gc-navy)] text-white",
  ausbaufähig: "bg-[var(--gc-hellblau)] text-heading",
  offen: "bg-surface-muted text-text-muted",
};

/** Akquise › Maßnahmen: Best Practice der Verkäuferakquise mit dem Stand bei Grenz. */
export function MassnahmenTab({ daten }: { daten: AkquiseDto }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {MASSNAHMEN.map((m) => {
        const k = m.kennzahl(daten);
        return (
          <section
            key={m.titel}
            className="flex flex-col gap-3 border border-hairline bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-medium text-heading">
                {m.titel}
              </h2>
              <span
                className={cn(
                  "shrink-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  STAND_STIL[k.stand],
                )}
              >
                {k.stand}
              </span>
            </div>
            <p className="text-sm text-text-muted">{m.was}</p>
            <div className="flex items-baseline gap-3 border-l-[3px] border-l-[var(--gc-hellblau)] pl-3">
              <span className="text-2xl font-light tabular-nums text-heading">
                {k.wert}
              </span>
              <span className="text-xs text-text-muted">{k.text}</span>
            </div>
            <p className="text-sm">
              <span className="font-medium text-heading">So geht es gut: </span>
              {m.praxis}
            </p>
            {m.link ? (
              <Link
                to={m.link.to}
                className="text-sm text-heading underline-offset-2 hover:underline"
              >
                {m.link.label} →
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
