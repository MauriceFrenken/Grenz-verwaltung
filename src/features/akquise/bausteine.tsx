/** Gemeinsame Bausteine der Akquise-Seiten. */

import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  AkquiseDto,
  AktivitaetenFilter,
  Bereich,
} from "@/lib/akquise/typen";

import { sfLink } from "./useAkquiseDaten";

export function StandLeiste({
  daten,
  laedt,
  fehler,
  onNeuLaden,
}: {
  daten: AkquiseDto | null;
  laedt: boolean;
  fehler: string | null;
  onNeuLaden: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
      <span>
        {daten
          ? `Live aus Salesforce, Stand ${new Date(daten.stand).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · Aktivitäten von Sebastian Grenz und Business Development SG`
          : laedt
            ? "Lädt aus Salesforce…"
            : (fehler ?? "Keine Daten.")}
      </span>
      <Button size="sm" variant="outline" onClick={onNeuLaden} disabled={laedt}>
        {laedt ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        Neu laden
      </Button>
    </div>
  );
}

export function Ladehinweis({
  laedt,
  fehler,
}: {
  laedt: boolean;
  fehler: string | null;
}) {
  return (
    <div className="border border-hairline bg-surface p-6 text-sm text-text-muted">
      {laedt ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Salesforce wird
          ausgewertet (rund 3.000 Aktivitäten)…
        </span>
      ) : fehler ? (
        <>
          <p className="font-medium text-heading">
            Salesforce ist nicht erreichbar.
          </p>
          <p className="mt-1">{fehler}</p>
          <p className="mt-1">
            Unter System › Integrationen „Salesforce dauerhaft verbinden“
            prüfen.
          </p>
        </>
      ) : (
        "Keine Daten."
      )}
    </div>
  );
}

export function SfVerweis({
  typ,
  id,
  children,
}: {
  typ: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={sfLink(typ, id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-heading hover:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0 text-text-muted" />
    </a>
  );
}

const auswahl = "h-9 border border-input bg-background px-2 text-sm";

/** Zeitraum, Person und Bereich für die Aktivitäten-Auswertungen. */
export function FilterLeiste({
  filter,
  personen,
  onChange,
}: {
  filter: AktivitaetenFilter;
  personen: string[];
  onChange: (f: AktivitaetenFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 text-xs">
      <label className="flex flex-col gap-1 text-text-subtle">
        Zeitraum
        <select
          className={auswahl}
          value={filter.monate}
          onChange={(e) =>
            onChange({ ...filter, monate: Number(e.target.value) })
          }
        >
          <option value={3}>letzte 3 Monate</option>
          <option value={6}>letzte 6 Monate</option>
          <option value={12}>letzte 12 Monate</option>
          <option value={24}>letzte 24 Monate</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-subtle">
        Person
        <select
          className={auswahl}
          value={filter.person ?? ""}
          onChange={(e) =>
            onChange({ ...filter, person: e.target.value || null })
          }
        >
          <option value="">alle Grenz-User</option>
          {personen.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-subtle">
        Bereich
        <select
          className={auswahl}
          value={filter.bereich ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              bereich: (e.target.value || null) as Bereich | null,
            })
          }
        >
          <option value="akquise">nur Akquise (Verkäufer)</option>
          <option value="vermarktung">nur Vermarktung (Käufer)</option>
          <option value="allgemein">nur Allgemein / Netzwerk</option>
          <option value="">alle Bereiche</option>
        </select>
      </label>
    </div>
  );
}

/** Hinweis, wie Anschreiben gezählt werden (Annahme, bis Grenz das bestätigt). */
export function AnschreibenAnnahme({ offen }: { offen: number }) {
  return (
    <p className="border-l-2 border-primary bg-surface-muted px-3 py-2 text-xs text-text-muted">
      Annahme: Als versendet zählen erledigte „Send Letter“-Aufgaben. Offene
      Aufgaben ({offen.toLocaleString("de-DE")}) gelten als vorbereitet und
      fließen nicht in Versand und Reaktionsquote ein.
    </p>
  );
}
