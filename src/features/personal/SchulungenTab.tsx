import { useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { SOLL_STUNDEN_34C, schulungsstatus } from "@/lib/personal/berechnen";
import { SCHULUNGSARTEN, type Schulungsart } from "@/lib/personal/typen";

import {
  AmpelMarke,
  Auswahl,
  Feld,
  Kasten,
  aktiveMitarbeiter,
  heuteIso,
} from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

export function NeuDialog({
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
    art: "weiterbildung_34c" as Schulungsart,
    titel: "",
    anbieter: "",
    datum: heute,
    stunden: "",
    nachweisUrl: "",
  });
  const mitarbeiterId = f.mitarbeiterId || auswahl[0]?.id || "";
  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schulung erfassen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Mitarbeiter" className="sm:col-span-2">
            <Auswahl
              wert={mitarbeiterId}
              disabled={!daten.verwalten}
              optionen={auswahl.map((m) => ({ wert: m.id, label: m.name }))}
              onChange={(w) => setF((x) => ({ ...x, mitarbeiterId: w }))}
            />
          </Feld>
          <Feld label="Art" className="sm:col-span-2">
            <Auswahl
              wert={f.art}
              optionen={Object.entries(SCHULUNGSARTEN).map(([wert, label]) => ({
                wert: wert as Schulungsart,
                label,
              }))}
              onChange={(w) =>
                setF((x) => ({ ...x, art: (w || "sonstige") as Schulungsart }))
              }
            />
          </Feld>
          <Feld label="Titel" className="sm:col-span-2">
            <Input
              value={f.titel}
              placeholder="z. B. Wertermittlung von Zinshäusern"
              onChange={(e) => setF((x) => ({ ...x, titel: e.target.value }))}
            />
          </Feld>
          <Feld label="Anbieter">
            <Input
              value={f.anbieter}
              placeholder="IHK, IVD, Online-Akademie …"
              onChange={(e) =>
                setF((x) => ({ ...x, anbieter: e.target.value }))
              }
            />
          </Feld>
          <Feld label="Datum">
            <Input
              type="date"
              value={f.datum}
              onChange={(e) => setF((x) => ({ ...x, datum: e.target.value }))}
            />
          </Feld>
          <Feld
            label="Zeitstunden"
            hinweis="Für §34c zählen Zeitstunden à 60 Minuten."
          >
            <Input
              inputMode="decimal"
              value={f.stunden}
              onChange={(e) => setF((x) => ({ ...x, stunden: e.target.value }))}
            />
          </Feld>
          <Feld label="Nachweis (OneDrive-Link)">
            <Input
              value={f.nachweisUrl}
              placeholder="https://…"
              onChange={(e) =>
                setF((x) => ({ ...x, nachweisUrl: e.target.value }))
              }
            />
          </Feld>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!mitarbeiterId || !f.titel.trim() || !f.datum}
            onClick={async () => {
              const ok = await ausfuehren(
                {
                  typ: "schulung_speichern",
                  schulung: {
                    mitarbeiterId,
                    art: f.art,
                    titel: f.titel,
                    anbieter: f.anbieter || null,
                    datum: f.datum,
                    stunden: f.stunden
                      ? Number(f.stunden.replace(",", "."))
                      : null,
                    nachweisUrl: f.nachweisUrl || null,
                    notiz: null,
                  },
                },
                "Schulung erfasst.",
              );
              if (ok) onClose();
            }}
          >
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SchulungenTab({ k }: { k: PersonalKontext }) {
  const { daten, ausfuehren } = k;
  const heute = heuteIso();
  const [neu, setNeu] = useState(false);
  const mitarbeiter = aktiveMitarbeiter(daten.mitarbeiter, heute).filter(
    (m) => m.vollstaendig,
  );
  const name = (id: string) =>
    daten.mitarbeiter.find((m) => m.id === id)?.name ?? "–";
  const zeitraum = mitarbeiter[0]
    ? schulungsstatus(mitarbeiter[0], [], heute).zeitraum
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Kasten titel="Pflichten im Überblick">
        <div className="grid gap-3 text-sm text-text-muted md:grid-cols-3">
          <p>
            <span className="font-medium text-heading">
              Weiterbildung §34c GewO:
            </span>{" "}
            {SOLL_STUNDEN_34C} Zeitstunden je drei Kalenderjahre für Makler und
            alle, die an der Maklertätigkeit mitwirken (§15b MaBV). Nachweise
            fünf Jahre aufbewahren.
            {zeitraum
              ? ` Laufender Zeitraum: ${formatDate(zeitraum.von)} bis ${formatDate(zeitraum.bis)}.`
              : ""}
          </p>
          <p>
            <span className="font-medium text-heading">Geldwäsche (GwG):</span>{" "}
            Immobilienmakler sind Verpflichtete. Mitarbeiter müssen bei
            Einstellung und danach regelmäßig unterrichtet werden (§6 Abs. 2 Nr.
            6 GwG). Hier gilt jährlich als Maßstab.
          </p>
          <p>
            <span className="font-medium text-heading">Datenschutz:</span>{" "}
            Verpflichtung auf Vertraulichkeit beim Eintritt, danach jährliche
            Unterweisung als gute Praxis.
          </p>
        </div>
      </Kasten>

      <Kasten
        titel="Stand je Mitarbeiter"
        aktion={
          daten.verwalten || daten.ichId ? (
            <Button size="sm" onClick={() => setNeu(true)}>
              <Plus className="size-4" /> Schulung erfassen
            </Button>
          ) : null
        }
      >
        {mitarbeiter.length === 0 ? (
          <p className="text-sm text-text-muted">
            Noch keine Mitarbeiterakten.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  <th className="py-2 pr-3 font-medium">§34c im Zeitraum</th>
                  <th className="py-2 pr-3 font-medium">
                    Letzte GwG-Unterweisung
                  </th>
                  <th className="py-2 font-medium">
                    Letzte Datenschutz-Unterweisung
                  </th>
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((m) => {
                  const st = schulungsstatus(m, daten.schulungen, heute);
                  return (
                    <tr key={m.id} className="border-t border-hairline">
                      <td className="py-2 pr-3 font-medium text-heading">
                        {m.name}
                      </td>
                      <td className="py-2 pr-3">
                        <AmpelMarke ampel={st.ampel34c}>
                          {st.ampel34c === "entfaellt"
                            ? "keine Pflicht"
                            : `${st.stunden34c.toLocaleString("de-DE")} von ${SOLL_STUNDEN_34C} h`}
                        </AmpelMarke>
                      </td>
                      <td className="py-2 pr-3">
                        <AmpelMarke ampel={st.ampelGwg}>
                          {st.letzteGwg ? formatDate(st.letzteGwg) : "fehlt"}
                        </AmpelMarke>
                      </td>
                      <td className="py-2">
                        <AmpelMarke ampel={st.ampelDatenschutz}>
                          {st.letzteDatenschutz
                            ? formatDate(st.letzteDatenschutz)
                            : "fehlt"}
                        </AmpelMarke>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kasten>

      <Kasten titel="Nachweise">
        {daten.schulungen.length === 0 ? (
          <p className="text-sm text-text-muted">
            Noch keine Schulungen erfasst.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  <th className="py-2 pr-3 font-medium">Datum</th>
                  <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  <th className="py-2 pr-3 font-medium">Schulung</th>
                  <th className="py-2 pr-3 text-right font-medium">Stunden</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {daten.schulungen.map((s) => (
                  <tr key={s.id} className="border-t border-hairline">
                    <td className="py-2 pr-3 tabular-nums">
                      {formatDate(s.datum)}
                    </td>
                    <td className="py-2 pr-3">{name(s.mitarbeiterId)}</td>
                    <td className="py-2 pr-3">
                      <div className="text-heading">{s.titel}</div>
                      <div className="text-xs text-text-subtle">
                        {SCHULUNGSARTEN[s.art]}
                        {s.anbieter ? ` · ${s.anbieter}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {s.stunden?.toLocaleString("de-DE") ?? "–"}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {s.nachweisUrl ? (
                        <Button size="icon" variant="ghost" asChild>
                          <a
                            href={s.nachweisUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Nachweis öffnen"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Schulung löschen"
                        onClick={() =>
                          void ausfuehren(
                            { typ: "schulung_loeschen", id: s.id },
                            "Schulung gelöscht.",
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kasten>

      {neu ? (
        <NeuDialog k={k} offen={neu} onClose={() => setNeu(false)} />
      ) : null}
    </div>
  );
}
