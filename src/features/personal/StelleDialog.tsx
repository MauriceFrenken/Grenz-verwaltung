import { useState } from "react";
import { Copy, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import {
  STELLENSTATUS,
  type Stelle,
  type Stellenstatus,
} from "@/lib/personal/recruiting";
import { VERTRAGSARTEN, type Vertragsart } from "@/lib/personal/typen";

import { Auswahl, Feld } from "./bausteine";
import type { RecruitingKontext } from "./useRecruiting";

type Formular = {
  titel: string;
  standort: string;
  vertragsart: Vertragsart;
  wochenstunden: string;
  startAb: string;
  status: Stellenstatus;
  aufgaben: string;
  anforderungen: string;
  angebot: string;
  anzeigeText: string;
  kanaele: string;
};

function formular(s: Stelle | null): Formular {
  return {
    titel: s?.titel ?? "",
    standort: s?.standort ?? "Köln",
    vertragsart: s?.vertragsart ?? "vollzeit",
    wochenstunden: s?.wochenstunden != null ? String(s.wochenstunden) : "",
    startAb: s?.startAb ?? "",
    status: s?.status ?? "entwurf",
    aufgaben: s?.aufgaben ?? "",
    anforderungen: s?.anforderungen ?? "",
    angebot: s?.angebot ?? "",
    anzeigeText: s?.anzeigeText ?? "",
    kanaele: s?.kanaele ?? "",
  };
}

/** Stelle anlegen oder bearbeiten, inklusive KI-Entwurf der Anzeige. */
export function StelleDialog({
  r,
  stelle,
  onClose,
}: {
  r: RecruitingKontext;
  stelle: Stelle | null;
  onClose: () => void;
}) {
  const [f, setF] = useState<Formular>(() => formular(stelle));
  const [entwirft, setEntwirft] = useState(false);
  const setze = (feld: keyof Formular) => (v: string) =>
    setF((x) => ({ ...x, [feld]: v }));

  const werte = (): Partial<Stelle> & { titel: string } => ({
    id: stelle?.id,
    titel: f.titel,
    standort: f.standort || null,
    vertragsart: f.vertragsart,
    wochenstunden: f.wochenstunden
      ? Number(f.wochenstunden.replace(",", "."))
      : null,
    startAb: f.startAb || null,
    status: f.status,
    aufgaben: f.aufgaben || null,
    anforderungen: f.anforderungen || null,
    angebot: f.angebot || null,
    anzeigeText: f.anzeigeText || null,
    kanaele: f.kanaele || null,
  });

  const entwerfen = async () => {
    setEntwirft(true);
    try {
      const { stellenanzeigeEntwerfenFn } =
        await import("@/lib/personal/recruiting-server-fn");
      const e = await stellenanzeigeEntwerfenFn({
        data: { supabaseAccessToken: r.token, stelle: werte() },
      });
      setF((x) => ({ ...x, anzeigeText: e.text }));
      toast.success("Entwurf erstellt. Bitte gegenlesen.");
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setEntwirft(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stelle ? "Stelle bearbeiten" : "Neue Stelle"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label="Stellentitel" className="sm:col-span-2">
            <Input
              value={f.titel}
              placeholder="z. B. Immobilienberater Investment (m/w/d)"
              onChange={(e) => setze("titel")(e.target.value)}
            />
          </Feld>
          <Feld label="Status">
            <Auswahl
              wert={f.status}
              optionen={Object.entries(STELLENSTATUS).map(([wert, label]) => ({
                wert: wert as Stellenstatus,
                label,
              }))}
              onChange={(w) => setze("status")(w || "entwurf")}
            />
          </Feld>
          <Feld label="Standort">
            <Input
              value={f.standort}
              onChange={(e) => setze("standort")(e.target.value)}
            />
          </Feld>
          <Feld label="Vertragsart">
            <Auswahl
              wert={f.vertragsart}
              optionen={Object.entries(VERTRAGSARTEN).map(([wert, label]) => ({
                wert: wert as Vertragsart,
                label,
              }))}
              onChange={(w) => setze("vertragsart")(w || "vollzeit")}
            />
          </Feld>
          <div className="grid grid-cols-2 gap-3">
            <Feld label="Std./Woche">
              <Input
                inputMode="decimal"
                value={f.wochenstunden}
                onChange={(e) => setze("wochenstunden")(e.target.value)}
              />
            </Feld>
            <Feld label="Start ab">
              <Input
                type="date"
                value={f.startAb}
                onChange={(e) => setze("startAb")(e.target.value)}
              />
            </Feld>
          </div>
          <Feld label="Aufgaben (Stichworte)">
            <Textarea
              rows={5}
              value={f.aufgaben}
              placeholder="Akquise von Verkaufsmandaten, Bewertung, Exposés, Besichtigungen …"
              onChange={(e) => setze("aufgaben")(e.target.value)}
            />
          </Feld>
          <Feld label="Anforderungen (Stichworte)">
            <Textarea
              rows={5}
              value={f.anforderungen}
              placeholder="Erfahrung im Investmentmarkt, §34c, Führerschein …"
              onChange={(e) => setze("anforderungen")(e.target.value)}
            />
          </Feld>
          <Feld label="Was wir bieten (Stichworte)">
            <Textarea
              rows={5}
              value={f.angebot}
              placeholder="Fixum plus Provision, Dienstwagen, Weiterbildung …"
              onChange={(e) => setze("angebot")(e.target.value)}
            />
          </Feld>
          <Feld
            label="Anzeigentext"
            className="sm:col-span-3"
            hinweis="Der KI-Entwurf nutzt nur deine Angaben, ist AGG-neutral formuliert und muss vor dem Veröffentlichen gegengelesen werden."
          >
            <div className="flex flex-wrap gap-2 pb-1">
              <Button
                size="sm"
                variant="outline"
                disabled={!f.titel.trim() || entwirft}
                onClick={() => void entwerfen()}
              >
                {entwirft ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {f.anzeigeText ? "Neu entwerfen" : "Mit KI entwerfen"}
              </Button>
              {f.anzeigeText ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(f.anzeigeText)
                      .then(() => toast.success("Text kopiert."))
                  }
                >
                  <Copy className="size-4" /> Kopieren
                </Button>
              ) : null}
            </div>
            <Textarea
              rows={14}
              value={f.anzeigeText}
              onChange={(e) => setze("anzeigeText")(e.target.value)}
            />
          </Feld>
          <Feld
            label="Veröffentlicht auf"
            className="sm:col-span-3"
            hinweis="z. B. StepStone, Indeed, LinkedIn, Website (mit Datum)"
          >
            <Input
              value={f.kanaele}
              onChange={(e) => setze("kanaele")(e.target.value)}
            />
          </Feld>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {stelle ? (
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  !confirm(
                    "Stelle löschen? Die Bewerber bleiben erhalten, ohne Zuordnung.",
                  )
                )
                  return;
                const e = await r.ausfuehren(
                  { typ: "stelle_loeschen", id: stelle.id },
                  "Stelle gelöscht.",
                );
                if (e.ok) onClose();
              }}
            >
              <Trash2 className="size-4" /> Löschen
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              disabled={!f.titel.trim()}
              onClick={async () => {
                const e = await r.ausfuehren(
                  { typ: "stelle_speichern", stelle: werte() },
                  "Stelle gespeichert.",
                );
                if (e.ok) onClose();
              }}
            >
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
