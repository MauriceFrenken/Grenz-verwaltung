/** Gemeinsame Bausteine der Akquise-Seiten. */

import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AkquiseDto } from "@/lib/akquise/typen";

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
