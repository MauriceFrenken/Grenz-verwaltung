import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { LoeschenDialog } from "@/components/shared/LoeschenDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  VERTRAGSARTEN,
  type Mitarbeiter,
  type Vertragsart,
} from "@/lib/personal/typen";

import { Auswahl, Feld } from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

const LEER: Partial<Mitarbeiter> = {
  name: "",
  vertragsart: "vollzeit",
  urlaubstageJahr: 30,
  weiterbildungspflichtig: true,
};

/** Mitarbeiterakte anlegen oder bearbeiten. Ohne Personalrecht nur Kontakt- und Notfalldaten. */
export function AkteDialog({
  k,
  mitarbeiter,
  offen,
  onClose,
}: {
  k: PersonalKontext;
  /** null = neu anlegen */
  mitarbeiter: Mitarbeiter | null;
  offen: boolean;
  onClose: () => void;
}) {
  const { daten, ausfuehren } = k;
  const [m, setM] = useState<Partial<Mitarbeiter>>(LEER);
  const [jahr, setJahr] = useState({ uebertrag: "", ziel: "" });
  const [speichert, setSpeichert] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const voll = daten.verwalten;

  useEffect(() => {
    if (!offen) return;
    setM(mitarbeiter ?? LEER);
    const jw = mitarbeiter
      ? daten.jahreswerte.find(
          (j) => j.mitarbeiterId === mitarbeiter.id && j.jahr === daten.jahr,
        )
      : undefined;
    setJahr({
      uebertrag: jw ? String(jw.urlaubUebertrag) : "",
      ziel: jw?.provisionszielEur != null ? String(jw.provisionszielEur) : "",
    });
  }, [offen, mitarbeiter, daten]);

  const setze = <K extends keyof Mitarbeiter>(f: K, w: Mitarbeiter[K] | null) =>
    setM((x) => ({ ...x, [f]: w }));
  const txt = (f: keyof Mitarbeiter) =>
    ((m[f] as string | number | null | undefined) ?? "").toString();
  const nr = (v: string) =>
    v.trim() === "" ? null : Number(v.replace(",", "."));

  /** Verknüpfter App-Benutzer füllt Name und E-Mail vor. */
  const benutzerWaehlen = (id: string) => {
    const b = daten.benutzer.find((x) => x.id === id);
    setM((x) => ({
      ...x,
      profilId: id || null,
      name: x.name || b?.name || "",
      email: x.email || b?.email || null,
      position: x.position || b?.stellenbezeichnung || null,
    }));
  };

  const speichern = async () => {
    setSpeichert(true);
    const ok = await ausfuehren(
      {
        typ: "mitarbeiter_speichern",
        mitarbeiter: { ...m, name: m.name ?? "" },
      },
      mitarbeiter ? "Akte gespeichert." : "Mitarbeiter angelegt.",
    );
    if (
      ok &&
      voll &&
      mitarbeiter &&
      (jahr.uebertrag !== "" || jahr.ziel !== "")
    ) {
      await ausfuehren({
        typ: "jahreswert_speichern",
        mitarbeiterId: mitarbeiter.id,
        jahr: daten.jahr,
        urlaubUebertrag: nr(jahr.uebertrag) ?? 0,
        provisionszielEur: nr(jahr.ziel),
      });
    }
    setSpeichert(false);
    if (ok) onClose();
  };

  const vergeben = new Set(
    daten.mitarbeiter.map((x) => x.profilId).filter(Boolean),
  );

  return (
    <>
      <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mitarbeiter ? mitarbeiter.name : "Mitarbeiter anlegen"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {voll ? (
              <Feld
                label="App-Benutzer"
                hinweis="Verknüpft die Akte mit der Anmeldung (eigene Akte, Urlaubsanträge)."
              >
                <Auswahl
                  wert={m.profilId ?? ""}
                  leer="ohne App-Zugang"
                  optionen={daten.benutzer
                    .filter((b) => b.id === m.profilId || !vergeben.has(b.id))
                    .map((b) => ({
                      wert: b.id,
                      label: `${b.name} (${b.email})`,
                    }))}
                  onChange={benutzerWaehlen}
                />
              </Feld>
            ) : null}
            <Feld label="Name">
              <Input
                value={txt("name")}
                onChange={(e) => setze("name", e.target.value)}
              />
            </Feld>
            <Feld label="Position">
              <Input
                value={txt("position")}
                disabled={!voll}
                onChange={(e) => setze("position", e.target.value)}
              />
            </Feld>
            <Feld label="E-Mail">
              <Input
                value={txt("email")}
                onChange={(e) => setze("email", e.target.value)}
              />
            </Feld>
            <Feld label="Telefon">
              <Input
                value={txt("telefon")}
                onChange={(e) => setze("telefon", e.target.value)}
              />
            </Feld>
            <Feld label="Geburtstag">
              <Input
                type="date"
                value={txt("geburtstag")}
                onChange={(e) => setze("geburtstag", e.target.value)}
              />
            </Feld>
            <Feld label="Notfallkontakt" className="sm:col-span-2">
              <Input
                value={txt("notfallkontakt")}
                placeholder="Name, Beziehung, Telefon"
                onChange={(e) => setze("notfallkontakt", e.target.value)}
              />
            </Feld>

            <h3 className="label-caps pt-2 text-text-muted sm:col-span-2">
              Vertrag
            </h3>
            <Feld label="Vertragsart">
              <Auswahl
                wert={m.vertragsart ?? "vollzeit"}
                disabled={!voll}
                optionen={Object.entries(VERTRAGSARTEN).map(
                  ([wert, label]) => ({
                    wert: wert as Vertragsart,
                    label,
                  }),
                )}
                onChange={(w) =>
                  setze("vertragsart", (w || "vollzeit") as Vertragsart)
                }
              />
            </Feld>
            <Feld label="Wochenstunden">
              <Input
                inputMode="decimal"
                value={txt("wochenstunden")}
                disabled={!voll}
                onChange={(e) => setze("wochenstunden", nr(e.target.value))}
              />
            </Feld>
            <Feld label="Eintritt">
              <Input
                type="date"
                value={txt("eintrittAm")}
                disabled={!voll}
                onChange={(e) => setze("eintrittAm", e.target.value)}
              />
            </Feld>
            <Feld label="Probezeit bis">
              <Input
                type="date"
                value={txt("probezeitBis")}
                disabled={!voll}
                onChange={(e) => setze("probezeitBis", e.target.value)}
              />
            </Feld>
            <Feld label="Austritt">
              <Input
                type="date"
                value={txt("austrittAm")}
                disabled={!voll}
                onChange={(e) => setze("austrittAm", e.target.value)}
              />
            </Feld>
            <Feld label="Urlaubstage pro Jahr">
              <Input
                inputMode="decimal"
                value={txt("urlaubstageJahr")}
                disabled={!voll}
                onChange={(e) => setze("urlaubstageJahr", nr(e.target.value))}
              />
            </Feld>
            {voll && mitarbeiter ? (
              <>
                <Feld
                  label={`Resturlaub aus ${daten.jahr - 1}`}
                  hinweis={`Wird ${daten.jahr} zum Anspruch addiert.`}
                >
                  <Input
                    inputMode="decimal"
                    value={jahr.uebertrag}
                    onChange={(e) =>
                      setJahr((j) => ({ ...j, uebertrag: e.target.value }))
                    }
                  />
                </Feld>
                <Feld label={`Provisionsziel ${daten.jahr} (€)`}>
                  <Input
                    inputMode="decimal"
                    value={jahr.ziel}
                    onChange={(e) =>
                      setJahr((j) => ({ ...j, ziel: e.target.value }))
                    }
                  />
                </Feld>
              </>
            ) : null}

            <h3 className="label-caps pt-2 text-text-muted sm:col-span-2">
              Verknüpfungen
            </h3>
            <Feld
              label="Salesforce-Benutzer"
              hinweis="Für die Auswertung unter Leistung."
            >
              {voll ? (
                <Auswahl
                  wert={m.sfUserId ?? ""}
                  leer="nicht verknüpft"
                  optionen={daten.sfNutzer.map((s) => ({
                    wert: s.id,
                    label: s.name,
                  }))}
                  onChange={(w) => setze("sfUserId", w || null)}
                />
              ) : (
                <Input value={txt("sfUserId") || "nicht verknüpft"} disabled />
              )}
            </Feld>
            <Feld
              label="Personalakte (OneDrive-Link)"
              hinweis="Verträge und Bescheinigungen bleiben im OneDrive."
            >
              <div className="flex gap-2">
                <Input
                  value={txt("personalakteUrl")}
                  disabled={!voll}
                  placeholder="https://…"
                  onChange={(e) => setze("personalakteUrl", e.target.value)}
                />
                {m.personalakteUrl ? (
                  <Button variant="outline" size="icon" asChild>
                    <a
                      href={m.personalakteUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Personalakte öffnen"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </Feld>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={m.weiterbildungspflichtig !== false}
                disabled={!voll}
                onChange={(e) =>
                  setze("weiterbildungspflichtig", e.target.checked)
                }
              />
              Wirkt an der Maklertätigkeit mit (Weiterbildungspflicht §34c GewO,
              20 Stunden in drei Jahren)
            </label>
            {voll ? (
              <Feld
                label="Notizen (nur Geschäftsführung)"
                className="sm:col-span-2"
              >
                <Textarea
                  rows={3}
                  value={txt("notizen")}
                  onChange={(e) => setze("notizen", e.target.value)}
                />
              </Feld>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            {voll && mitarbeiter ? (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => setLoeschen(true)}
              >
                Akte löschen
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button
                onClick={() => void speichern()}
                disabled={speichert || !m.name?.trim()}
              >
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {mitarbeiter ? (
        <LoeschenDialog
          offen={loeschen}
          onOpenChange={setLoeschen}
          titel="Akte löschen"
          beschreibung={`Die Akte von ${mitarbeiter.name} mit allen Abwesenheiten, Schulungen und Checklisten wird gelöscht. Für Ausgeschiedene besser ein Austrittsdatum setzen.`}
          onLoeschen={async () => {
            if (
              await ausfuehren(
                { typ: "mitarbeiter_loeschen", id: mitarbeiter.id },
                "Akte gelöscht.",
              )
            ) {
              setLoeschen(false);
              onClose();
            }
          }}
        />
      ) : null}
    </>
  );
}
