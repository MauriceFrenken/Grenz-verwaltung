import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  abwesenheitAm,
  arbeitstage,
  feiertag,
  istWochenende,
  tageZwischen,
} from "@/lib/personal/berechnen";
import {
  ABWESENHEITSARTEN,
  type Abwesenheit,
  type Abwesenheitsart,
} from "@/lib/personal/typen";
import { cn } from "@/lib/utils";

import {
  Auswahl,
  Feld,
  Kasten,
  aktiveMitarbeiter,
  heuteIso,
  tageText,
} from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

/** Kürzel und Fläche je Art im Kalender, nur CI-Töne. */
const ART_STIL: Record<
  Abwesenheitsart | "abwesend",
  { kurz: string; stil: string }
> = {
  urlaub: { kurz: "U", stil: "bg-[var(--gc-navy)] text-white" },
  krank: { kurz: "K", stil: "bg-[var(--gc-navy-hell)] text-white" },
  fortbildung: { kurz: "F", stil: "bg-[var(--gc-hellblau)] text-heading" },
  homeoffice: { kurz: "H", stil: "bg-[var(--gc-hellblau-zart)] text-heading" },
  sonderurlaub: { kurz: "S", stil: "bg-[var(--gc-navy)] text-white" },
  elternzeit: { kurz: "E", stil: "bg-[var(--gc-grau)] text-heading" },
  abwesend: { kurz: "A", stil: "bg-[var(--gc-grau)] text-heading" },
};

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function artLabel(a: Abwesenheit): string {
  return a.art ? ABWESENHEITSARTEN[a.art] : "Abwesend";
}

