import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { ChecklistenTyp, Mitarbeiter } from "@/lib/personal/typen";

import { Auswahl, Kasten } from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

const TITEL: Record<ChecklistenTyp, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};

function Liste({
  k,
  m,
  typ,
}: {
  k: PersonalKontext;
  m: Mitarbeiter;
  typ: ChecklistenTyp;
}) {
  const { daten, ausfuehren } = k;
  const [neu, setNeu] = useState("");
  const punkte = daten.checkpunkte
    .filter((p) => p.mitarbeiterId === m.id && p.typ === typ)
    .sort((a, b) => a.reihenfolge - b.reihenfolge);
  const erledigt = punkte.filter((p) => p.erledigtAm).length;

  return (
    <Kasten
      titel={`${TITEL[typ]}${punkte.length ? ` (${erledigt} von ${punkte.length} erledigt)` : ""}`}
      aktion={
        punkte.length === 0 && daten.verwalten ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void ausfuehren({
                typ: "checkliste_starten",
                mitarbeiterId: m.id,
                checkliste: typ,
              })
            }
          >
            {TITEL[typ]} starten
          </Button>
        ) : null
      }
    >
      {punkte.length === 0 ? (
        <p className="text-sm text-text-muted">
          {typ === "onboarding"
            ? "Für neue Mitarbeiter: Vertrag, Zugänge, Unterweisungen, Ausstattung."
            : "Beim Austritt: Übergabe, Zugänge sperren, Rückgabe, Zeugnis."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {punkte.map((p) => (
            <li key={p.id} className="group flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(p.erledigtAm)}
                disabled={!daten.verwalten}
                onChange={(e) =>
                  void ausfuehren({
                    typ: "checkpunkt_umschalten",
                    id: p.id,
                    erledigt: e.target.checked,
                  })
                }
              />
              <span
                className={p.erledigtAm ? "text-text-subtle line-through" : ""}
              >
                {p.punkt}
              </span>
              {p.erledigtAm ? (
                <span className="ml-auto shrink-0 text-xs text-text-subtle">
                  {formatDate(p.erledigtAm)}
                </span>
              ) : null}
              {daten.verwalten ? (
                <button
                  type="button"
                  aria-label="Punkt entfernen"
                  className={`${p.erledigtAm ? "" : "ml-auto"} shrink-0 text-text-subtle opacity-0 group-hover:opacity-100`}
                  onClick={() =>
                    void ausfuehren({ typ: "checkpunkt_loeschen", id: p.id })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {punkte.length > 0 && daten.verwalten ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!neu.trim()) return;
            if (
              await ausfuehren({
                typ: "checkpunkt_hinzufuegen",
                mitarbeiterId: m.id,
                checkliste: typ,
                punkt: neu,
              })
            )
              setNeu("");
          }}
        >
          <Input
            value={neu}
            placeholder="Weiterer Punkt"
            onChange={(e) => setNeu(e.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            variant="outline"
            aria-label="Punkt hinzufügen"
          >
            <Plus className="size-4" />
          </Button>
        </form>
      ) : null}
    </Kasten>
  );
}

export function ChecklistenTab({ k }: { k: PersonalKontext }) {
  const { daten } = k;
  const auswahl = daten.mitarbeiter.filter((m) => m.vollstaendig);
  // Vorauswahl: wer zuletzt eingetreten ist bzw. die eigene Akte.
  const vorschlag =
    auswahl.find((m) => m.id === daten.ichId && !daten.verwalten) ??
    [...auswahl].sort((a, b) =>
      (b.eintrittAm ?? "").localeCompare(a.eintrittAm ?? ""),
    )[0];
  const [id, setId] = useState(vorschlag?.id ?? "");
  const m = auswahl.find((x) => x.id === id) ?? vorschlag;
  if (!m)
    return (
      <p className="text-sm text-text-muted">Noch keine Mitarbeiterakten.</p>
    );

  return (
    <div className="flex flex-col gap-4">
      {daten.verwalten ? (
        <div className="max-w-sm">
          <Auswahl
            wert={m.id}
            optionen={auswahl.map((x) => ({ wert: x.id, label: x.name }))}
            onChange={(w) => setId(w)}
          />
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Liste k={k} m={m} typ="onboarding" />
        <Liste k={k} m={m} typ="offboarding" />
      </div>
    </div>
  );
}
