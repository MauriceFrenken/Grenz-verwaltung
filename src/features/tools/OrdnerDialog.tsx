import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { holeAblageKinder } from "@/lib/graph-cache/fetchers";
import {
  anhangAusOrdner,
  bildAusOrdner,
  type Anhang,
} from "@/lib/ki-tools/client";
import {
  istBild,
  istExcel,
  istPdf,
  istText,
  istWord,
} from "@/lib/ki-tools/unterlagen";

type Ebene = { id: string | null; name: string };

const lesbar = (name: string) =>
  istPdf(name) ||
  istExcel(name) ||
  istText(name) ||
  istWord(name) ||
  istBild(name);

/**
 * Objektordner aus der OneDrive-Ablage wählen. Beim Verbinden werden alle lesbaren Dateien
 * (PDF, Excel, Word, Text, Fotos) aus dem Ordner und zwei Unterordner-Ebenen geladen.
 */
export function OrdnerDialog({
  offen,
  onOffen,
  token,
  onVerbunden,
}: {
  offen: boolean;
  onOffen: (offen: boolean) => void;
  token: string;
  onVerbunden: (
    ordner: string,
    anhaenge: Anhang[],
    uebersprungen: string[],
  ) => void;
}) {
  const [pfad, setPfad] = useState<Ebene[]>([{ id: null, name: "Ablage" }]);
  const [laden, setLaden] = useState<{ fertig: number; gesamt: number } | null>(
    null,
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = pfad[pfad.length - 1];

  const kinder = useQuery({
    queryKey: ["ki-tools", "ordner", aktuell.id],
    queryFn: () => holeAblageKinder(token, aktuell.id),
    enabled: offen && !!token,
    staleTime: 60_000,
  });
  const ordner = (kinder.data?.items ?? []).filter((i) => i.istOrdner);
  const dateien = (kinder.data?.items ?? []).filter((i) => !i.istOrdner);

  async function verbinden() {
    if (!aktuell.id) return;
    setFehler(null);
    try {
      const { kiOrdnerDateienFn, kiOrdnerDateiFn } =
        await import("@/lib/ki-tools/server-fn");
      const alle = await kiOrdnerDateienFn({
        data: { supabaseAccessToken: token, itemId: aktuell.id },
      });
      const liste = alle.filter((d) => lesbar(d.name)).slice(0, 80);
      const uebersprungen = alle
        .filter((d) => !lesbar(d.name))
        .map((d) => d.pfad);
      const anhaenge: Anhang[] = [];
      let fertig = 0;
      setLaden({ fertig, gesamt: liste.length });
      const warteschlange = [...liste];
      const arbeiter = async () => {
        for (let d = warteschlange.shift(); d; d = warteschlange.shift()) {
          try {
            const inhalt = await kiOrdnerDateiFn({
              data: { supabaseAccessToken: token, itemId: d.id, name: d.name },
            });
            if (inhalt.art === "text") anhaenge.push(anhangAusOrdner(inhalt));
            else if (inhalt.art === "bild")
              anhaenge.push(
                await bildAusOrdner(inhalt.name, inhalt.base64, inhalt.mime),
              );
            else uebersprungen.push(`${d.pfad} (${inhalt.grund})`);
          } catch {
            uebersprungen.push(`${d.pfad} (nicht lesbar)`);
          }
          setLaden({ fertig: (fertig += 1), gesamt: liste.length });
        }
      };
      await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
      onVerbunden(aktuell.name, anhaenge, uebersprungen);
      onOffen(false);
    } catch (e) {
      setFehler(
        e instanceof Error ? e.message : "Ordner konnte nicht gelesen werden.",
      );
    } finally {
      setLaden(null);
    }
  }

  return (
    <Dialog open={offen} onOpenChange={(o) => !laden && onOffen(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Objektordner verbinden</DialogTitle>
          <DialogDescription>
            Ordner in der OneDrive-Ablage wählen. PDFs, Excel- und Word-Dateien
            sowie Fotos werden gelesen, Unterordner eingeschlossen.
          </DialogDescription>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          {pfad.map((e, i) => (
            <span key={`${e.id}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                type="button"
                className="hover:text-heading disabled:font-semibold disabled:text-heading"
                disabled={i === pfad.length - 1 || !!laden}
                onClick={() => setPfad(pfad.slice(0, i + 1))}
              >
                {e.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="h-72 overflow-y-auto rounded-md border border-hairline">
          {kinder.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lädt …
            </div>
          ) : kinder.isError ? (
            <p className="p-4 text-sm text-destructive">
              Ablage nicht erreichbar. Ist Microsoft unter Einstellungen →
              Integrationen verbunden?
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {ordner.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={!!laden}
                    onClick={() =>
                      setPfad([...pfad, { id: o.id, name: o.name }])
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Folder
                      className="h-4 w-4 shrink-0 text-text-muted"
                      strokeWidth={1.5}
                    />
                    <span className="truncate">{o.name}</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" />
                  </button>
                </li>
              ))}
              {!ordner.length && (
                <li className="px-3 py-2 text-sm text-text-muted">
                  Keine Unterordner
                  {dateien.length
                    ? `, ${dateien.length} Dateien in diesem Ordner.`
                    : "."}
                </li>
              )}
            </ul>
          )}
        </div>

        {fehler && <p className="text-sm text-destructive">{fehler}</p>}

        <DialogFooter className="items-center gap-2">
          {laden && (
            <span className="mr-auto text-xs text-text-muted">
              {laden.fertig} von {laden.gesamt} Dateien gelesen
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => onOffen(false)}
            disabled={!!laden}
          >
            Abbrechen
          </Button>
          <Button onClick={verbinden} disabled={!aktuell.id || !!laden}>
            {laden ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            „{aktuell.name}“ verbinden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
