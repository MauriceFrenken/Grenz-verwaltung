import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Loader2,
  Presentation,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import type { Anhang } from "@/lib/ki-tools/client";
import type { BildDatei } from "@/lib/ki-tools/dateien/powerpoint";
import {
  exposeDateiname,
  freigabeGesperrt,
  pflichtangaben,
} from "@/lib/mandate/expose";
import type {
  ExposeEntwurf,
  ExposeZeile,
} from "@/lib/mandate/expose-server-fn";
import { inTeilenHochladen, linkOeffnen } from "@/lib/mandate/pdf-client";
import { cn } from "@/lib/utils";

import { KiEingabe } from "../tools/KiEingabe";
import { KiErgebnis } from "../tools/KiErgebnis";
import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  in_pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
  archiviert: "Archiviert",
};

type Foto = { id: string; name: string; bild: BildDatei; vorschau: string };

function fehlerText(e: unknown, standard: string): string {
  return e instanceof Error ? e.message : standard;
}

/**
 * Reiter „Exposé“ der Mandatsakte: Exposé in der Original-Vorlage von Grenz & Co. aus
 * Salesforce-Daten, Unterlagen und Fotos des Objektordners; PowerPoint und PDF, Freigabe,
 * Ablage in Salesforce.
 */
export function MandatExposePage({ sfId }: { sfId: string }) {
  const { token, detail } = useMandatDetail(sfId);
  const [liste, setListe] = useState<ExposeZeile[] | null>(null);
  const [entwurf, setEntwurf] = useState<ExposeEntwurf | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [ohne, setOhne] = useState<Set<string>>(new Set());
  const [fotosLaden, setFotosLaden] = useState(false);
  const [schritt, setSchritt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([]);

  const listeLaden = useCallback(async () => {
    if (!token) return;
    const { mandatExposeListeFn } =
      await import("@/lib/mandate/expose-server-fn");
    const l = await mandatExposeListeFn({
      data: { supabaseAccessToken: token, mandatSfId: sfId },
    });
    setListe(l);
    return l;
  }, [token, sfId]);

  const oeffnen = useCallback(
    async (id: string) => {
      const { mandatExposeLadenFn } =
        await import("@/lib/mandate/expose-server-fn");
      setEntwurf(
        await mandatExposeLadenFn({ data: { supabaseAccessToken: token, id } }),
      );
    },
    [token],
  );

  useEffect(() => {
    void (async () => {
      try {
        const l = await listeLaden();
        if (l?.[0]) await oeffnen(l[0].id);
      } catch (e) {
        toast.error(fehlerText(e, "Exposés konnten nicht geladen werden."));
        setListe([]);
      }
    })();
  }, [listeLaden, oeffnen]);

  // Fotos des Objektordners einmal je Entwurf laden (verkleinert, bleiben im Browser).
  const fotoIds = entwurf?.fotos.map((f) => f.id).join(",") ?? "";
  useEffect(() => {
    if (!entwurf?.fotos.length || !token) return;
    let abbruch = false;
    setFotosLaden(true);
    void (async () => {
      const { mandatExposeFotoFn } =
        await import("@/lib/mandate/expose-server-fn");
      const { bildVorbereiten } = await import("@/lib/ki-tools/client");
      const geladen: Foto[] = [];
      for (const f of entwurf.fotos) {
        if (abbruch) return;
        try {
          const { base64 } = await mandatExposeFotoFn({
            data: { supabaseAccessToken: token, itemId: f.id },
          });
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const { bild, vorschau } = await bildVorbereiten(
            f.name,
            new Blob([bytes], { type: "image/jpeg" }),
          );
          geladen.push({ id: f.id, name: f.name, bild, vorschau });
          setFotos([...geladen]);
        } catch {
          // Einzelne Fotos ohne Vorschau (z. B. RAW) überspringen.
        }
      }
      if (!abbruch) setFotosLaden(false);
    })();
    return () => {
      abbruch = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoIds, token]);

  const hochgeladeneBilder = anhaenge.flatMap((a) =>
    a.art === "bild"
      ? [{ id: a.id, name: a.name, bild: a.bild, vorschau: a.vorschau }]
      : [],
  );
  const alleFotos = [...fotos, ...hochgeladeneBilder];
  const gewaehlt = alleFotos.filter((f) => !ohne.has(f.id));

  async function auswerten(basis: ExposeEntwurf, anweisung: string) {
    const { mandatExposeAuswertenFn } =
      await import("@/lib/mandate/expose-server-fn");
    const zusatz = anhaenge.flatMap((a) =>
      a.art === "unterlage" ? [a.unterlage] : [],
    );
    setSchritt(
      basis.ergebnis
        ? "Exposé wird angepasst …"
        : "KI wertet Salesforce-Daten und Unterlagen aus …",
    );
    const neu = await mandatExposeAuswertenFn({
      data: {
        supabaseAccessToken: token,
        id: basis.id,
        anweisung,
        bildnamen: [
          ...basis.fotos.map((f) => f.name),
          ...hochgeladeneBilder.map((b) => b.name),
        ],
        zusatz,
      },
    });
    setEntwurf(neu);
    // Hochgeladene Unterlagen gehören jetzt zum Entwurf, Bilder bleiben im Browser.
    setAnhaenge((v) => v.filter((a) => a.art === "bild"));
    return neu;
  }

  async function erstellen() {
    setFehler(null);
    try {
      setSchritt("Salesforce-Daten und Objektordner werden gelesen …");
      const { mandatExposeAnlegenFn } =
        await import("@/lib/mandate/expose-server-fn");
      const neu = await mandatExposeAnlegenFn({
        data: { supabaseAccessToken: token, mandatSfId: sfId },
      });
      setFotos([]);
      setOhne(new Set());
      setEntwurf(neu);
      await auswerten(neu, text.trim());
      setText("");
      await listeLaden();
    } catch (e) {
      setFehler(fehlerText(e, "Das Exposé konnte nicht erstellt werden."));
      await listeLaden().catch(() => undefined);
    } finally {
      setSchritt(null);
    }
  }

  async function anpassen() {
    if (!entwurf) return;
    const anweisung = text.trim();
    setFehler(null);
    try {
      await auswerten(entwurf, anweisung);
      setText("");
      await listeLaden();
    } catch (e) {
      setFehler(fehlerText(e, "Die Anpassung ist fehlgeschlagen."));
    } finally {
      setSchritt(null);
    }
  }

  async function pptxBauen(e: ExposeEntwurf) {
    if (!e.ergebnis) throw new Error("Noch keine Exposé-Daten.");
    const { dateiErstellen } = await import("@/lib/ki-tools/client");
    const datei = await dateiErstellen(
      token,
      e.ergebnis,
      gewaehlt.map((f) => f.bild),
    );
    return { ...datei, name: exposeDateiname(e.ergebnis, e.version, "pptx") };
  }

  async function powerpoint() {
    if (!entwurf) return;
    setSchritt("PowerPoint wird erstellt …");
    try {
      const { herunterladen } = await import("@/lib/ki-tools/client");
      herunterladen(await pptxBauen(entwurf));
    } catch (e) {
      toast.error(fehlerText(e, "PowerPoint konnte nicht erstellt werden."));
    } finally {
      setSchritt(null);
    }
  }

  async function pdf() {
    if (!entwurf) return;
    try {
      const fn = await import("@/lib/mandate/expose-server-fn");
      if (entwurf.hatPdf) {
        setSchritt("PDF wird geladen …");
        const { url } = await fn.mandatExposePdfLinkFn({
          data: { supabaseAccessToken: token, id: entwurf.id },
        });
        linkOeffnen(url);
        return;
      }
      setSchritt("PowerPoint wird erstellt …");
      const datei = await pptxBauen(entwurf);
      setSchritt("PDF wird von Microsoft 365 erzeugt …");
      const { teilBytes } = await fn.mandatExposePdfStartFn({
        data: { supabaseAccessToken: token, id: entwurf.id },
      });
      await inTeilenHochladen(
        datei.daten,
        teilBytes,
        (teil) =>
          fn.mandatExposePdfTeilFn({
            data: { supabaseAccessToken: token, id: entwurf.id, ...teil },
          }),
        (p) => setSchritt(`PDF wird erzeugt: Upload ${p} % …`),
      );
      setSchritt("PDF wird umgewandelt …");
      const { url } = await fn.mandatExposePdfFertigFn({
        data: { supabaseAccessToken: token, id: entwurf.id },
      });
      linkOeffnen(url);
      setEntwurf({ ...entwurf, hatPdf: true });
      await listeLaden();
    } catch (e) {
      toast.error(fehlerText(e, "PDF konnte nicht erstellt werden."), {
        duration: 10_000,
      });
    } finally {
      setSchritt(null);
    }
  }

  async function freigeben() {
    if (!entwurf) return;
    const warnungen = punkte.filter((p) => !p.ok && !p.sperrt);
    if (
      !window.confirm(
        `Exposé Version ${entwurf.version} freigeben? Danach ist es für den Versand bestimmt und kann nicht mehr geändert werden.${
          warnungen.length
            ? `\n\nOffen: ${warnungen.map((p) => p.label).join(", ")}`
            : ""
        }`,
      )
    )
      return;
    setSchritt("Wird freigegeben …");
    try {
      const { mandatExposeFreigebenFn } =
        await import("@/lib/mandate/expose-server-fn");
      setEntwurf(
        await mandatExposeFreigebenFn({
          data: { supabaseAccessToken: token, id: entwurf.id },
        }),
      );
      await listeLaden();
      toast.success("Exposé freigegeben.");
    } catch (e) {
      toast.error(fehlerText(e, "Freigabe fehlgeschlagen."));
    } finally {
      setSchritt(null);
    }
  }

  async function inSalesforce() {
    if (!entwurf) return;
    if (
      !window.confirm(
        "Das freigegebene PDF als Datei am Mandat in Salesforce ablegen?",
      )
    )
      return;
    setSchritt("Wird in Salesforce abgelegt …");
    try {
      const { mandatExposeSalesforceFn } =
        await import("@/lib/mandate/expose-server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      setEntwurf(
        await mandatExposeSalesforceFn({
          data: {
            supabaseAccessToken: token,
            id: entwurf.id,
            bestaetigt: true,
            sfSitzung,
          },
        }),
      );
      toast.success("PDF in Salesforce am Mandat abgelegt.");
    } catch (e) {
      toast.error(fehlerText(e, "Ablage in Salesforce fehlgeschlagen."));
    } finally {
      setSchritt(null);
    }
  }

  const punkte = useMemo(
    () => (entwurf?.ergebnis ? pflichtangaben(entwurf.ergebnis.daten) : []),
    [entwurf?.ergebnis],
  );
  const gesperrt = freigabeGesperrt(punkte);
  const laeuft = schritt !== null;
  const offen = entwurf?.status === "entwurf";

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="expose" />}
        aktionen={
          entwurf?.ergebnis ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void powerpoint()}
                disabled={laeuft}
              >
                <Presentation className="h-4 w-4" /> PowerPoint
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void pdf()}
                disabled={laeuft || (!offen && !entwurf.hatPdf)}
              >
                <Download className="h-4 w-4" />
                {entwurf.hatPdf ? "PDF" : "PDF erstellen"}
              </Button>
              {offen ? (
                <Button
                  size="sm"
                  onClick={() => void freigeben()}
                  disabled={laeuft || gesperrt.length > 0 || !entwurf.hatPdf}
                  title={
                    gesperrt.length
                      ? `Es fehlt: ${gesperrt.join(", ")}`
                      : !entwurf.hatPdf
                        ? "Erst das PDF erstellen, dann genau dieses freigeben."
                        : undefined
                  }
                >
                  <ShieldCheck className="h-4 w-4" /> Freigeben
                </Button>
              ) : !entwurf.sfContentDocumentId ? (
                <Button
                  size="sm"
                  onClick={() => void inSalesforce()}
                  disabled={laeuft}
                >
                  <CloudUpload className="h-4 w-4" /> In Salesforce ablegen
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <PageWrapper>
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-heading">Exposé</h2>
                <p className="text-xs text-text-muted">
                  Grenz-&-Co.-Vorlage, gefüllt aus Salesforce und dem
                  Objektordner. Jede Angabe trägt ihren Beleg.
                </p>
              </div>
              <Button
                size="sm"
                variant={entwurf ? "outline" : "default"}
                onClick={() => void erstellen()}
                disabled={laeuft || !token}
              >
                <FilePlus2 className="h-4 w-4" />
                {entwurf ? "Neue Version erstellen" : "Exposé erstellen"}
              </Button>
            </div>
            {liste === null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : liste.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {liste.map((z) => (
                    <tr
                      key={z.id}
                      className={cn(
                        "border-t border-hairline",
                        z.id === entwurf?.id && "bg-[var(--gc-grau-zart)]",
                      )}
                    >
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="font-medium text-heading hover:underline"
                          onClick={() => {
                            setFotos([]);
                            setOhne(new Set());
                            void oeffnen(z.id);
                          }}
                          disabled={laeuft}
                        >
                          Version {z.version}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{STATUS_TEXT[z.status]}</td>
                      <td className="py-2 pr-3 text-text-subtle">
                        {formatDate(z.updatedAt)}
                      </td>
                      <td className="py-2 pr-3 text-text-subtle">
                        {z.hatPdf ? "PDF erstellt" : "ohne PDF"}
                        {z.sfContentDocumentId ? " · in Salesforce" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-text-muted">
                Noch kein Exposé. Beim Erstellen liest die App die Stammdaten
                aus Salesforce, die wichtigsten Unterlagen des Objektordners
                (altes Exposé, Mieterliste, Energieausweis, Grundbuch, Pläne)
                und die Fotos. Zusätzliche Vorgaben, z. B. Kaufpreis oder Titel,
                unten eintragen.
              </p>
            )}
          </section>

          {schritt && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {schritt}
              {/KI|angepasst/.test(schritt) && (
                <span className="text-xs">
                  (kann ein bis drei Minuten dauern)
                </span>
              )}
            </div>
          )}

          {fehler && (
            <p className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {fehler}
            </p>
          )}

          {entwurf && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                <h2 className="text-sm font-semibold text-heading">
                  Grundlagen
                </h2>
                {entwurf.ordner ? (
                  <a
                    href={entwurf.ordner.webUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-text-muted hover:underline"
                  >
                    Objektordner {entwurf.ordner.name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-xs text-text-muted">
                    Kein Objektordner gefunden. Unterlagen lassen sich unten
                    hochladen.
                  </p>
                )}
                <ul className="flex flex-col gap-1 text-sm">
                  {entwurf.quellen.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {q.gelesen ? (
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-heading" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                      )}
                      <span className="min-w-0">
                        {q.webUrl ? (
                          <a
                            href={q.webUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words hover:underline"
                          >
                            {q.name}
                          </a>
                        ) : (
                          <span className="break-words">{q.name}</span>
                        )}
                        <span className="text-xs text-text-muted">
                          {q.gelesen && q.seiten ? ` · ${q.seiten} S.` : ""}
                          {q.hinweis ? ` · ${q.hinweis}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                <h2 className="text-sm font-semibold text-heading">
                  Pflichtangaben
                </h2>
                {punkte.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {punkte.map((p) => (
                      <li key={p.label} className="flex items-start gap-2">
                        {p.ok ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-heading" />
                        ) : (
                          <AlertTriangle
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              p.sperrt ? "text-destructive" : "text-text-muted",
                            )}
                          />
                        )}
                        <span>
                          {p.label}
                          {!p.ok && p.sperrt ? (
                            <span className="text-xs text-destructive">
                              {" "}
                              · fehlt, sperrt die Freigabe
                            </span>
                          ) : null}
                          {p.hinweis ? (
                            <span className="block text-xs text-text-muted">
                              {p.hinweis}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-muted">
                    Erscheint, sobald die KI das Exposé gefüllt hat.
                  </p>
                )}
                <p className="mt-auto text-xs text-text-muted">
                  Status: {STATUS_TEXT[entwurf.status]}
                  {entwurf.freigegebenAm
                    ? ` am ${formatDate(entwurf.freigegebenAm)}`
                    : ""}
                  {entwurf.sfContentDocumentId
                    ? " · PDF liegt in Salesforce am Mandat"
                    : ""}
                </p>
              </section>
            </div>
          )}

          {entwurf && (alleFotos.length > 0 || fotosLaden) && (
            <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-heading">
                  Fotos und Grundrisse ({gewaehlt.length} von {alleFotos.length}{" "}
                  im Exposé)
                </h2>
                {fotosLaden && (
                  <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                )}
              </div>
              <p className="text-xs text-text-muted">
                Das erste Foto wird Titelbild. Grundrisse und Karten erkennt die
                Vorlage am Dateinamen. Antippen nimmt ein Bild heraus.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {alleFotos.map((f) => {
                  const aus = ohne.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      title={f.name}
                      onClick={() =>
                        setOhne((s) => {
                          const n = new Set(s);
                          if (aus) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        })
                      }
                      className={cn(
                        "relative aspect-[4/3] overflow-hidden border border-hairline",
                        aus && "opacity-30",
                      )}
                    >
                      <img
                        src={f.vorschau}
                        alt={f.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {entwurf?.ergebnis && (
            <TooltipProvider delayDuration={150}>
              <KiErgebnis ergebnis={entwurf.ergebnis} />
            </TooltipProvider>
          )}

          {(!entwurf || offen) && (
            <div className={cn(entwurf?.ergebnis && "sticky bottom-4")}>
              <KiEingabe
                text={text}
                onText={setText}
                anhaenge={anhaenge}
                onAnhaenge={setAnhaenge}
                onSenden={() => void (entwurf ? anpassen() : erstellen())}
                laeuft={laeuft}
                platzhalter={
                  entwurf?.ergebnis
                    ? "Was soll angepasst werden? z. B. Kaufpreis auf 2,4 Mio. € setzen, Titel „Wohn- und Geschäftshaus in Bilk“"
                    : "Vorgaben für das Exposé, z. B. Kaufpreis 2,56 Mio. €, Titel „Wohn- und Geschäftshaus im Severinsviertel“"
                }
                hinweis={
                  entwurf?.ergebnis
                    ? undefined
                    : "Fehlt etwas im Objektordner, hier anhängen: Mieterliste, Energieausweis, Fotos. Gescannte PDFs ohne Text können nicht gelesen werden."
                }
              />
            </div>
          )}
        </div>
      </PageWrapper>
    </>
  );
}