function Kalender({ k }: { k: PersonalKontext }) {
  const { daten } = k;
  const heute = heuteIso();
  const [monat, setMonat] = useState(() =>
    Number(heute.slice(0, 4)) === daten.jahr ? Number(heute.slice(5, 7)) : 1,
  );
  const erster = `${daten.jahr}-${String(monat).padStart(2, "0")}-01`;
  const letzter = new Date(Date.UTC(daten.jahr, monat, 0))
    .toISOString()
    .slice(0, 10);
  const tage = tageZwischen(erster, letzter);
  const mitarbeiter = aktiveMitarbeiter(daten.mitarbeiter, erster);
  const monatsname = new Date(`${erster}T00:00:00Z`).toLocaleDateString(
    "de-DE",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return (
    <Kasten
      titel={`Teamkalender ${monatsname}`}
      aktion={
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            disabled={monat === 1}
            onClick={() => setMonat((m) => m - 1)}
            aria-label="Vormonat"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={monat === 12}
            onClick={() => setMonat((m) => m + 1)}
            aria-label="Folgemonat"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface pr-3 text-left font-medium text-text-subtle">
                Mitarbeiter
              </th>
              {tage.map((t) => {
                const frei = istWochenende(t) || feiertag(t);
                return (
                  <th
                    key={t}
                    title={feiertag(t) ?? undefined}
                    className={cn(
                      "w-7 min-w-7 px-0 py-1 text-center font-normal",
                      frei ? "text-text-subtle" : "text-text-muted",
                      t === heute &&
                        "border-b-2 border-[var(--gc-navy)] font-semibold text-heading",
                    )}
                  >
                    <div>
                      {WOCHENTAG[new Date(`${t}T00:00:00Z`).getUTCDay()]}
                    </div>
                    <div>{Number(t.slice(8, 10))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {mitarbeiter.map((m) => (
              <tr key={m.id} className="border-t border-hairline">
                <td className="sticky left-0 whitespace-nowrap bg-surface py-1 pr-3 text-sm text-heading">
                  {m.name}
                </td>
                {tage.map((t) => {
                  const frei = istWochenende(t) || feiertag(t);
                  const a = frei
                    ? null
                    : abwesenheitAm(m.id, t, daten.abwesenheiten);
                  const s = a ? ART_STIL[a.art ?? "abwesend"] : null;
                  return (
                    <td
                      key={t}
                      title={
                        a
                          ? `${artLabel(a)}${a.status === "beantragt" ? " (beantragt)" : ""}`
                          : (feiertag(t) ?? undefined)
                      }
                      className={cn(
                        "h-7 border-l border-hairline p-0 text-center",
                        frei && "bg-surface-muted",
                      )}
                    >
                      {s ? (
                        <span
                          className={cn(
                            "flex h-full w-full items-center justify-center",
                            s.stil,
                            a?.status === "beantragt" && "opacity-50",
                          )}
                        >
                          {s.kurz}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-text-muted">
        {(Object.keys(ABWESENHEITSARTEN) as Abwesenheitsart[]).map((art) => (
          <span key={art} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center text-[10px]",
                ART_STIL[art].stil,
              )}
            >
              {ART_STIL[art].kurz}
            </span>
            {ABWESENHEITSARTEN[art]}
          </span>
        ))}
        <span>blass = beantragt · grau = Wochenende/Feiertag NRW</span>
      </div>
    </Kasten>
  );
}

export function EintragDialog({
  k,
  offen,
  onClose,
  fest,
}: {
  k: PersonalKontext;
  offen: boolean;
  onClose: () => void;
  /** Mitarbeiter vorgegeben (Profilseite). */
  fest?: string;
}) {
  const { daten, ausfuehren } = k;
  const heute = heuteIso();
  const auswahl = daten.verwalten
    ? aktiveMitarbeiter(daten.mitarbeiter, heute)
    : daten.mitarbeiter.filter((m) => m.id === daten.ichId);
  const [f, setF] = useState({
    mitarbeiterId: fest ?? daten.ichId ?? "",
    art: "urlaub" as Abwesenheitsart,
    von: heute,
    bis: heute,
    halbtag: false,
    notiz: "",
  });
  const mitarbeiterId = f.mitarbeiterId || auswahl[0]?.id || "";
  const tage =
    f.bis >= f.von
      ? arbeitstage(f.von, f.bis, f.halbtag && f.von === f.bis)
      : 0;
  const antrag =
    !daten.verwalten && (f.art === "urlaub" || f.art === "sonderurlaub");

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {antrag ? "Urlaub beantragen" : "Abwesenheit eintragen"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Mitarbeiter" className="sm:col-span-2">
            <Auswahl
              wert={mitarbeiterId}
              optionen={auswahl.map((m) => ({ wert: m.id, label: m.name }))}
              onChange={(w) => setF((x) => ({ ...x, mitarbeiterId: w }))}
              disabled={!daten.verwalten}
            />
          </Feld>
          <Feld label="Art" className="sm:col-span-2">
            <Auswahl
              wert={f.art}
              optionen={Object.entries(ABWESENHEITSARTEN).map(
                ([wert, label]) => ({ wert: wert as Abwesenheitsart, label }),
              )}
              onChange={(w) =>
                setF((x) => ({ ...x, art: (w || "urlaub") as Abwesenheitsart }))
              }
            />
          </Feld>
          <Feld label="Von">
            <Input
              type="date"
              value={f.von}
              onChange={(e) =>
                setF((x) => ({
                  ...x,
                  von: e.target.value,
                  bis: x.bis < e.target.value ? e.target.value : x.bis,
                }))
              }
            />
          </Feld>
          <Feld label="Bis">
            <Input
              type="date"
              value={f.bis}
              min={f.von}
              onChange={(e) => setF((x) => ({ ...x, bis: e.target.value }))}
            />
          </Feld>
          {f.von === f.bis ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={f.halbtag}
                onChange={(e) =>
                  setF((x) => ({ ...x, halbtag: e.target.checked }))
                }
              />
              Nur halber Tag
            </label>
          ) : null}
          <Feld
            label="Notiz"
            className="sm:col-span-2"
            hinweis={
              f.art === "krank"
                ? "Keine Diagnosen eintragen. Dauert die Krankheit länger als drei Kalendertage, ist eine Krankschreibung nötig (eAU ruft die Lohnbuchhaltung bei der Krankenkasse ab)."
                : undefined
            }
          >
            <Input
              value={f.notiz}
              onChange={(e) => setF((x) => ({ ...x, notiz: e.target.value }))}
            />
          </Feld>
        </div>
        <p className="text-sm text-text-muted">
          {tageText(tage)} Arbeitstage (ohne Wochenenden und Feiertage NRW)
          {antrag
            ? ". Die Geschäftsführung bekommt den Antrag zur Freigabe."
            : "."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!mitarbeiterId || f.bis < f.von}
            onClick={async () => {
              const ok = await ausfuehren(
                {
                  typ: "abwesenheit_speichern",
                  abwesenheit: {
                    mitarbeiterId,
                    art: f.art,
                    von: f.von,
                    bis: f.bis,
                    halbtag: f.halbtag && f.von === f.bis,
                    notiz: f.notiz || null,
                  },
                },
                antrag ? "Antrag gestellt." : "Eingetragen.",
              );
              if (ok) onClose();
            }}
          >
            {antrag ? "Beantragen" : "Eintragen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AbwesenheitenTab({ k }: { k: PersonalKontext }) {
  const { daten, ausfuehren } = k;
  const [neu, setNeu] = useState(false);
  const name = (id: string) =>
    daten.mitarbeiter.find((m) => m.id === id)?.name ?? "–";
  const offen = daten.abwesenheiten.filter((a) => a.status === "beantragt");
  const eintraege = useMemo(
    () =>
      daten.abwesenheiten
        .filter(
          (a) =>
            a.art !== null &&
            (daten.verwalten || a.mitarbeiterId === daten.ichId),
        )
        .filter(
          (a) =>
            a.bis >= `${daten.jahr}-01-01` && a.von <= `${daten.jahr}-12-31`,
        )
        .sort((a, b) => b.von.localeCompare(a.von)),
    [daten],
  );
  const kannEintragen = daten.verwalten || daten.ichId !== null;

  return (
    <div className="flex flex-col gap-4">
      <Kalender k={k} />

      {daten.verwalten && offen.length > 0 ? (
        <Kasten titel={`Offene Anträge (${offen.length})`}>
          <ul className="flex flex-col divide-y divide-[var(--hairline)] text-sm">
            {offen.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span>
                  <span className="font-medium text-heading">
                    {name(a.mitarbeiterId)}
                  </span>{" "}
                  · {artLabel(a)} {formatDate(a.von)} bis {formatDate(a.bis)} ·{" "}
                  {tageText(arbeitstage(a.von, a.bis, a.halbtag))}
                  {a.notiz ? (
                    <span className="text-text-subtle"> · {a.notiz}</span>
                  ) : null}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void ausfuehren(
                        {
                          typ: "abwesenheit_entscheiden",
                          id: a.id,
                          status: "abgelehnt",
                        },
                        "Abgelehnt.",
                      )
                    }
                  >
                    Ablehnen
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void ausfuehren(
                        {
                          typ: "abwesenheit_entscheiden",
                          id: a.id,
                          status: "genehmigt",
                        },
                        "Genehmigt.",
                      )
                    }
                  >
                    Genehmigen
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Kasten>
      ) : null}

      <Kasten
        titel={
          daten.verwalten
            ? `Alle Einträge ${daten.jahr}`
            : `Meine Einträge ${daten.jahr}`
        }
        aktion={
          kannEintragen ? (
            <Button size="sm" onClick={() => setNeu(true)}>
              <Plus className="size-4" />{" "}
              {daten.verwalten
                ? "Abwesenheit eintragen"
                : "Urlaub beantragen / Abwesenheit melden"}
            </Button>
          ) : null
        }
      >
        {eintraege.length === 0 ? (
          <p className="text-sm text-text-muted">
            Keine Einträge in {daten.jahr}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  {daten.verwalten ? (
                    <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  ) : null}
                  <th className="py-2 pr-3 font-medium">Art</th>
                  <th className="py-2 pr-3 font-medium">Zeitraum</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Arbeitstage
                  </th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {eintraege.map((a) => (
                  <tr key={a.id} className="border-t border-hairline">
                    {daten.verwalten ? (
                      <td className="py-2 pr-3 text-heading">
                        {name(a.mitarbeiterId)}
                      </td>
                    ) : null}
                    <td className="py-2 pr-3">
                      {artLabel(a)}
                      {a.notiz ? (
                        <div className="text-xs text-text-subtle">
                          {a.notiz}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {formatDate(a.von)}
                      {a.bis !== a.von
                        ? ` bis ${formatDate(a.bis)}`
                        : a.halbtag
                          ? " (halber Tag)"
                          : ""}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {arbeitstage(a.von, a.bis, a.halbtag).toLocaleString(
                        "de-DE",
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {a.status === "beantragt"
                        ? "beantragt"
                        : a.status === "genehmigt"
                          ? "genehmigt"
                          : "abgelehnt"}
                    </td>
                    <td className="py-2 text-right">
                      {daten.verwalten ||
                      a.status === "beantragt" ||
                      (a.art !== "urlaub" && a.art !== "sonderurlaub") ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Eintrag löschen"
                          onClick={() =>
                            void ausfuehren(
                              { typ: "abwesenheit_loeschen", id: a.id },
                              "Eintrag gelöscht.",
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kasten>

      {neu ? (
        <EintragDialog k={k} offen={neu} onClose={() => setNeu(false)} />
      ) : null}
    </div>
  );
}
