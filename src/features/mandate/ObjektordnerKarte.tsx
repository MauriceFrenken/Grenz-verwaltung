import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { MandatOrdnerDto } from "@/lib/mandate/ordner-server-fn";
import { KATEGORIEN, type OrdnerDatei } from "@/lib/mandate/ordner";
import type { Steckbrief, SteckbriefBeleg } from "@/lib/mandate/steckbrief-ki";

function Beleg({ b }: { b: SteckbriefBeleg }) {
  const text = `${b.datei}, ${b.stelle}`;
  return (
    <span className="text-xs text-text-subtle" title={`„${b.zitat}“`}>
      {b.webUrl ? (
        <a
          href={b.webUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}

function SteckbriefAnsicht({ s }: { s: Steckbrief }) {
  return (
    <div className="flex flex-col gap-4">
      {s.zusammenfassung ? (
        <p className="text-sm leading-relaxed text-text">{s.zusammenfassung}</p>
      ) : null}
      {s.angaben.length ? (
        <table className="w-full text-sm">
          <tbody>
            {s.angaben.map((a, i) => (
              <tr key={i} className="border-t border-hairline align-top">
                <td className="w-48 py-1.5 pr-3 text-text-muted">{a.label}</td>
                <td className="py-1.5 pr-3 font-medium text-heading">
                  {a.wert}
                </td>
                <td className="py-1.5 text-right">
                  <Beleg b={a.beleg} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Besonderheiten", s.besonderheiten],
            ["Risiken", s.risiken],
          ] as const
        ).map(([titel, liste]) => (
          <div key={titel} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
              {titel}
            </h3>
            {liste.length ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {liste.map((h, i) => (
                  <li key={i}>
                    {h.text} <Beleg b={h.beleg} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">Keine belegten Angaben.</p>
            )}
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Offene Punkte
          </h3>
          {s.offenePunkte.length ? (
            <ul className="list-disc pl-4 text-sm">
              {s.offenePunkte.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Keine.</p>
          )}
        </div>
      </div>
      <p className="text-xs text-text-subtle">
        Erstellt am {formatDate(s.erstelltAm)} aus{" "}
        {s.ausgewertet
          .map((a) => (a.hinweis ? `${a.datei} (${a.hinweis})` : a.datei))
          .join(", ")}
        . Jede Angabe ist wörtlich in der Unterlage belegt (Zitat beim
        Darüberfahren)
        {s.verworfen
          ? `; ${s.verworfen} unbelegte Angaben wurden verworfen`
          : ""}
        .
      </p>
    </div>
  );
}

function groesse(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DateiListe({ dateien }: { dateien: OrdnerDatei[] }) {
  const gruppen = useMemo(
    () =>
      [
        ...KATEGORIEN.map((k) => ({ id: k.id, label: k.label })),
        { id: "sonstiges", label: "Sonstiges" },
      ]
        .map((k) => ({
          ...k,
          dateien: dateien.filter((d) => d.kategorie === k.id),
        }))
        .filter((g) => g.dateien.length),
    [dateien],
  );
  return (
    <div className="flex flex-col divide-y divide-hairline border border-hairline">
      {gruppen.map((g) => (
        <details key={g.id} className="group">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-surface-muted">
            <span className="font-medium text-heading">{g.label}</span>
            <span className="text-xs text-text-subtle">{g.dateien.length}</span>
          </summary>
          <ul className="px-3 pb-2 text-sm">
            {g.dateien.slice(0, 60).map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-0.5">
                <span className="flex-1 truncate">
                  {d.webUrl ? (
                    <a
                      href={d.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {d.name}
                    </a>
                  ) : (
                    d.name
                  )}
                  {d.unterordner ? (
                    <span className="text-xs text-text-subtle">
                      {" "}
                      · {d.unterordner}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-subtle">
                  {formatDate(d.geaendertAm)} · {groesse(d.groesse)}
                </span>
              </li>
            ))}
            {g.dateien.length > 60 ? (
              <li className="py-0.5 text-xs text-text-subtle">
                … und {g.dateien.length - 60} weitere
              </li>
            ) : null}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** Überblick der Mandatsakte: Objektordner in „Grenz & Co (neu)“, Unterlagen-Check und KI-Steckbrief. */
export function ObjektordnerKarte({
  token,
  sfId,
}: {
  token: string;
  sfId: string;
}) {
  const [dto, setDto] = useState<MandatOrdnerDto | null>(null);
  const [steckbrief, setSteckbrief] = useState<Steckbrief | null>(null);
  const [busy, setBusy] = useState<
    "laden" | "steckbrief" | "verknuepfen" | null
  >("laden");

  const laden = useCallback(async () => {
    if (!token) return;
    setBusy("laden");
    try {
      const { mandatOrdnerFn } = await import("@/lib/mandate/ordner-server-fn");
      const r = await mandatOrdnerFn({
        data: { supabaseAccessToken: token, mandatSfId: sfId },
      });
      setDto(r);
      setSteckbrief(r.steckbrief);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Objektordner konnte nicht geladen werden.",
      );
    } finally {
      setBusy(null);
    }
  }, [token, sfId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const steckbriefErstellen = async () => {
    if (!dto?.ordner) return;
    setBusy("steckbrief");
    try {
      const { mandatSteckbriefFn } =
        await import("@/lib/mandate/ordner-server-fn");
      setSteckbrief(
        await mandatSteckbriefFn({
          data: {
            supabaseAccessToken: token,
            mandatSfId: sfId,
            ordnerId: dto.ordner.id,
          },
        }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Steckbrief fehlgeschlagen.",
        {
          duration: 12_000,
        },
      );
    } finally {
      setBusy(null);
    }
  };

  const verknuepfen = async (itemId: string | null) => {
    setBusy("verknuepfen");
    try {
      const { mandatOrdnerVerknuepfenFn } =
        await import("@/lib/mandate/ordner-server-fn");
      await mandatOrdnerVerknuepfenFn({
        data: { supabaseAccessToken: token, mandatSfId: sfId, itemId },
      });
      await laden();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Verknüpfen fehlgeschlagen.",
      );
      setBusy(null);
    }
  };

  const o = dto?.ordner;
  const fehlend = dto?.unterlagen.filter((u) => u.pflicht && !u.anzahl) ?? [];

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-heading">
            <FolderOpen className="h-4 w-4" /> Objektunterlagen aus OneDrive
          </h2>
          {o ? (
            <p className="text-xs text-text-subtle">
              {o.pfad ? `${o.pfad} › ` : ""}
              {o.webUrl ? (
                <a
                  href={o.webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-heading hover:underline"
                >
                  {o.name} <ExternalLink className="inline h-3 w-3" />
                </a>
              ) : (
                o.name
              )}{" "}
              ·{" "}
              {o.quelle === "verknuepft"
                ? "fest verknüpft"
                : "automatisch nach Adresse gefunden"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void laden()}
            disabled={!!busy}
          >
            {busy === "laden" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Aktualisieren
          </Button>
          {o ? (
            <Button
              size="sm"
              onClick={() => void steckbriefErstellen()}
              disabled={!!busy}
            >
              {busy === "steckbrief" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {steckbrief
                ? "Steckbrief neu erstellen"
                : "Steckbrief aus Unterlagen erstellen"}
            </Button>
          ) : null}
        </div>
      </div>

      {!dto ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : !dto.eingerichtet ? (
        <p className="text-sm text-text-muted">
          Die Objektablage „Grenz &amp; Co (neu)“ ist noch nicht angebunden.
          Sobald der Ordner-Link und die Microsoft-Freigabe hinterlegt sind,
          sucht die App hier den Ordner zu diesem Objekt und stellt die
          Unterlagen zusammen.
        </p>
      ) : dto.fehler ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {dto.fehler}
        </p>
      ) : !o ? (
        <p className="text-sm text-text-muted">
          In „Grenz &amp; Co (neu)“ gibt es keinen Ordner, dessen Name zu Straße
          und Hausnummer dieses Objekts passt.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {dto.unterlagen
              .filter((u) => u.pflicht || u.anzahl)
              .map((u) => (
                <span
                  key={u.kategorie}
                  className={
                    u.anzahl
                      ? "inline-flex items-center gap-1 border border-hairline px-2 py-1 text-xs"
                      : "inline-flex items-center gap-1 border border-dashed border-destructive/50 px-2 py-1 text-xs text-destructive"
                  }
                >
                  {u.anzahl ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5" />
                  )}
                  {u.label}
                  {u.anzahl ? ` (${u.anzahl})` : " fehlt"}
                </span>
              ))}
          </div>
          {fehlend.length ? (
            <p className="text-xs text-text-subtle">
              Für die Vermarktung fehlen noch:{" "}
              {fehlend.map((u) => u.label).join(", ")}. Erkannt wird nach Datei-
              und Ordnernamen.
            </p>
          ) : null}

          {busy === "steckbrief" ? (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Die KI liest Exposé,
              Mieterliste, Kalkulation und weitere Unterlagen. Das dauert etwa
              eine Minute.
            </p>
          ) : steckbrief ? (
            <SteckbriefAnsicht s={steckbrief} />
          ) : (
            <p className="text-sm text-text-muted">
              Noch kein Steckbrief. Die KI liest die wichtigsten Unterlagen
              (PDF, Excel) und fasst Kennzahlen, Besonderheiten, Risiken und
              offene Punkte mit Fundstelle zusammen.
            </p>
          )}

          {dto.dateien.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                Alle Unterlagen ({dto.dateien.length})
              </h3>
              <DateiListe dateien={dto.dateien} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">Der Ordner ist leer.</p>
          )}
        </>
      )}

      {dto?.speichernMoeglich &&
      (dto.kandidaten.length || o?.quelle === "verknuepft") ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
          <span>Anderer Ordner:</span>
          {dto.kandidaten.map((k) => (
            <Button
              key={k.id}
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() => void verknuepfen(k.id)}
            >
              {k.name}
            </Button>
          ))}
          {o?.quelle === "verknuepft" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() => void verknuepfen(null)}
            >
              Wieder automatisch suchen
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
