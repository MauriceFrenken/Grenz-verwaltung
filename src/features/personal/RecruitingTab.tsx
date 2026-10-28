import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Paperclip, Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  PHASEN,
  PHASEN_REIHE,
  STELLENSTATUS,
  loeschenAb,
  loeschfaellig,
  tageSeit,
  type Bewerber,
  type Phase,
  type Stelle,
} from "@/lib/personal/recruiting";
import { VERTRAGSARTEN } from "@/lib/personal/typen";
import { cn } from "@/lib/utils";

import { BewerberDialog, Sterne } from "./BewerberDialog";
import { Auswahl, Kasten, heuteIso } from "./bausteine";
import { StelleDialog } from "./StelleDialog";
import type { PersonalKontext } from "./usePersonal";
import type { RecruitingKontext } from "./useRecruiting";

/** Personio-Recruiting: offene Stellen, Bewerber-Pipeline als Kanban, Löschfristen. */
export function RecruitingTab({
  k,
  r,
}: {
  k: PersonalKontext;
  r: RecruitingKontext;
}) {
  const navigate = useNavigate();
  const heute = heuteIso();
  const [stelleFilter, setStelleFilter] = useState<string>("");
  const [stelleOffen, setStelleOffen] = useState<Stelle | null | "neu">(null);
  const [akte, setAkte] = useState<{
    bewerber: Bewerber | null;
    einstellen?: boolean;
  } | null>(null);
  const [ziehId, setZiehId] = useState<string | null>(null);
  const [ziel, setZiel] = useState<Phase | null>(null);

  if (r.fehler)
    return (
      <div className="border border-hairline bg-surface p-6 text-sm">
        <p className="font-medium text-heading">
          Recruiting konnte nicht geladen werden.
        </p>
        <p className="mt-1 text-text-muted">{r.fehler}</p>
      </div>
    );
  if (!r.daten) return <p className="text-sm text-text-muted">Lädt …</p>;

  const { stellen, bewerber } = r.daten;
  const stelleVon = new Map(stellen.map((s) => [s.id, s]));
  const gefiltert = bewerber.filter(
    (b) =>
      !stelleFilter ||
      (stelleFilter === "ohne" ? !b.stelleId : b.stelleId === stelleFilter),
  );
  const faellig = bewerber.filter((b) => loeschfaellig(b, heute));
  const aktiveStellen = stellen.filter(
    (s) =>
      s.status === "offen" || s.status === "entwurf" || s.status === "pausiert",
  );
  const termine = bewerber
    .filter((b) => b.naechsterTermin && b.naechsterTermin.slice(0, 10) >= heute)
    .sort((a, b) => a.naechsterTermin!.localeCompare(b.naechsterTermin!));

  const ablegen = async (phase: Phase) => {
    const id = ziehId;
    setZiehId(null);
    setZiel(null);
    if (!id) return;
    const b = bewerber.find((x) => x.id === id);
    if (!b || b.phase === phase) return;
    let absageGrund: string | null = null;
    if (phase === "abgesagt") {
      const g = prompt("Absagegrund (intern, sachlich):", "");
      if (g === null) return;
      absageGrund = g;
    }
    // Sofort anzeigen, dann speichern.
    r.setDaten((d) =>
      d
        ? {
            ...d,
            bewerber: d.bewerber.map((x) =>
              x.id === id ? { ...x, phase } : x,
            ),
          }
        : d,
    );
    const e = await r.ausfuehren({
      typ: "bewerber_verschieben",
      id,
      phase,
      absageGrund,
    });
    if (e.ok && phase === "eingestellt" && !b.mitarbeiterId)
      setAkte({ bewerber: { ...b, phase }, einstellen: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <Kasten
        titel={`Stellen (${aktiveStellen.length} aktiv)`}
        aktion={
          <Button size="sm" onClick={() => setStelleOffen("neu")}>
            <Plus className="size-4" /> Stelle anlegen
          </Button>
        }
      >
        {stellen.length === 0 ? (
          <p className="text-sm text-text-muted">
            Noch keine Stelle angelegt. Leg die erste Stelle mit Aufgaben und
            Anforderungen in Stichworten an; die Anzeige entwirft die KI.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  <th className="py-2 pr-3 font-medium">Stelle</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Bewerber</th>
                  <th className="py-2 pr-3 font-medium">Pipeline</th>
                  <th className="py-2 font-medium">Seit</th>
                </tr>
              </thead>
              <tbody>
                {stellen.map((s) => {
                  const eigene = bewerber.filter((b) => b.stelleId === s.id);
                  return (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-t border-hairline align-top hover:bg-surface-muted"
                      onClick={() => setStelleOffen(s)}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-heading">
                          {s.titel}
                        </div>
                        <div className="text-xs text-text-subtle">
                          {[
                            s.standort,
                            VERTRAGSARTEN[s.vertragsart],
                            s.startAb ? `ab ${formatDate(s.startAb)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 font-medium",
                            s.status === "offen"
                              ? "bg-[var(--gc-navy)] text-white"
                              : "bg-surface-muted text-text-muted",
                          )}
                        >
                          {STELLENSTATUS[s.status]}
                        </span>
                        {!s.anzeigeText ? (
                          <div className="mt-1 text-text-subtle">
                            ohne Anzeigentext
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {eigene.length}
                      </td>
                      <td className="py-2 pr-3 text-xs text-text-muted">
                        {PHASEN_REIHE.filter((p) => p !== "abgesagt")
                          .map((p) => ({
                            p,
                            n: eigene.filter((b) => b.phase === p).length,
                          }))
                          .filter((x) => x.n > 0)
                          .map((x) => `${x.n} ${PHASEN[x.p]}`)
                          .join(" · ") || "–"}
                      </td>
                      <td className="py-2 text-xs text-text-muted">
                        {formatDate(s.erstelltAm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kasten>

      <Kasten
        titel="Bewerber"
        aktion={
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <Auswahl
                wert={stelleFilter}
                leer="Alle Stellen"
                optionen={[
                  ...stellen.map((s) => ({ wert: s.id, label: s.titel })),
                  { wert: "ohne", label: "Initiativ / ohne Stelle" },
                ]}
                onChange={(w) => setStelleFilter(w)}
              />
            </div>
            <Button size="sm" onClick={() => setAkte({ bewerber: null })}>
              <Plus className="size-4" /> Bewerber erfassen
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 overflow-x-auto pb-1 [grid-template-columns:repeat(6,minmax(11rem,1fr))]">
          {PHASEN_REIHE.map((phase) => {
            const karten = gefiltert
              .filter((b) => b.phase === phase)
              .sort(
                (a, b) =>
                  a.reihenfolge - b.reihenfolge ||
                  a.eingegangenAm.localeCompare(b.eingegangenAm),
              );
            return (
              <div
                key={phase}
                onDragOver={(e) => {
                  if (!ziehId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (ziel !== phase) setZiel(phase);
                }}
                onDragLeave={() => ziel === phase && setZiel(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void ablegen(phase);
                }}
                className={cn(
                  "flex min-h-40 flex-col gap-2 bg-surface-muted p-2",
                  ziel === phase &&
                    "outline outline-1 outline-[var(--gc-navy)]",
                )}
              >
                <div className="flex items-center justify-between px-1 text-xs">
                  <span className="label-caps text-heading">
                    {PHASEN[phase]}
                  </span>
                  <span className="tabular-nums text-text-subtle">
                    {karten.length}
                  </span>
                </div>
                {karten.map((b) => {
                  const s = b.stelleId ? stelleVon.get(b.stelleId) : null;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", b.id);
                        setZiehId(b.id);
                      }}
                      onDragEnd={() => {
                        setZiehId(null);
                        setZiel(null);
                      }}
                      onClick={() => setAkte({ bewerber: b })}
                      className={cn(
                        "flex w-full cursor-grab flex-col gap-1 border border-hairline bg-elevated p-2.5 text-left transition hover:border-[var(--gc-navy-hell)] active:cursor-grabbing",
                        ziehId === b.id && "opacity-40",
                      )}
                    >
                      <span className="text-sm font-medium leading-snug text-heading">
                        {b.name}
                      </span>
                      <span className="truncate text-[11px] text-text-muted">
                        {s?.titel ?? "Initiativ"}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-[11px] text-text-subtle">
                        {b.bewertung ? <Sterne wert={b.bewertung} /> : null}
                        {b.quelle ? <span>{b.quelle}</span> : null}
                        {b.unterlagenUrl ? (
                          <Paperclip
                            className="size-3"
                            aria-label="Unterlagen"
                          />
                        ) : null}
                      </span>
                      {b.naechsterTermin &&
                      b.naechsterTermin.slice(0, 10) >= heute ? (
                        <span className="inline-flex items-center gap-1 self-start bg-[var(--gc-hellblau-zart)] px-1.5 py-0.5 text-[11px] text-heading">
                          <CalendarClock className="size-3" />
                          {new Date(b.naechsterTermin).toLocaleString("de-DE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-text-subtle">
                        {b.phase === "eingestellt" || b.phase === "abgesagt"
                          ? `Löschung ab ${formatDate(loeschenAb(b))}`
                          : `seit ${tageSeit(b.eingegangenAm, heute)} Tagen`}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Kasten>

      <div className="grid gap-4 lg:grid-cols-2">
        <Kasten titel="Anstehende Termine">
          {termine.length === 0 ? (
            <p className="text-sm text-text-muted">Keine Termine geplant.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {termine.map((b) => (
                <li key={b.id} className="flex gap-3">
                  <span className="w-32 shrink-0 tabular-nums text-text-muted">
                    {new Date(b.naechsterTermin!).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <button
                    type="button"
                    className="text-left text-heading underline-offset-2 hover:underline"
                    onClick={() => setAkte({ bewerber: b })}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Kasten>
        <Kasten
          titel="Datenschutz"
          aktion={
            faellig.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (
                    confirm(
                      `${faellig.length} Bewerber mit abgelaufener Frist endgültig löschen? Die Unterlagen in OneDrive bitte separat löschen.`,
                    )
                  )
                    void r.ausfuehren(
                      { typ: "bewerber_loeschen_faellig" },
                      "Gelöscht.",
                    );
                }}
              >
                {faellig.length} jetzt löschen
              </Button>
            ) : null
          }
        >
          <div className="flex gap-3 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-heading" />
            <div className="flex flex-col gap-2 text-text-muted">
              <p>
                Bewerberdaten sehen nur Geschäftsführung, Administratoren und
                Manager. Nach Absage oder Einstellung werden sie nach 6 Monaten
                gelöscht (AGG-Fristen), im Talentpool nur mit schriftlicher
                Einwilligung länger.
              </p>
              {faellig.length > 0 ? (
                <ul className="text-heading">
                  {faellig.map((b) => (
                    <li key={b.id}>
                      {b.name}: Frist seit {formatDate(loeschenAb(b))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Keine Löschung fällig.</p>
              )}
            </div>
          </div>
        </Kasten>
      </div>

      {stelleOffen ? (
        <StelleDialog
          r={r}
          stelle={stelleOffen === "neu" ? null : stelleOffen}
          onClose={() => setStelleOffen(null)}
        />
      ) : null}
      {akte ? (
        <BewerberDialog
          key={akte.bewerber?.id ?? "neu"}
          r={r}
          bewerber={akte.bewerber}
          vorStelle={
            stelleFilter && stelleFilter !== "ohne" ? stelleFilter : null
          }
          einstellenOffen={akte.einstellen}
          onClose={() => setAkte(null)}
          onEingestellt={(id) => {
            setAkte(null);
            void k.neuLaden();
            void navigate({
              to: "/personal/$id",
              params: { id },
              search: { tab: "onboarding" },
            });
          }}
        />
      ) : null}
    </div>
  );
}
