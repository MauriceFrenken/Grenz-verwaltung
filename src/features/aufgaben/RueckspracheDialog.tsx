import { useState } from "react";
import { Loader2 } from "lucide-react";

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
import { aufgabenAusNotiz, heuteIso } from "@/lib/aufgaben/logik";
import {
  THEMENFELDER,
  type MandatKurz,
  type Person,
  type Spalte,
  type Themenfeld,
} from "@/lib/aufgaben/typen";

import { FELD } from "./bausteine";

export type RueckspracheEingabe = {
  spalteId: string;
  titel: string[];
  ruecksprache: string;
  ruecksprachAm: string | null;
  verantwortlichId: string | null;
  faelligAm: string | null;
  mandatSfId: string | null;
  themenfeld: Themenfeld;
};

/** Nach einer Rücksprache alle festgelegten Aufgaben auf einmal erfassen: eine Zeile je Aufgabe. */
export function RueckspracheDialog({
  offen,
  spalten,
  personen,
  mandate,
  ruecksprachen,
  themenfelder,
  vorgabeThemenfeld,
  onSchliessen,
  onErfassen,
}: {
  offen: boolean;
  spalten: Spalte[];
  personen: Person[];
  mandate: MandatKurz[];
  ruecksprachen: string[];
  themenfelder: boolean;
  /** Vorbelegung, z. B. das gerade gefilterte Themenfeld. */
  vorgabeThemenfeld: Themenfeld;
  onSchliessen: () => void;
  onErfassen: (e: RueckspracheEingabe) => Promise<void>;
}) {
  const [name, setName] = useState("Jour fixe");
  const [datum, setDatum] = useState(heuteIso());
  const [notiz, setNotiz] = useState("");
  const [person, setPerson] = useState("");
  const [faellig, setFaellig] = useState("");
  const [mandat, setMandat] = useState("");
  const [spalteId, setSpalteId] = useState("");
  const [thema, setThema] = useState<Themenfeld | null>(null);
  const themenfeld = thema ?? vorgabeThemenfeld;
  const [busy, setBusy] = useState(false);

  const titel = aufgabenAusNotiz(notiz);
  const ziel =
    spalteId || spalten.find((s) => !s.erledigt)?.id || spalten[0]?.id || "";

  const erfassen = async () => {
    setBusy(true);
    try {
      await onErfassen({
        spalteId: ziel,
        titel,
        ruecksprache: name.trim(),
        ruecksprachAm: datum || null,
        verantwortlichId: person || null,
        faelligAm: faellig || null,
        mandatSfId: mandat || null,
        themenfeld,
      });
      setNotiz("");
      onSchliessen();
    } catch {
      // Meldung kommt aus onErfassen.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rücksprache erfassen</DialogTitle>
          <DialogDescription>
            Je Zeile eine Aufgabe. Themenfeld, Verantwortlicher, Fälligkeit und
            Mandat gelten für alle Karten und lassen sich danach je Karte
            ändern.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Rücksprache
              <input
                className={FELD}
                list="ruecksprache-namen"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <datalist id="ruecksprache-namen">
                {ruecksprachen.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Datum
              <input
                type="date"
                className={FELD}
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Festgelegte Aufgaben
            <Textarea
              rows={8}
              autoFocus
              placeholder={
                "Exposé Moltkestraße finalisieren\nEigentümer Bilker Allee zurückrufen\nFotograf für Sperberstraße buchen"
              }
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {themenfelder && (
              <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2">
                Themenfeld
                <select
                  className={FELD}
                  value={themenfeld}
                  onChange={(e) => setThema(e.target.value as Themenfeld)}
                >
                  <option value="">Ohne Themenfeld</option>
                  {THEMENFELDER.map((t) => (
                    <option key={t.wert} value={t.wert}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Verantwortlich
              <select
                className={FELD}
                value={person}
                onChange={(e) => setPerson(e.target.value)}
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
                value={faellig}
                onChange={(e) => setFaellig(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Mandat
              <select
                className={FELD}
                value={mandat}
                onChange={(e) => setMandat(e.target.value)}
              >
                <option value="">Kein Mandat</option>
                {mandate.map((m) => (
                  <option key={m.sfId} value={m.sfId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Spalte
              <select
                className={FELD}
                value={ziel}
                onChange={(e) => setSpalteId(e.target.value)}
              >
                {spalten.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSchliessen}>
            Abbrechen
          </Button>
          <Button
            onClick={() => void erfassen()}
            disabled={busy || titel.length === 0 || !ziel}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {titel.length === 1
              ? "1 Aufgabe anlegen"
              : `${titel.length} Aufgaben anlegen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
