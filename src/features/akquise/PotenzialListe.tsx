import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { PotenzialEintrag } from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Ladehinweis, SfVerweis, StandLeiste } from "./bausteine";
import { datum } from "./hilfen";
import { useAkquiseDaten } from "./useAkquiseDaten";

const QUELLEN = [
  "Alle",
  "Eigentümer-Lead",
  "Mandat",
  "Kontakt",
  "Käufer",
] as const;

function Score({ wert }: { wert: number }) {
  const ton =
    wert >= 60
      ? "bg-brand text-white"
      : wert >= 35
        ? "bg-[var(--gc-hellblau)] text-heading"
        : "bg-surface-muted text-text-muted";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
        ton,
      )}
      title="Verkaufswahrscheinlichkeit nach Salesforce-Signalen (0 bis 100)"
    >
      {wert}
    </span>
  );
}

function Zeile({ e }: { e: PotenzialEintrag }) {
  return (
    <li className="flex gap-4 border-t border-hairline px-5 py-4">
      <Score wert={e.score} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            <SfVerweis typ={e.sf.typ} id={e.sf.id}>
              {e.name}
            </SfVerweis>
          </span>
          {e.firma ? (
            <span className="text-sm text-text-muted">{e.firma}</span>
          ) : null}
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {e.quelle}
          </span>
        </div>
        {e.ort ? <div className="text-xs text-text-muted">{e.ort}</div> : null}
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {e.signale.map((s) => (
            <li
              key={s.text}
              className="border border-hairline bg-surface px-2 py-0.5 text-xs text-heading"
              title={`+${s.punkte} Punkte`}
            >
              {s.text}
            </li>
          ))}
        </ul>
        <div className="mt-1 text-sm">
          <span className="text-text-muted">Nächster Schritt: </span>
          {e.naechsterSchritt}
        </div>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-text-muted sm:block">
        <div>Letzte Aktivität</div>
        <div className="text-heading">{datum(e.letzteAktivitaetAm)}</div>
      </div>
    </li>
  );
}

/** Verkäufer-Potenzial aus Salesforce: warme Eigentümer, Mandate in Anbahnung, Bestandshalter. */
export function PotenzialListe() {
  const { daten, laedt, fehler, neuLaden } = useAkquiseDaten();
  const [quelle, setQuelle] = useState<(typeof QUELLEN)[number]>("Alle");
  const [suche, setSuche] = useState("");

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (daten?.potenzial ?? []).filter(
      (e) =>
        (quelle === "Alle" || e.quelle === quelle) &&
        (!q ||
          [e.name, e.firma, e.ort, ...e.signale.map((s) => s.text)]
            .filter(Boolean)
            .some((t) => t!.toLowerCase().includes(q))),
    );
  }, [daten, quelle, suche]);

  return (
    <div className="flex flex-col gap-4">
      <StandLeiste
        daten={daten}
        laedt={laedt}
        fehler={fehler}
        onNeuLaden={() => void neuLaden()}
      />
      {!daten ? (
        <Ladehinweis laedt={laedt} fehler={fehler} />
      ) : (
        <section className="border border-hairline bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-heading">
                Mögliche Verkäufer aus Salesforce ({formatInt(liste.length)})
              </h2>
              <p className="text-xs text-text-muted">
                Bewertet nach Lead-Status, Reaktion auf Anschreiben, Absagen mit
                Perspektive (z. B. Spekulationsfrist), Mandaten in
                Akquisition/Einwertung, verlorenen Mandaten und Käufern aus
                Grenz-Deals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {QUELLEN.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuelle(q)}
                    className={cn(
                      "border px-2.5 py-1 text-xs",
                      quelle === q
                        ? "border-[var(--gc-navy)] bg-[var(--gc-navy)] text-white"
                        : "border-hairline text-text-muted hover:text-heading",
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <Input
                className="w-56"
                placeholder="Name, Ort, Signal"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
            </div>
          </div>
          {liste.length ? (
            <ul>
              {liste.map((e) => (
                <Zeile key={e.schluessel} e={e} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-hairline px-5 py-4 text-sm text-text-muted">
              Keine Treffer.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
