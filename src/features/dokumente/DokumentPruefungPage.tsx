import { useCallback, useEffect, useRef, useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  DOKUMENT_ABLAGE_FELDER,
  DOKUMENT_FELD_LABELS,
  DOKUMENT_RECHNUNG_FELDER,
  type DokumentAnalyseFelder,
  type DokumentFeldId,
  type DokumentFeldQuelle,
} from "@/lib/dokument-ai";
import { werteZuFelder } from "@/lib/dokument-postfach/client";
import type { DokumentPosteingangEintrag } from "@/lib/dokument-postfach/typen";
import { base64ZuFile } from "@/lib/postfach/client";
import { verwaltungApi } from "@/api/verwaltung";
import type { Gesellschaft, Objekt } from "@/types";
import { cn } from "@/lib/utils";

import { PdfSourceViewer } from "../transaktionen/expose-import/PdfSourceViewer";
import {
  extractPdfForChat,
  type ExtractedPdfForChat,
} from "../transaktionen/expose-import/extractPdfText";
import { findQuoteInPages } from "../transaktionen/expose-import/quoteLocation";
import { OrdnerAuswahl } from "./OrdnerAuswahl";

type FeldState = { value: string; quelle: DokumentFeldQuelle | null };
type FelderState = Record<DokumentFeldId, FeldState>;
type HighlightState = { page: number; quote: string; hint?: string } | null;

const AUSWAHL_LEER = "__none__";

const pruefungRoute = getRouteApi("/dokumente/pruefung");

function leereFelder(): FelderState {
  const ids = [...DOKUMENT_ABLAGE_FELDER, ...DOKUMENT_RECHNUNG_FELDER];
  const unique = [...new Set(ids)];
  return Object.fromEntries(
    unique.map((id) => [id, { value: "", quelle: null }]),
  ) as FelderState;
}

