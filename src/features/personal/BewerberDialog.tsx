import { useState } from "react";
import { ExternalLink, Star, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import {
  LOESCHFRIST_MONATE,
  PHASEN,
  QUELLEN,
  loeschenAb,
  type Bewerber,
  type Phase,
} from "@/lib/personal/recruiting";
import { VERTRAGSARTEN, type Vertragsart } from "@/lib/personal/typen";
import { cn } from "@/lib/utils";

import { Auswahl, Feld, heuteIso } from "./bausteine";
import type { RecruitingKontext } from "./useRecruiting";

/** ISO-Zeitpunkt ↔ Wert eines datetime-local-Felds (lokale Zeit). */
function lokal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function Sterne({
  wert,
  onChange,
}: {
  wert: number | null;
  onChange?: (w: number | null) => void;
}) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} von 5`}
          onClick={() => onChange?.(wert === n ? null : n)}
          className={cn(onChange ? "p-0.5" : "pointer-events-none")}
        >
          <Star
            className={cn(
              onChange ? "size-4" : "size-3",
              wert && n <= wert
                ? "fill-[var(--gc-navy)] text-[var(--gc-navy)]"
                : "text-[var(--gc-grau)]",
            )}
          />
        </button>
      ))}
    </span>
  );
}

type Formular = Omit<
  Bewerber,
  "id" | "reihenfolge" | "abgeschlossenAm" | "mitarbeiterId"
>;

/** Bewerberakte: Stammdaten, Bewertung, Unterlagen-Link, Verlauf, Absage, Einstellung. */
export function BewerberDialog({
  r,
  bewerber,
  vorStelle,
  einstellenOffen,
  onClose,
  onEingestellt,
}: {
  r: RecruitingKontext;
  bewerber: Bewerber | null;
  /** Bei neuen Bewerbern vorausgewählte Stelle. */
  vorStelle?: string | null;
  /** Direkt mit der Übernahme in eine Mitarbeiterakte öffnen. */
  einstellenOffen?: boolean;
  onClose: () => void;
  onEingestellt: (mitarbeiterId: string) => void;
}) {
  const stellen = r.daten?.stellen ?? [];
  const verlauf = (r.daten?.ereignisse ?? []).filter(
    (e) => e.bewerberId === bewerber?.id,
  );
  const [f, setF] = useState<Formular>(() => ({
    stelleId: bewerber?.stelleId ?? vorStelle ?? null,
    name: bewerber?.name ?? "",
    email: bewerber?.email ?? null,
    telefon: bewerber?.telefon ?? null,
    quelle: bewerber?.quelle ?? null,
    phase: bewerber?.phase ?? "eingang",
    bewertung: bewerber?.bewertung ?? null,
    eingegangenAm: bewerber?.eingegangenAm ?? heuteIso(),
    verfuegbarAb: bewerber?.verfuegbarAb ?? null,
    gehaltsvorstellung: bewerber?.gehaltsvorstellung ?? null,
    unterlagenUrl: bewerber?.unterlagenUrl ?? null,
    naechsterTermin: bewerber?.naechsterTermin ?? null,
    notizen: bewerber?.notizen ?? null,
    absageGrund: bewerber?.absageGrund ?? null,
    talentpoolBis: bewerber?.talentpoolBis ?? null,
  }));
  const [notiz, setNotiz] = useState("");
  const [einstellen, setEinstellen] = useState(Boolean(einstellenOffen));
  const stelle = stellen.find((s) => s.id === f.stelleId);
  const [vertrag, setVertrag] = useState({
    eintrittAm: bewerber?.verfuegbarAb ?? "",
    vertragsart: (stelle?.vertragsart ?? "vollzeit") as Vertragsart,
    wochenstunden:
      stelle?.wochenstunden != null ? String(stelle.wochenstunden) : "",
    position: stelle?.titel.replace(/\s*\(m\/w\/d\)\s*/i, "") ?? "",
  });
  const setze =
    <K extends keyof Formular>(feld: K) =>
    (v: Formular[K]) =>
      setF((x) => ({ ...x, [feld]: v }));
  const loeschen = bewerber ? loeschenAb(bewerber) : null;

  const speichern = async () => {
    const e = await r.ausfuehren(
      {
        typ: "bewerber_speichern",
        bewerber: { ...f, id: bewerber?.id },
      },
      bewerber ? "Gespeichert." : "Bewerber erfasst.",
    );
    if (e.ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bewerber ? bewerber.name : "Bewerber erfassen"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Feld label="Name">
              <Input
                value={f.name}
                onChange={(e) => setze("name")(e.target.value)}
              />
            </Feld>
            <Feld label="Stelle">
              <Auswahl
                wert={f.stelleId ?? ""}
                leer="Initiativ / ohne Stelle"
                optionen={stellen.map((s) => ({ wert: s.id, label: s.titel }))}
                onChange={(w) => setze("stelleId")(w || null)}
              />
            </Feld>
            <Feld label="E-Mail">
              <Input
                type="email"
                value={f.email ?? ""}
                onChange={(e) => setze("email")(e.target.value || null)}
              />
            </Feld>
            <Feld label="Telefon">
              <Input
                value={f.telefon ?? ""}
                onChange={(e) => setze("telefon")(e.target.value || null)}
              />
            </Feld>
            <Feld label="Phase">
              <Auswahl
                wert={f.phase}
                optionen={Object.entries(PHASEN).map(([wert, label]) => ({
                  wert: wert as Phase,
                  label,
                }))}
                onChange={(w) => setze("phase")((w || "eingang") as Phase)}
              />
            </Feld>
            <Feld label="Bewertung">
              <div className="flex h-9 items-center">
                <Sterne wert={f.bewertung} onChange={setze("bewertung")} />
              </div>
            </Feld>
            <Feld label="Quelle">
              <Auswahl
                wert={f.quelle ?? ""}
                leer="–"
                optionen={QUELLEN.map((q) => ({ wert: q, label: q }))}
                onChange={(w) => setze("quelle")(w || null)}
              />
            </Feld>
            <Feld label="Eingegangen am">
              <Input
                type="date"
                value={f.eingegangenAm}
                onChange={(e) => setze("eingegangenAm")(e.target.value)}
              />
            </Feld>
            <Feld label="Verfügbar ab">
              <Input
                type="date"
                value={f.verfuegbarAb ?? ""}
                onChange={(e) => setze("verfuegbarAb")(e.target.value || null)}
              />
            </Feld>
            <Feld label="Gehaltsvorstellung">
              <Input
                value={f.gehaltsvorstellung ?? ""}
                placeholder="z. B. 60.000 € fix + Provision"
                onChange={(e) =>
                  setze("gehaltsvorstellung")(e.target.value || null)
                }
              />
            </Feld>
            <Feld label="Nächster Termin">
              <Input
                type="datetime-local"
                value={lokal(f.naechsterTermin)}
                onChange={(e) =>
                  setze("naechsterTermin")(
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  )
                }
              />
            </Feld>
            <Feld
              label="Unterlagen (OneDrive-Link)"
              hinweis="Lebenslauf und Zeugnisse bleiben im OneDrive-Ordner Bewerbungen."
            >
              <div className="flex gap-2">
                <Input
                  value={f.unterlagenUrl ?? ""}
                  placeholder="https://…"
                  onChange={(e) =>
                    setze("unterlagenUrl")(e.target.value || null)
                  }
                />
                {f.unterlagenUrl?.startsWith("https://") ? (
                  <a
                    href={f.unterlagenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-2 text-heading"
                    aria-label="Unterlagen öffnen"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
              </div>
            </Feld>
            <Feld label="Einschätzung" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={f.notizen ?? ""}
                placeholder="Stärken, offene Fragen, Eindruck aus dem Gespräch"
                onChange={(e) => setze("notizen")(e.target.value || null)}
              />
            </Feld>
            {f.phase === "abgesagt" ? (
              <Feld
                label="Absagegrund (intern)"
                className="sm:col-span-2"
                hinweis="Sachlich formulieren; die Notiz kann bei einer AGG-Klage vorgelegt werden müssen."
              >
                <Input
                  value={f.absageGrund ?? ""}
                  onChange={(e) => setze("absageGrund")(e.target.value || null)}
                />
              </Feld>
            ) : null}
            <Feld
              label="Talentpool: Einwilligung bis"
              className="sm:col-span-2"
              hinweis={`Ohne schriftliche Einwilligung werden die Daten ${LOESCHFRIST_MONATE} Monate nach Abschluss gelöscht.${loeschen ? ` Löschung ab ${formatDate(loeschen)}.` : ""}`}
            >
              <Input
                type="date"
                className="sm:w-48"
                value={f.talentpoolBis ?? ""}
                onChange={(e) => setze("talentpoolBis")(e.target.value || null)}
              />
            </Feld>
          </div>

          {bewerber ? (
            <div className="flex flex-col gap-3 border-l border-hairline pl-0 lg:pl-6">
              <h3 className="text-sm font-semibold text-heading">Verlauf</h3>
              <div className="flex gap-2">
                <Input
                  value={notiz}
                  placeholder="Notiz hinzufügen"
                  onChange={(e) => setNotiz(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter" || !notiz.trim()) return;
                    const x = await r.ausfuehren({
                      typ: "bewerber_notiz",
                      id: bewerber.id,
                      text: notiz,
                    });
                    if (x.ok) setNotiz("");
                  }}
                />
              </div>
              <ul className="flex flex-col gap-2 text-xs">
                {verlauf.map((e) => (
                  <li key={e.id} className="border-b border-hairline pb-2">
                    <div className="text-text-subtle">
                      {new Date(e.am).toLocaleString("de-DE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {e.vonName ? ` · ${e.vonName}` : ""}
                    </div>
                    <div
                      className={cn(
                        "whitespace-pre-wrap",
                        e.art === "notiz" ? "text-heading" : "text-text-muted",
                      )}
                    >
                      {e.text}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {einstellen && bewerber ? (
          <div className="grid gap-3 border border-hairline bg-surface-muted p-4 sm:grid-cols-4">
            <p className="text-sm text-heading sm:col-span-4">
              Legt eine Mitarbeiterakte an, startet die Onboarding-Checkliste
              und setzt die Stelle auf „Besetzt“.
            </p>
            <Feld label="Position">
              <Input
                value={vertrag.position}
                onChange={(e) =>
                  setVertrag((v) => ({ ...v, position: e.target.value }))
                }
              />
            </Feld>
            <Feld label="Vertragsart">
              <Auswahl
                wert={vertrag.vertragsart}
                optionen={Object.entries(VERTRAGSARTEN).map(
                  ([wert, label]) => ({
                    wert: wert as Vertragsart,
                    label,
                  }),
                )}
                onChange={(w) =>
                  setVertrag((v) => ({
                    ...v,
                    vertragsart: (w || "vollzeit") as Vertragsart,
                  }))
                }
              />
            </Feld>
            <Feld label="Std./Woche">
              <Input
                inputMode="decimal"
                value={vertrag.wochenstunden}
                onChange={(e) =>
                  setVertrag((v) => ({ ...v, wochenstunden: e.target.value }))
                }
              />
            </Feld>
            <Feld label="Eintritt am">
              <Input
                type="date"
                value={vertrag.eintrittAm}
                onChange={(e) =>
                  setVertrag((v) => ({ ...v, eintrittAm: e.target.value }))
                }
              />
            </Feld>
            <div className="flex justify-end gap-2 sm:col-span-4">
              <Button variant="outline" onClick={() => setEinstellen(false)}>
                Zurück
              </Button>
              <Button
                onClick={async () => {
                  const e = await r.ausfuehren(
                    {
                      typ: "bewerber_einstellen",
                      id: bewerber.id,
                      eintrittAm: vertrag.eintrittAm || null,
                      vertragsart: vertrag.vertragsart,
                      wochenstunden: vertrag.wochenstunden
                        ? Number(vertrag.wochenstunden.replace(",", "."))
                        : null,
                      position: vertrag.position || null,
                    },
                    "Eingestellt. Akte und Onboarding sind angelegt.",
                  );
                  if (e.ok && e.id) onEingestellt(e.id);
                }}
              >
                <UserPlus className="size-4" /> Akte anlegen
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {bewerber ? (
              <Button
                variant="outline"
                onClick={async () => {
                  if (
                    !confirm(
                      "Bewerber mit Verlauf endgültig löschen? Die Unterlagen in OneDrive bitte separat löschen.",
                    )
                  )
                    return;
                  const e = await r.ausfuehren(
                    { typ: "bewerber_loeschen", id: bewerber.id },
                    "Bewerber gelöscht.",
                  );
                  if (e.ok) onClose();
                }}
              >
                <Trash2 className="size-4" /> Löschen
              </Button>
            ) : null}
            {bewerber && !bewerber.mitarbeiterId && !einstellen ? (
              <Button variant="outline" onClick={() => setEinstellen(true)}>
                <UserPlus className="size-4" /> Als Mitarbeiter übernehmen
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button disabled={!f.name.trim()} onClick={() => void speichern()}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
