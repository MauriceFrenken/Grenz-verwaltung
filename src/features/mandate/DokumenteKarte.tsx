import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { EntwurfZeile } from "@/lib/expose-generator/server-fn";

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  in_pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
  archiviert: "Archiviert",
};

/** Exposés und Teaser eines Mandats: anlegen, öffnen, neue Version. */
export function DokumenteKarte({ token, sfId }: { token: string; sfId: string }) {
  const navigate = useNavigate();
  const [liste, setListe] = useState<EntwurfZeile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { entwuerfeFn } = await import("@/lib/expose-generator/server-fn");
      setListe(await entwuerfeFn({ data: { supabaseAccessToken: token, mandatSfId: sfId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exposés konnten nicht geladen werden.");
      setListe([]);
    }
  }, [token, sfId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const anlegen = async (typ: "expose" | "teaser", vorlageId?: string) => {
    setBusy(vorlageId ?? typ);
    try {
      const { entwurfAnlegenFn } = await import("@/lib/expose-generator/server-fn");
      const { id } = await entwurfAnlegenFn({ data: { supabaseAccessToken: token, mandatSfId: sfId, typ, vorlageId } });
      await navigate({ to: "/mandate/$sfId/dokument/$id", params: { sfId, id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Entwurf konnte nicht angelegt werden.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-heading">Exposé und Teaser</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void anlegen("teaser")} disabled={!!busy}>
            {busy === "teaser" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Teaser anlegen
          </Button>
          <Button size="sm" onClick={() => void anlegen("expose")} disabled={!!busy}>
            {busy === "expose" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Exposé anlegen
          </Button>
        </div>
      </div>
      {!liste ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : liste.length ? (
        <table className="w-full text-sm">
          <tbody>
            {liste.map((d) => (
              <tr key={d.id} className="border-t border-hairline">
                <td className="py-2 pr-3">
                  <Link to="/mandate/$sfId/dokument/$id" params={{ sfId, id: d.id }} className="font-medium text-heading hover:underline">
                    {d.titel}
                  </Link>
                  <span className="text-text-subtle"> · v{d.version}</span>
                </td>
                <td className="py-2 pr-3">{STATUS_TEXT[d.status] ?? d.status}</td>
                <td className="py-2 pr-3 text-text-subtle">{formatDate(d.updatedAt)}</td>
                <td className="py-2 text-right">
                  {d.status !== "entwurf" ? (
                    <Button size="sm" variant="ghost" onClick={() => void anlegen(d.typ, d.id)} disabled={!!busy}>
                      Neue Version
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-text-muted">
          Noch kein Entwurf. Angaben werden aus Salesforce vorbelegt; Unterlagen (Energieausweis, Mieterliste) liest die KI mit Seitenbeleg aus.
        </p>
      )}
    </section>
  );
}