function DokumentFeldZeile({
  label,
  feld,
  onChange,
  onQuelleOeffnen,
  hatQuelle,
}: {
  label: string;
  feld: FeldState;
  onChange: (value: string) => void;
  onQuelleOeffnen: () => void;
  hatQuelle: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border border-hairline bg-surface p-4">
      <button
        type="button"
        className={cn(
          "group flex min-w-0 flex-col gap-0.5 text-left",
          hatQuelle && "cursor-pointer",
          !hatQuelle && "cursor-default",
        )}
        disabled={!hatQuelle}
        onClick={() => hatQuelle && onQuelleOeffnen()}
        title={hatQuelle ? "Quelle im PDF anzeigen" : undefined}
      >
        <span
          className={cn(
            "label-caps text-text-muted",
            hatQuelle && "group-hover:text-heading",
          )}
        >
          {label}
        </span>
        {hatQuelle && feld.quelle?.page ? (
          <span className="inline-flex items-center gap-1 text-xs text-heading">
            <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Quelle · Seite {feld.quelle.page}
          </span>
        ) : null}
      </button>
      <Input
        value={feld.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Noch nicht ausgefüllt"
        className="bg-surface"
      />
    </div>
  );
}

function loeseSeite(
  quelle: DokumentFeldQuelle | null,
  pages: ExtractedPdfForChat["pages"] | null,
): number | null {
  if (!quelle?.verbatimQuote || !pages?.length) return quelle?.page ?? null;
  const match = findQuoteInPages(pages, quelle.verbatimQuote);
  return match?.pageNumber ?? quelle.page ?? null;
}

export function DokumentPruefungPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const { postfach: postfachSuche } = pruefungRoute.useSearch();

  const [eintrag, setEintrag] = useState<DokumentPosteingangEintrag | null>(null);
  const [istRechnung, setIstRechnung] = useState(false);
  const [felder, setFelder] = useState<FelderState>(leereFelder);
  const [gesellschaften, setGesellschaften] = useState<Gesellschaft[]>([]);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [gesellschaftId, setGesellschaftId] = useState<string>("");
  const [objektId, setObjektId] = useState<string>("");
  const [ordnerId, setOrdnerId] = useState<string | null>(null);
  const [ordnerPfad, setOrdnerPfad] = useState<string | null>(null);

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<ExtractedPdfForChat | null>(null);
  const [pdfSeite, setPdfSeite] = useState(1);
  const [highlight, setHighlight] = useState<HighlightState>(null);
  const [laedtPdf, setLaedtPdf] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const objectUrlRef = useRef<string | null>(null);
  const geladenRef = useRef<string | null>(null);

  const gefilterteObjekte = gesellschaftId
    ? objekte.filter((o) => o.gesellschaftId === gesellschaftId)
    : objekte;

  const ergebnisUebernehmen = useCallback(
    (
      kiFelder: DokumentAnalyseFelder,
      pages: ExtractedPdfForChat["pages"] | null,
    ) => {
      const neu = leereFelder();
      for (const id of Object.keys(neu) as DokumentFeldId[]) {
        const quelle = kiFelder[id];
        if (quelle) {
          neu[id] = {
            value: quelle.value ?? "",
            quelle,
          };
        }
      }
      setFelder(neu);
      return neu;
    },
    [],
  );

  const pdfDateiUebernehmen = useCallback(async (datei: File) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(datei);
    objectUrlRef.current = url;
    setObjectUrl(url);

    const extracted = await extractPdfForChat(datei);
    setPdfMeta(extracted);
    setPdfSeite(1);
    setHighlight(null);
    return extracted;
  }, []);

  useEffect(() => {
    const eintragId = postfachSuche?.trim();
    if (!eintragId || !token) return;
    if (geladenRef.current === eintragId) return;
    geladenRef.current = eintragId;

    let cancelled = false;
    void (async () => {
      setLaedtPdf(true);
      try {
        const [{ eintrag: geladen, pdf }, gs, obj] = await Promise.all([
          import("@/lib/dokument-postfach/server-fn").then((m) =>
            m.dokumentPosteingangEintragFn({
              data: { supabaseAccessToken: token, eintragId },
            }),
          ),
          verwaltungApi.listGesellschaften(),
          verwaltungApi.listObjekte(),
        ]);
        if (cancelled) return;

        setEintrag(geladen);
        setIstRechnung(geladen.istRechnung ?? false);
        setGesellschaften(gs.items);
        setObjekte(obj.items);
        setGesellschaftId(geladen.gesellschaftId ?? "");
        setObjektId(geladen.objektId ?? "");
        setOrdnerId(geladen.ablageOrdnerId);
        setOrdnerPfad(geladen.ablageOrdnerPfad);

        const datei = base64ZuFile(pdf.base64, pdf.dateiname, pdf.mimeType);
        const extracted = await pdfDateiUebernehmen(datei);
        if (cancelled || !extracted) return;

        if (geladen.felder) {
          ergebnisUebernehmen(geladen.felder, extracted.pages);
        }
      } catch (err) {
        if (cancelled) return;
        geladenRef.current = null;
        toast.error(
          err instanceof Error
            ? err.message
            : "Dokument konnte nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLaedtPdf(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ergebnisUebernehmen, pdfDateiUebernehmen, postfachSuche, token]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const sichtbareFelder = istRechnung
    ? DOKUMENT_RECHNUNG_FELDER
    : DOKUMENT_ABLAGE_FELDER;

  const felderAlsJson = (): DokumentAnalyseFelder => {
    const werte = Object.fromEntries(
      sichtbareFelder.map((id) => [id, felder[id]?.value ?? ""]),
    ) as Partial<Record<DokumentFeldId, string>>;
    return werteZuFelder(werte, eintrag?.felder ?? null);
  };

  async function ablegen() {
    if (!eintrag || !ordnerId || !ordnerPfad) {
      toast.error("Bitte einen Zielordner wählen.");
      return;
    }

    setSpeichert(true);
    try {
      const { dokumentPosteingangAblegenFn } = await import(
        "@/lib/dokument-postfach/server-fn"
      );
      await dokumentPosteingangAblegenFn({
        data: {
          supabaseAccessToken: token,
          eintragId: eintrag.id,
          ordnerItemId: ordnerId,
          ordnerPfad,
          gesellschaftId: gesellschaftId || null,
          objektId: objektId || null,
          felder: felderAlsJson(),
          istRechnung,
        },
      });
      toast.success("Dokument abgelegt.");
      await navigate({ to: "/dokumente/pruefordner" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ablegen fehlgeschlagen.");
    } finally {
      setSpeichert(false);
    }
  }

  function buchen() {
    toast.info("Buchen wird in einem späteren Schritt implementiert.");
  }

  const quelleOeffnen = (id: DokumentFeldId) => {
    const quelle = felder[id]?.quelle;
    if (!quelle?.verbatimQuote) return;
    const seite = loeseSeite(quelle, pdfMeta?.pages ?? null);
    if (seite) {
      setPdfSeite(seite);
      setHighlight({
        page: seite,
        quote: quelle.verbatimQuote,
        hint: felder[id]?.value.trim() || undefined,
      });
    }
  };

  return (
    <>
      <PageHeader
        titel={istRechnung ? "Rechnung prüfen" : "Dokument prüfen"}
        nebenTitel={
          eintrag?.status === "abgelegt" ? (
            <span className="text-xs text-text-muted">Abgelegt</span>
          ) : istRechnung ? (
            <span className="text-xs font-medium text-heading">Rechnung</span>
          ) : null
        }
        aktionen={
          istRechnung ? (
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.buchen"
              skeletonClassName="w-24"
            >
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-heading"
                disabled={laedtPdf || speichert || eintrag?.status === "abgelegt"}
                onClick={buchen}
              >
                Buchen
              </Button>
            </PermissionGate>
          ) : (
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.ablegen"
              skeletonClassName="w-24"
            >
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-heading"
                disabled={
                  laedtPdf || speichert || !ordnerId || eintrag?.status === "abgelegt"
                }
                onClick={() => void ablegen()}
              >
                {speichert ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Ablegen
              </Button>
            </PermissionGate>
          )
        }
      />

      <div className="flex h-[calc(100dvh-4rem-5rem)] min-h-0 flex-col gap-4 overflow-hidden px-8 pt-6 pb-6 lg:flex-row lg:gap-6">
        <div className="flex h-[42vh] min-h-0 min-w-0 shrink-0 flex-col overflow-hidden lg:h-auto lg:flex-1 lg:shrink">
          {laedtPdf ? (
            <div className="flex h-full items-center justify-center gap-2 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span>PDF wird geladen…</span>
            </div>
          ) : (
            <PdfSourceViewer
              objectUrl={objectUrl}
              page={pdfSeite}
              onPageChange={(p) => {
                setPdfSeite(p);
                setHighlight(null);
              }}
              pages={pdfMeta?.pages ?? null}
              pageLabels={pdfMeta?.pageLabels ?? null}
              highlight={highlight}
              className="h-full min-h-0"
            />
          )}
        </div>

        <aside className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain lg:w-[340px] lg:flex-none xl:w-[400px]">
          <div className="flex flex-col gap-2 border border-hairline bg-surface-muted/40 p-4">
            <span className="label-caps text-text-muted">Zuordnung</span>
            <Select
              value={gesellschaftId || AUSWAHL_LEER}
              onValueChange={(v) => {
                const id = v === AUSWAHL_LEER ? "" : v;
                setGesellschaftId(id);
                setObjektId("");
                const gs = gesellschaften.find((g) => g.id === id);
                if (gs) {
                  setFelder((prev) => ({
                    ...prev,
                    gesellschaftName: {
                      ...prev.gesellschaftName,
                      value: gs.name,
                    },
                  }));
                }
              }}
            >
              <SelectTrigger className="rounded-none bg-surface">
                <SelectValue placeholder="Gesellschaft" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUSWAHL_LEER}>— Keine —</SelectItem>
                {gesellschaften.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={objektId || AUSWAHL_LEER}
              onValueChange={(v) => {
                const id = v === AUSWAHL_LEER ? "" : v;
                setObjektId(id);
                const obj = objekte.find((o) => o.id === id);
                if (obj) {
                  setFelder((prev) => ({
                    ...prev,
                    objektBezeichnung: {
                      ...prev.objektBezeichnung,
                      value: obj.bezeichnung,
                    },
                  }));
                }
              }}
            >
              <SelectTrigger className="rounded-none bg-surface">
                <SelectValue placeholder="Objekt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUSWAHL_LEER}>— Kein Objekt —</SelectItem>
                {gefilterteObjekte.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.bezeichnung}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!istRechnung ? (
            <OrdnerAuswahl
              token={token}
              gewaehlterOrdnerId={ordnerId}
              gewaehlterOrdnerPfad={ordnerPfad}
              onAuswahl={({ id, pfad }) => {
                setOrdnerId(id);
                setOrdnerPfad(pfad);
                setFelder((prev) => ({
                  ...prev,
                  ordnerPfad: { ...prev.ordnerPfad, value: pfad },
                }));
              }}
            />
          ) : null}

          {felder.zuordnungBegruendung?.value ? (
            <div className="border border-hairline bg-surface-muted/30 p-4">
              <span className="label-caps text-text-muted">KI-Begründung</span>
              <p className="mt-2 text-sm text-heading">
                {felder.zuordnungBegruendung.value}
              </p>
            </div>
          ) : null}

          {sichtbareFelder.map((id) => (
            <DokumentFeldZeile
              key={id}
              label={DOKUMENT_FELD_LABELS[id]}
              feld={felder[id] ?? { value: "", quelle: null }}
              onChange={(value) =>
                setFelder((prev) => ({
                  ...prev,
                  [id]: { ...prev[id], value },
                }))
              }
              onQuelleOeffnen={() => quelleOeffnen(id)}
              hatQuelle={Boolean(felder[id]?.quelle?.verbatimQuote)}
            />
          ))}
        </aside>
      </div>
    </>
  );
}
