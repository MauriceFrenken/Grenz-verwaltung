import { Link } from "@tanstack/react-router";
import { Download, Globe, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import type { Anhang } from "@/lib/ki-tools/client";
import type { KiToolDefinition } from "@/lib/ki-tools/tools";
import type {
  DateiToolId,
  MarktpreisDaten,
  ToolErgebnis,
} from "@/lib/ki-tools/typen";
import { cn } from "@/lib/utils";

import { KiEingabe } from "./KiEingabe";
import { KiErgebnis } from "./KiErgebnis";

type Nachricht = { text: string; anhaenge: number };

/**
 * Seite eines KI-Tools: Unterlagen und Anweisung rein, geprüfte Daten mit Belegen raus,
 * daraus die Datei in der Grenz-&-Co.-Vorlage. Folgeanweisungen ändern das bisherige Ergebnis.
 */
export function KiToolPage({
  tool,
}: {
  tool: KiToolDefinition & { id: DateiToolId };
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [text, setText] = useState("");
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([]);
  const [verlauf, setVerlauf] = useState<Nachricht[]>([]);
  const [ergebnis, setErgebnis] = useState<ToolErgebnis | null>(null);
  const [schritt, setSchritt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [websuche, setWebsuche] = useState(true);
  const [erstellen, setErstellen] = useState(false);

  async function senden() {
    const anweisung = text.trim();
    setFehler(null);
    setVerlauf((v) => [...v, { text: anweisung, anhaenge: anhaenge.length }]);
    setText("");
    try {
      const { kiAuswertenFn, kiMarktpreisRechercheFn } =
        await import("@/lib/ki-tools/server-fn");
      setSchritt(
        ergebnis
          ? "Ergebnis wird angepasst …"
          : "Unterlagen werden ausgewertet …",
      );
      const unterlagen = anhaenge.flatMap((a) =>
        a.art === "unterlage" ? [a.unterlage] : [],
      );
      const bildnamen = anhaenge.flatMap((a) =>
        a.art === "bild" ? [a.name] : [],
      );
      let neu = await kiAuswertenFn({
        data: {
          supabaseAccessToken: token,
          tool: tool.id,
          unterlagen,
          anweisung,
          bildnamen,
          vorher: ergebnis,
        },
      });
      if (neu.tool === "marktpreis") {
        setErgebnis(neu);
        setSchritt(
          websuche
            ? "Vergleichsobjekte: Grenz-Daten und Websuche …"
            : "Vergleichsobjekte aus den Grenz-Daten …",
        );
        const recherche = await kiMarktpreisRechercheFn({
          data: {
            supabaseAccessToken: token,
            daten: neu.daten as MarktpreisDaten,
            anweisung,
            websuche,
          },
        });
        neu = {
          ...recherche,
          hinweise: [...new Set([...neu.hinweise, ...recherche.hinweise])],
          verworfen: neu.verworfen + recherche.verworfen,
        };
      }
      setErgebnis(neu);
    } catch (e) {
      setFehler(
        e instanceof Error ? e.message : "Die Auswertung ist fehlgeschlagen.",
      );
      setText(anweisung);
      setVerlauf((v) => v.slice(0, -1));
    } finally {
      setSchritt(null);
    }
  }

  async function herunterladen() {
    if (!ergebnis) return;
    setErstellen(true);
    try {
      const { dateiErstellen, herunterladen: speichern } =
        await import("@/lib/ki-tools/client");
      const bilder = anhaenge.flatMap((a) =>
        a.art === "bild" ? [a.bild] : [],
      );
      speichern(await dateiErstellen(token, ergebnis, bilder));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Datei konnte nicht erstellt werden.",
        { duration: 8_000 },
      );
    } finally {
      setErstellen(false);
    }
  }

  function neuBeginnen() {
    setErgebnis(null);
    setVerlauf([]);
    setAnhaenge([]);
    setText("");
    setFehler(null);
  }

  const laeuft = schritt !== null;

  return (
    <>
      <PageHeader
        titel={tool.label}
        beschreibung={tool.beschreibung}
        aktionen={
          ergebnis ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={neuBeginnen}
                disabled={laeuft}
              >
                <RotateCcw className="h-4 w-4" /> Neu
              </Button>
              <Button
                size="sm"
                onClick={herunterladen}
                disabled={laeuft || erstellen}
              >
                {erstellen ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {tool.format} herunterladen
              </Button>
            </div>
          ) : undefined
        }
      />
      <PageWrapper>
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {tool.id === "expose" && verlauf.length === 0 && (
            <p className="border-l-[3px] border-l-[var(--gc-hellblau)] bg-surface px-4 py-3 text-sm text-text-muted">
              Für ein Mandat aus Salesforce das Exposé besser in der{" "}
              <Link to="/mandate" className="text-heading underline">
                Mandatsakte › Exposé
              </Link>{" "}
              erstellen: Objektdaten, Objektordner, Freigabe und Ablage in
              Salesforce sind dort schon verbunden. Dieses Tool ist für Objekte
              ohne Mandat.
            </p>
          )}
          {verlauf.length > 0 && (
            <div className="flex flex-col items-end gap-2">
              {verlauf.map((n, i) => (
                <div
                  key={i}
                  className="max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm text-heading"
                >
                  {n.text || (
                    <span className="text-text-muted">
                      Unterlagen auswerten
                    </span>
                  )}
                  {n.anhaenge > 0 && (
                    <span className="ml-2 text-xs text-text-muted">
                      · {n.anhaenge} Dateien
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {schritt && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {schritt}
              <span className="text-xs">
                (kann ein bis drei Minuten dauern)
              </span>
            </div>
          )}

          {fehler && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {fehler}
            </p>
          )}

          {ergebnis && (
            <TooltipProvider delayDuration={150}>
              <KiErgebnis ergebnis={ergebnis} />
            </TooltipProvider>
          )}

          <div className={cn(ergebnis && "sticky bottom-4")}>
            <KiEingabe
              text={text}
              onText={setText}
              anhaenge={anhaenge}
              onAnhaenge={setAnhaenge}
              onSenden={senden}
              laeuft={laeuft}
              platzhalter={
                ergebnis
                  ? "Was soll angepasst werden? z. B. Kaufpreis auf 2,4 Mio. € setzen"
                  : tool.platzhalter
              }
              hinweis={
                ergebnis
                  ? undefined
                  : `Hilfreich: ${tool.unterlagen}. Gescannte PDFs ohne Text können nicht gelesen werden.`
              }
              zusatz={
                tool.id === "marktpreis" ? (
                  <button
                    type="button"
                    onClick={() => setWebsuche((w) => !w)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-muted",
                      websuche ? "text-heading" : "text-text-muted",
                    )}
                    aria-pressed={websuche}
                  >
                    <Globe className="h-4 w-4" strokeWidth={1.5} />
                    Websuche {websuche ? "an" : "aus"}
                  </button>
                ) : undefined
              }
            />
          </div>
        </div>
      </PageWrapper>
    </>
  );
}
