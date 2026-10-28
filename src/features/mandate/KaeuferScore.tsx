import type { KaeuferScore, Kreis } from "@/lib/matching/kaeufer-score";
import {
  KREIS_A,
  KREIS_B,
  KREIS_C,
  PUNKTE,
} from "@/lib/matching/kaeufer-score";

const KREIS_TEXT: Record<Kreis, string> = {
  A: "A",
  B: "B",
  C: "C",
  unter: "–",
  ausgeschlossen: "X",
};

const KREIS_KLASSE: Record<Kreis, string> = {
  A: "bg-brand text-white",
  B: "border border-brand text-brand-text",
  C: "border border-hairline text-text-muted",
  unter: "text-text-subtle",
  ausgeschlossen: "bg-surface-muted text-text-subtle line-through",
};

const KREIS_TITEL: Record<Kreis, string> = {
  A: `A-Kreis: Score ab ${KREIS_A}, Objektart und Region belegt`,
  B: `B-Kreis: Score ab ${KREIS_B}`,
  C: `C-Kreis: Score ab ${KREIS_C}`,
  unter: `Unter ${KREIS_C}`,
  ausgeschlossen: "Ausgeschlossen",
};

export function KreisMarke({ kreis }: { kreis: Kreis }) {
  return (
    <span
      title={KREIS_TITEL[kreis]}
      className={`inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs font-semibold ${KREIS_KLASSE[kreis]}`}
    >
      {KREIS_TEXT[kreis]}
    </span>
  );
}

/** Aufschlüsselung des Scores: Punkte je Baustein mit Begründung, Ausschluss und Abzüge. */
export function ScoreAufschluesselung({ b }: { b: KaeuferScore }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {b.ausschluss ? (
        <p className="font-medium text-warn">Ausgeschlossen: {b.ausschluss}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {b.bausteine.map((x) => (
          <li key={x.id} className="flex gap-3">
            <span className="w-36 shrink-0 text-text-subtle">{x.label}</span>
            <span
              className={`w-14 shrink-0 text-right tabular-nums ${x.belegt ? "" : "text-text-subtle"}`}
            >
              {x.punkte.toLocaleString("de-DE", { maximumFractionDigits: 1 })} /{" "}
              {x.max}
            </span>
            <span className={x.belegt ? "" : "text-text-subtle"}>
              {x.begruendung}
            </span>
          </li>
        ))}
      </ul>
      {b.hinweise.map((h) => (
        <p key={h} className="text-warn">
          {h}
        </p>
      ))}
    </div>
  );
}

/** Kurze Erklärung des Modells für den Seitenkopf. */
export function ScoreModellHinweis() {
  const teile = [
    `Objektart ${PUNKTE.objektart}`,
    `Region ${PUNKTE.region}`,
    `Volumen ${PUNKTE.volumen}`,
    `Faktor ${PUNKTE.faktor}`,
    `Ankaufsprofil ${PUNKTE.ankaufsprofil}`,
    `Aktivität 12 Monate ${PUNKTE.aktivitaet}`,
    `Deals/Interesse bei Grenz ${PUNKTE.historie}`,
    `Kontaktqualität ${PUNKTE.kontakt}`,
  ];
  return (
    <p className="text-xs text-text-subtle">
      Score 0 bis 100: {teile.join(", ")}. Fehlende Angaben zählen mit 40 %.
      A-Kreis ab {KREIS_A} mit belegter Objektart und Region, B ab {KREIS_B}, C
      ab {KREIS_C}. Ausgeschlossen: DO_NOT_CONTACT, Absage auf dieses Objekt,
      falsche Nutzung oder Region.
    </p>
  );
}
