import { useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { checklistenStand } from "@/lib/aufgaben/logik";
import {
  PRIORITAETEN,
  type Aufgabe,
  type AufgabeFelder,
  type MandatKurz,
  type Person,
  type Spalte,
} from "@/lib/aufgaben/typen";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { FELD } from "./bausteine";

function felderVon(a: Aufgabe): AufgabeFelder {
  return {
    titel: a.titel,
    beschreibung: a.beschreibung,
    verantwortlichId: a.verantwortlichId,
    faelligAm: a.faelligAm,
    prioritaet: a.prioritaet,
    ruecksprache: a.ruecksprache,
    ruecksprachAm: a.ruecksprachAm,
    mandatSfId: a.mandatSfId,
    checkliste: a.checkliste,
  };
}

export function AufgabeDialog({
  aufgabe,
  spalten,
  personen,
  mandate,
  ruecksprachen,
  onSchliessen,
  onSpeichern,
  onVerschieben,
  onLoeschen,
}: {
  aufgabe: Aufgabe;
  spalten: Spalte[];
  personen: Person[];
  mandate: MandatKurz[];
  ruecksprachen: string[];
  onSchliessen: () => void;
  onSpeichern: (id: string, felder: AufgabeFelder) => Promise<void>;
  onVerschieben: (id: string, spalteId: string) => Promise<void>;
  onLoeschen: (id: string) => Promise<void>;
}) {
  // Der Aufrufer setzt key={aufgabe.id}: Verschieben in eine andere Spalte behält die Eingaben.
  const [f, setF] = useState<AufgabeFelder>(() => felderVon(aufgabe));
  const [neuerPunkt, setNeuerPunkt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loeschenFragen, setLoeschenFragen] = useState(false);

  const set = <K extends keyof AufgabeFelder>(k: K, v: AufgabeFelder[K]) =>
    setF((alt) => ({ ...alt, [k]: v }));
  const liste = checklistenStand(f.checkliste);
  const ersteller = personen.find((p) => p.id === aufgabe.erstelltVon);
  // Mandat aus einer abgeschlossenen Phase bleibt wählbar, auch wenn es nicht mehr offen ist.
  const mandatListe =
    f.mandatSfId && !mandate.some((m) => m.sfId === f.mandatSfId)
      ? [{ sfId: f.mandatSfId, name: f.mandatSfId }, ...mandate]
      : mandate;

  const punktHinzu = () => {
    const text = neuerPunkt.trim();
    if (!text) return;
    set("checkliste", [
      ...f.checkliste,
      { id: crypto.randomUUID(), text, erledigt: false },
    ]);
    setNeuerPunkt("");
  };

  const speichern = async () => {
    setBusy(true);
    try {
      await onSpeichern(aufgabe.id, f);
      onSchliessen();
    } catch {
      // Meldung kommt aus onSpeichern.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Aufgabe bearbeiten</DialogTitle>
          <DialogDescription className="text-xs">
            Angelegt am {formatDate(aufgabe.createdAt)}
            {ersteller ? ` von ${ersteller.name}` : ""}
            {aufgabe.erledigtAm
              ? ` · erledigt am ${formatDate(aufgabe.erledigtAm)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <input
            aria-label="Titel"
            className="w-full border-b border-hairline bg-transparent pb-2 text-lg font-light text-heading focus:border-brand focus:outline-none"
            value={f.titel}
            onChange={(e) => set("titel", e.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Spalte
              <select
                className={FELD}
                value={aufgabe.spalteId}
                onChange={(e) => void onVerschieben(aufgabe.id, e.target.value)}
              >
                {spalten.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Verantwortlich
              <select
                className={FELD}
                value={f.verantwortlichId ?? ""}
                onChange={(e) =>
                  set("verantwortlichId", e.target.value || null)
                }
              >
                <option value="">Niemand</option>
                {personen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Fällig am
              <input
                type="date"
                className={FELD}
                value={f.faelligAm ?? ""}
                onChange={(e) => set("faelligAm", e.target.value || null)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Priorität
              <select
                className={FELD}
                value={f.prioritaet}
                onChange={(e) =>
                  set(
                    "prioritaet",
                    e.target.value as AufgabeFelder["prioritaet"],
                  )
                }
              >
                {PRIORITAETEN.map((p) => (
                  <option key={p.wert} value={p.wert}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Rücksprache
              <input
                className={FELD}
                list="aufgaben-ruecksprachen"
                placeholder="z. B. Jour fixe"
                value={f.ruecksprache}
                onChange={(e) => set("ruecksprache", e.target.value)}
              />
              <datalist id="aufgaben-ruecksprachen">
                {ruecksprachen.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Datum der Rücksprache
              <input
                type="date"
                className={FELD}
                value={f.ruecksprachAm ?? ""}
                onChange={(e) => set("ruecksprachAm", e.target.value || null)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2">
              Mandat
              <select
                className={FELD}
                value={f.mandatSfId ?? ""}
                onChange={(e) => set("mandatSfId", e.target.value || null)}
              >
                <option value="">Kein Mandat</option>
                {mandatListe.map((m) => (
                  <option key={m.sfId} value={m.sfId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Beschreibung
            <Textarea
              rows={5}
              placeholder="Was genau ist zu tun, was wurde in der Rücksprache besprochen?"
              value={f.beschreibung}
              onChange={(e) => set("beschreibung", e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Checkliste</span>
              {liste.gesamt > 0 && (
                <span>
                  {liste.erledigt} von {liste.gesamt} erledigt
                </span>
              )}
            </div>
            {liste.gesamt > 0 && (
              <div className="h-1 bg-surface-muted">
                <div
                  className="h-1 bg-brand transition-all"
                  style={{ width: `${(liste.erledigt / liste.gesamt) * 100}%` }}
                />
              </div>
            )}
            {f.checkliste.map((p) => (
              <div key={p.id} className="group flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--gc-navy)]"
                  checked={p.erledigt}
                  onChange={(e) =>
                    set(
                      "checkliste",
                      f.checkliste.map((x) =>
                        x.id === p.id
                          ? { ...x, erledigt: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />
                <span
                  className={cn(
                    "flex-1",
                    p.erledigt && "text-text-muted line-through",
                  )}
                >
                  {p.text}
                </span>
                <button
                  type="button"
                  aria-label="Punkt entfernen"
                  className="text-text-muted opacity-0 hover:text-heading group-hover:opacity-100"
                  onClick={() =>
                    set(
                      "checkliste",
                      f.checkliste.filter((x) => x.id !== p.id),
                    )
                  }
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                className={FELD}
                placeholder="Punkt hinzufügen"
                value={neuerPunkt}
                onChange={(e) => setNeuerPunkt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    punktHinzu();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={punktHinzu}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {loeschenFragen ? (
            <span className="flex items-center gap-2 text-sm">
              Wirklich löschen?
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onLoeschen(aufgabe.id);
                    onSchliessen();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Löschen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLoeschenFragen(false)}
              >
                Abbrechen
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLoeschenFragen(true)}
            >
              <Trash2 className="size-4" />
              Löschen
            </Button>
          )}
          <span className="flex gap-2">
            <Button variant="outline" onClick={onSchliessen}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void speichern()}
              disabled={busy || !f.titel.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Speichern
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
