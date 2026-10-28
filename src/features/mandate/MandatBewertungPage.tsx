import {
  AlertTriangle,
  Download,
  ExternalLink,
  FilePlus2,
  Loader2,
  Presentation,
  RotateCcw,
  Save,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { BildDatei } from "@/lib/ki-tools/dateien/powerpoint";
import { fach, mio, zahl } from "@/lib/ki-tools/rechnen";
import { KEIN_GUTACHTEN } from "@/lib/ki-tools/vergleiche";
import {
  bewertungDateiname,
  einschaetzungDaten,
  flaecheVon,
  quelleText,
  STANDARD_VORGEHEN,
  standardZusammenfassung,
  vergleicheFuerFolie,
  wertindikation,
  type BewertungsEingabe,
  type BewertungsEinstellungen,
  type BewertungsEntscheidung,
  type EingabeFeld,
  type Methode,
} from "@/lib/mandate/bewertung";
import type {
  Bewertung,
  BewertungZeile,
} from "@/lib/mandate/bewertung-server-fn";
import { inTeilenHochladen, linkOeffnen } from "@/lib/mandate/pdf-client";
import { cn } from "@/lib/utils";

import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

type Foto = { id: string; name: string; bild: BildDatei; vorschau: string };

/** Titel und drei Impressionen braucht die Vorlage. */
const MAX_FOTOS = 8;

function fehlerText(e: unknown, standard: string): string {
  return e instanceof Error ? e.message : standard;
}

/** „2.300.000“, „2,3“ oder „2300000“ als Zahl; leer = null. */
function zahlAusText(t: string): number | null {
  const s = t.replace(/[€\sm²%]/g, "").trim();
  if (!s) return null;
  const normal = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ZahlFeld({
  label,
  wert,
  onWert,
  einheit,
  hinweis,
  jahr = false,
}: {
  label: string;
  wert: number | null;
  onWert: (w: number | null) => void;
  einheit?: string;
  hinweis?: string;
  /** Ohne Tausenderpunkt (Baujahr). */
  jahr?: boolean;
}) {
  const anzeige = (w: number | null) =>
    w == null
      ? ""
      : jahr
        ? String(Math.round(w))
        : zahl(w, 2).replace(/,00$/, "");
  const [text, setText] = useState(anzeige(wert));
  useEffect(() => {
    if (zahlAusText(text) !== wert) setText(anzeige(wert));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert]);
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span>
        {label}
        {einheit ? ` (${einheit})` : ""}
      </span>
      <Input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onWert(zahlAusText(e.target.value));
        }}
        className="h-8 text-sm text-heading"
      />
      {hinweis && (
        <span className="text-[11px] text-text-subtle">{hinweis}</span>
      )}
    </label>
  );
}

function TextFeld({
  label,
  wert,
  onWert,
  hinweis,
}: {
  label: string;
  wert: string | null;
  onWert: (w: string) => void;
  hinweis?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span>{label}</span>
      <Input
        value={wert ?? ""}
        onChange={(e) => onWert(e.target.value)}
        className="h-8 text-sm text-heading"
      />
      {hinweis && (
        <span className="text-[11px] text-text-subtle">{hinweis}</span>
      )}
    </label>
  );
}

function kennwertText(m: Methode, w: number): string {
  return m.einheit === "fach" ? fach(w) : `${zahl(w)} €/m²`;
}

/** Spannen aller Verfahren auf einer Achse, Gesamtspanne und Vorschlag darüber. */
function Spannenbild({
  methoden,
  spanne,
  preis,
}: {
  methoden: Methode[];
  spanne: { min: number; max: number } | null;
  preis: number | null;
}) {
  const werte = [
    ...methoden.flatMap((m) => [m.wert.min, m.wert.max]),
    ...(preis ? [preis] : []),
  ];
  if (!werte.length) return null;
  const lo = Math.min(...werte) * 0.95;
  const hi = Math.max(...werte) * 1.05;
  const pos = (w: number) => `${((w - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="flex flex-col gap-2">
      {methoden.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3 text-xs"
        >
          <span className="truncate text-text-muted" title={m.label}>
            {m.label}
          </span>
          <div className="relative h-3 bg-[var(--gc-grau-zart)]">
            <div
              className={cn(
                "absolute inset-y-0",
                m.basis === "kauf" ? "bg-brand" : "bg-[var(--gc-hellblau)]",
              )}
              style={{
                left: pos(m.wert.min),
                width: `calc(${pos(m.wert.max)} - ${pos(m.wert.min)})`,
              }}
              title={`${mio(m.wert.min)} bis ${mio(m.wert.max)}`}
            />
            <div
              className="absolute inset-y-[-2px] w-0.5 bg-heading"
              style={{ left: pos(m.wert.mittel) }}
            />
          </div>
        </div>
      ))}
      {spanne && (
        <div className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3 text-xs">
          <span className="font-semibold text-heading">Wertindikation</span>
          <div className="relative h-4 border border-heading">
            <div
              className="absolute inset-y-0 bg-[var(--gc-hellblau-zart)]"
              style={{
                left: pos(spanne.min),
                width: `calc(${pos(spanne.max)} - ${pos(spanne.min)})`,
              }}
            />
            {preis && (
              <div
                className="absolute inset-y-[-4px] w-1 bg-heading"
                style={{ left: pos(preis) }}
                title={`Einschätzung ${mio(preis)}`}
              />
            )}
          </div>
        </div>
      )}
      <p className="text-[11px] text-text-subtle">
        Balken: mittlere 50 % der Vergleichswerte, Strich: Median. Dunkel =
        Kaufpreise, hell = Angebotspreise.
      </p>
    </div>
  );
}

const FELDER: {
  feld: EingabeFeld;
  label: string;
  art: "text" | "zahl";
  einheit?: string;
}[] = [
  { feld: "bezeichnung", label: "Bezeichnung", art: "text" },
  { feld: "strasse", label: "Straße", art: "text" },
  { feld: "plz", label: "PLZ", art: "text" },
  { feld: "ort", label: "Ort", art: "text" },
  { feld: "objektart", label: "Objektart", art: "text" },
  { feld: "baujahr", label: "Baujahr", art: "zahl" },
  { feld: "grundstueck", label: "Grundstück", art: "zahl", einheit: "m²" },
  { feld: "wohneinheiten", label: "Wohneinheiten", art: "zahl" },
  { feld: "gewerbeeinheiten", label: "Gewerbeeinheiten", art: "zahl" },
  { feld: "flaecheWohnen", label: "Wohnfläche", art: "zahl", einheit: "m²" },
  {
    feld: "flaecheGewerbe",
    label: "Gewerbefläche",
    art: "zahl",
    einheit: "m²",
  },
  {
    feld: "flaecheGesamt",
    label: "Mietfläche gesamt",
    art: "zahl",
    einheit: "m²",
  },
  {
    feld: "mieteJahrIst",
    label: "Nettokaltmiete p. a. IST",
    art: "zahl",
    einheit: "€",
  },
  {
    feld: "mieteJahrSoll",
    label: "Nettokaltmiete p. a. SOLL",
    art: "zahl",
    einheit: "€",
  },
];

/**
 * Reiter „Bewertung“ der Mandatsakte: Wertindikation aus Mandatsdaten, Grenz-Vergleichsdaten und
 * Marktbericht; Ergebnis als „Vermarktungseinschätzung“ in der Original-Vorlage (PowerPoint, PDF).
 */
export function MandatBewertungPage({ sfId }: { sfId: string }) {
  const { token, detail } = useMandatDetail(sfId);
  const [liste, setListe] = useState<BewertungZeile[] | null>(null);
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  const [eingabe, setEingabe] = useState<BewertungsEingabe | null>(null);
  const [einstellungen, setEinstellungen] =
    useState<BewertungsEinstellungen | null>(null);
  const [entscheidung, setEntscheidung] =
    useState<BewertungsEntscheidung | null>(null);
  const [ausgeschlossen, setAusgeschlossen] = useState<string[]>([]);
  const [imPdf, setImPdf] = useState<string[] | null>(null);
  const [geaendert, setGeaendert] = useState<Set<EingabeFeld>>(new Set());
  const [ungespeichert, setUngespeichert] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [ohneFoto, setOhneFoto] = useState<Set<string>>(new Set());
  const [schritt, setSchritt] = useState<string | null>(null);

  const uebernehmen = useCallback((b: Bewertung) => {
    setBewertung(b);
    setEingabe(b.eingabe);
    setEinstellungen(b.einstellungen);
    setEntscheidung(b.entscheidung);
    setAusgeschlossen(b.ausgeschlossen);
    setImPdf(b.imPdf);
    setGeaendert(new Set());
    setUngespeichert(false);
  }, []);

  const listeLaden = useCallback(async () => {
    if (!token) return;
    const { bewertungListeFn } =
      await import("@/lib/mandate/bewertung-server-fn");
    const l = await bewertungListeFn({
      data: { supabaseAccessToken: token, mandatSfId: sfId },
    });
    setListe(l);
    return l;
  }, [token, sfId]);

  const oeffnen = useCallback(
    async (id: string) => {
      const { bewertungLadenFn } =
        await import("@/lib/mandate/bewertung-server-fn");
      uebernehmen(
        await bewertungLadenFn({ data: { supabaseAccessToken: token, id } }),
      );
    },
    [token, uebernehmen],
  );

  useEffect(() => {
    void (async () => {
      try {
        const l = await listeLaden();
        if (l?.[0]) await oeffnen(l[0].id);
      } catch (e) {
        toast.error(fehlerText(e, "Bewertungen konnten nicht geladen werden."));
        setListe([]);
      }
    })();
  }, [listeLaden, oeffnen]);

  // Fotos des Objektordners (verkleinert, bleiben im Browser).
  const fotoIds = bewertung?.fotos.map((f) => f.id).join(",") ?? "";
  useEffect(() => {
    if (!bewertung?.fotos.length || !token) return;
    let abbruch = false;
    setFotos([]);
    void (async () => {
      const { mandatExposeFotoFn } =
        await import("@/lib/mandate/expose-server-fn");
      const { bildVorbereiten } = await import("@/lib/ki-tools/client");
      const geladen: Foto[] = [];
      for (const f of bewertung.fotos.slice(0, MAX_FOTOS)) {
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
          if (!abbruch) setFotos([...geladen]);
        } catch {
          // Einzelne Fotos ohne Vorschau überspringen.
        }
      }
    })();
    return () => {
      abbruch = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoIds, token]);

  const indikation = useMemo(
    () =>
      bewertung && eingabe && einstellungen
        ? wertindikation(
            {
              ...eingabe,
              lat: bewertung.eingabe.lat,
              lng: bewertung.eingabe.lng,
            },
            bewertung.pool,
            ausgeschlossen,
            bewertung.markt,
            einstellungen,
          )
        : null,
    [bewertung, eingabe, einstellungen, ausgeschlossen],
  );

  const preis = entscheidung?.preisGrenz ?? indikation?.vorschlag ?? null;
  const flaeche = eingabe ? flaecheVon(eingabe) : null;
  const zusammenfassungStandard =
    eingabe && indikation && einstellungen
      ? standardZusammenfassung(
          eingabe,
          indikation,
          bewertung?.markt ?? null,
          einstellungen,
        )
      : [];
  const folienVergleiche = indikation
    ? vergleicheFuerFolie(indikation.vergleiche, imPdf)
    : [];

  function feldSetzen(feld: EingabeFeld, wert: string | number | null) {
    setEingabe((e) => (e ? { ...e, [feld]: wert === "" ? null : wert } : e));
    setGeaendert((s) => new Set(s).add(feld));
    setUngespeichert(true);
  }
  function entscheidungSetzen(teil: Partial<BewertungsEntscheidung>) {
    setEntscheidung((e) => (e ? { ...e, ...teil } : e));
    setUngespeichert(true);
  }

  async function erstellen() {
    setSchritt(
      "Salesforce-Daten, Vergleichsobjekte und Marktbericht werden gelesen …",
    );
    try {
      const { bewertungAnlegenFn } =
        await import("@/lib/mandate/bewertung-server-fn");
      setOhneFoto(new Set());
      uebernehmen(
        await bewertungAnlegenFn({
          data: { supabaseAccessToken: token, mandatSfId: sfId },
        }),
      );
      await listeLaden();
    } catch (e) {
      toast.error(fehlerText(e, "Bewertung konnte nicht angelegt werden."));
    } finally {
      setSchritt(null);
    }
  }

  async function speichern(): Promise<Bewertung | null> {
    if (!bewertung || !eingabe || !einstellungen || !entscheidung) return null;
    setSchritt("Wird gespeichert, Vergleichsobjekte werden neu gesucht …");
    try {
      const { bewertungSpeichernFn } =
        await import("@/lib/mandate/bewertung-server-fn");
      const neu = await bewertungSpeichernFn({
        data: {
          supabaseAccessToken: token,
          id: bewertung.id,
          eingabe,
          geaendert: [...geaendert],
          einstellungen,
          ausgeschlossen,
          imPdf,
          entscheidung,
        },
      });
      uebernehmen(neu);
      await listeLaden();
      return neu;
    } catch (e) {
      toast.error(fehlerText(e, "Speichern fehlgeschlagen."));
      return null;
    } finally {
      setSchritt(null);
    }
  }

  async function pptxBauen(b: Bewertung) {
    if (!indikation || !eingabe || !einstellungen || !entscheidung)
      throw new Error("Bewertung noch nicht geladen.");
    if (!preis)
      throw new Error("Bitte einen Kaufpreis für die Einschätzung eintragen.");
    const daten = einschaetzungDaten(
      eingabe,
      indikation,
      b.markt,
      einstellungen,
      entscheidung,
      imPdf,
    );
    const { dateiErstellen } = await import("@/lib/ki-tools/client");
    const datei = await dateiErstellen(
      token,
      { tool: "marktpreis", daten, hinweise: [], verworfen: 0 },
      fotos.filter((f) => !ohneFoto.has(f.id)).map((f) => f.bild),
    );
    return { ...datei, name: bewertungDateiname(eingabe, b.version, "pptx") };
  }

  async function powerpoint() {
    if (!bewertung) return;
    setSchritt("PowerPoint wird erstellt …");
    try {
      const { herunterladen } = await import("@/lib/ki-tools/client");
      herunterladen(await pptxBauen(bewertung));
    } catch (e) {
      toast.error(fehlerText(e, "PowerPoint konnte nicht erstellt werden."));
    } finally {
      setSchritt(null);
    }
  }

  async function pdf() {
    if (!bewertung) return;
    try {
      const fn = await import("@/lib/mandate/bewertung-server-fn");
      if (bewertung.hatPdf && !ungespeichert) {
        setSchritt("PDF wird geladen …");
        const { url } = await fn.bewertungPdfLinkFn({
          data: { supabaseAccessToken: token, id: bewertung.id },
        });
        linkOeffnen(url);
        return;
      }
      // Das PDF zeigt genau den gespeicherten Stand.
      const b = ungespeichert ? await speichern() : bewertung;
      if (!b) return;
      setSchritt("PowerPoint wird erstellt …");
      const datei = await pptxBauen(b);
      setSchritt("PDF wird von Microsoft 365 erzeugt …");
      const { teilBytes } = await fn.bewertungPdfStartFn({
        data: { supabaseAccessToken: token, id: b.id },
      });
      await inTeilenHochladen(
        datei.daten,
        teilBytes,
        (teil) =>
          fn.bewertungPdfTeilFn({
            data: { supabaseAccessToken: token, id: b.id, ...teil },
          }),
        (p) => setSchritt(`PDF wird erzeugt: Upload ${p} % …`),
      );
      setSchritt("PDF wird umgewandelt …");
      const { url } = await fn.bewertungPdfFertigFn({
        data: { supabaseAccessToken: token, id: b.id },
      });
      linkOeffnen(url);
      setBewertung({ ...b, hatPdf: true });
      await listeLaden();
    } catch (e) {
      toast.error(fehlerText(e, "PDF konnte nicht erstellt werden."), {
        duration: 10_000,
      });
    } finally {
      setSchritt(null);
    }
  }

  const laeuft = schritt !== null;

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="bewertung" />}
        aktionen={
          bewertung ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={ungespeichert ? "default" : "outline"}
                onClick={() => void speichern()}
                disabled={laeuft || !ungespeichert}
              >
                <Save className="h-4 w-4" /> Speichern
              </Button>
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
                disabled={laeuft}
              >
                <Download className="h-4 w-4" />
                {bewertung.hatPdf && !ungespeichert ? "PDF" : "PDF erstellen"}
              </Button>
            </div>
          ) : undefined
        }
      />
      <PageWrapper>
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-heading">
                  Vermarktungseinschätzung
                </h2>
                <p className="text-xs text-text-muted">
                  Wertindikation aus Salesforce, Grenz-Vergleichsdaten und
                  Marktbericht. Ergebnis in der Vorlage „G&C Einschätzung“.
                </p>
              </div>
              <Button
                size="sm"
                variant={bewertung ? "outline" : "default"}
                onClick={() => void erstellen()}
                disabled={laeuft || !token}
              >
                <FilePlus2 className="h-4 w-4" />
                {bewertung ? "Neue Version" : "Bewertung erstellen"}
              </Button>
            </div>
            {liste === null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : liste.length ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {liste.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    disabled={laeuft}
                    onClick={() => {
                      if (
                        ungespeichert &&
                        !window.confirm("Ungespeicherte Änderungen verwerfen?")
                      )
                        return;
                      setOhneFoto(new Set());
                      void oeffnen(z.id);
                    }}
                    className={cn(
                      "border border-hairline px-2 py-1",
                      z.id === bewertung?.id
                        ? "bg-brand text-white"
                        : "text-heading hover:bg-[var(--gc-grau-zart)]",
                    )}
                  >
                    Version {z.version} · {formatDate(z.updatedAt)}
                    {z.hatPdf ? " · PDF" : ""}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Noch keine Bewertung. Beim Erstellen übernimmt die App Flächen,
                Mieten und Adresse aus Salesforce, sucht vergleichbare Objekte
                im Umkreis (eigene Abschlüsse und Exposé-Eingang) und den
                Angebotsmarkt des letzten Marktberichts.
              </p>
            )}
          </section>

          {schritt && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {schritt}
            </div>
          )}

          {bewertung &&
            eingabe &&
            einstellungen &&
            entscheidung &&
            indikation && (
              <>
                <section className="grid gap-4 border border-hairline bg-surface p-5 lg:grid-cols-[18rem_1fr]">
                  <div className="flex flex-col gap-1">
                    <h2 className="titel-ci text-xs text-text-muted">
                      Wertindikation
                    </h2>
                    {indikation.spanne ? (
                      <>
                        <p className="text-2xl font-light text-heading">
                          {mio(indikation.spanne.min)} –{" "}
                          {mio(indikation.spanne.max)}
                        </p>
                        <p className="text-sm text-text-muted">
                          Vorschlag {mio(indikation.vorschlag)}
                          {eingabe.mieteJahrIst && indikation.vorschlag
                            ? ` · ${fach(indikation.vorschlag / eingabe.mieteJahrIst)}`
                            : ""}
                          {flaeche && indikation.vorschlag
                            ? ` · ${zahl(indikation.vorschlag / flaeche)} €/m²`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-text-muted">
                        Noch keine Spanne: Es fehlen Miete oder Fläche, oder es
                        gibt zu wenige Vergleichsobjekte.
                      </p>
                    )}
                    <div className="mt-3 border-t border-hairline pt-3">
                      <ZahlFeld
                        label="Einschätzung Grenz & Co."
                        einheit="€"
                        wert={entscheidung.preisGrenz}
                        onWert={(w) => entscheidungSetzen({ preisGrenz: w })}
                        hinweis={
                          entscheidung.preisGrenz == null
                            ? "Leer = Vorschlag der Wertindikation"
                            : undefined
                        }
                      />
                      {preis && (
                        <p className="mt-1 text-xs text-text-muted">
                          Im PDF: {mio(preis)}
                          {eingabe.mieteJahrIst
                            ? ` · ${fach(preis / eingabe.mieteJahrIst)}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Spannenbild
                      methoden={indikation.methoden}
                      spanne={indikation.spanne}
                      preis={preis}
                    />
                    {indikation.methoden.length > 0 && (
                      <table className="w-full text-xs">
                        <thead className="text-left text-text-subtle">
                          <tr>
                            <th className="py-1 pr-2 font-normal">Verfahren</th>
                            <th className="py-1 pr-2 font-normal">n</th>
                            <th className="py-1 pr-2 font-normal">
                              Kennwert (Median)
                            </th>
                            <th className="py-1 font-normal">Wert</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indikation.methoden.map((m) => (
                            <tr key={m.id} className="border-t border-hairline">
                              <td className="py-1 pr-2 text-heading">
                                {m.label}
                                <span className="block text-text-subtle">
                                  {m.quelle}
                                </span>
                              </td>
                              <td className="py-1 pr-2">{m.anzahl}</td>
                              <td className="py-1 pr-2">
                                {kennwertText(m, m.kennwert.mittel)}
                                <span className="block text-text-subtle">
                                  {kennwertText(m, m.kennwert.min)} bis{" "}
                                  {kennwertText(m, m.kennwert.max)}
                                </span>
                              </td>
                              <td className="py-1">
                                {mio(m.wert.mittel)}
                                <span className="block text-text-subtle">
                                  {mio(m.wert.min)} bis {mio(m.wert.max)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <ul className="flex flex-col gap-1 text-xs text-text-muted">
                      {indikation.hinweise.map((h) => (
                        <li key={h} className="flex gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{" "}
                          {h}
                        </li>
                      ))}
                      <li className="text-text-subtle">{KEIN_GUTACHTEN}</li>
                    </ul>
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                    <h2 className="text-sm font-semibold text-heading">
                      Objektdaten
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {FELDER.map(({ feld, label, art, einheit }) => {
                        const herkunft = bewertung.herkunft[feld];
                        const hinweis = geaendert.has(feld)
                          ? "geändert"
                          : herkunft?.replace("Salesforce ", "SF ");
                        return art === "zahl" ? (
                          <ZahlFeld
                            key={feld}
                            label={label}
                            einheit={einheit}
                            wert={eingabe[feld] as number | null}
                            onWert={(w) => feldSetzen(feld, w)}
                            hinweis={hinweis}
                            jahr={feld === "baujahr"}
                          />
                        ) : (
                          <TextFeld
                            key={feld}
                            label={label}
                            wert={eingabe[feld] as string | null}
                            onWert={(w) => feldSetzen(feld, w)}
                            hinweis={hinweis}
                          />
                        );
                      })}
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      Besonderheiten (eine pro Zeile, erscheinen in den Key
                      Facts)
                      <Textarea
                        rows={3}
                        value={eingabe.besonderheiten.join("\n")}
                        onChange={(e) => {
                          setEingabe({
                            ...eingabe,
                            besonderheiten: e.target.value.split("\n"),
                          });
                          setUngespeichert(true);
                        }}
                        className="text-sm text-heading"
                      />
                    </label>
                    <p className="text-xs text-text-subtle">
                      {bewertung.geo === "salesforce"
                        ? "Koordinaten aus Salesforce."
                        : bewertung.geo === "adresse"
                          ? "Koordinaten aus der Adresse ermittelt."
                          : "Ohne Koordinaten: Vergleiche werden nicht nach Entfernung gefiltert."}{" "}
                      Geänderte Adresse, Objektart oder Umkreis wirken nach dem
                      Speichern.
                    </p>
                  </section>

                  <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                    <h2 className="text-sm font-semibold text-heading">
                      Einstellungen und Marktumfeld
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      <ZahlFeld
                        label="Umkreis"
                        einheit="km"
                        wert={einstellungen.radiusKm}
                        onWert={(w) => {
                          setEinstellungen({
                            ...einstellungen,
                            radiusKm: w ?? 10,
                          });
                          setUngespeichert(true);
                        }}
                      />
                      <ZahlFeld
                        label="Max. Alter"
                        einheit="Monate"
                        wert={einstellungen.maxAlterMonate}
                        onWert={(w) => {
                          setEinstellungen({
                            ...einstellungen,
                            maxAlterMonate: w ?? 36,
                          });
                          setUngespeichert(true);
                        }}
                      />
                      <ZahlFeld
                        label="Abschlag Angebote"
                        einheit="%"
                        wert={einstellungen.abschlagProzent}
                        onWert={(w) => {
                          setEinstellungen({
                            ...einstellungen,
                            abschlagProzent: w,
                          });
                          setUngespeichert(true);
                        }}
                        hinweis={
                          einstellungen.abschlagGesetztVon
                            ? `gesetzt von ${einstellungen.abschlagGesetztVon}`
                            : "Angebotspreise sind Forderungen"
                        }
                      />
                    </div>
                    {bewertung.markt ? (
                      <div className="flex flex-col gap-1 border-t border-hairline pt-3 text-xs">
                        <p className="text-heading">
                          {bewertung.markt.titel} · Teilmarkt{" "}
                          {bewertung.markt.teilmarkt}
                          <span className="text-text-subtle">
                            {" "}
                            · Stand {formatDate(bewertung.markt.stichtag)}
                          </span>
                        </p>
                        <p className="text-text-muted">
                          {bewertung.markt.faktor
                            ? `Angebotsfaktor ${fach(bewertung.markt.faktor.median)} (n = ${bewertung.markt.faktor.n})`
                            : "Angebotsfaktor: zu wenige Fälle"}
                          {bewertung.markt.preisM2
                            ? ` · ${zahl(bewertung.markt.preisM2.median)} €/m²`
                            : ""}
                          {bewertung.markt.mieteM2
                            ? ` · Miete ${zahl(bewertung.markt.mieteM2.median, 2)} €/m²`
                            : ""}
                        </p>
                        {bewertung.markt.benchmarks.map((b, i) => (
                          <p key={i} className="text-text-subtle">
                            {b.kennzahl} {b.region}:{" "}
                            {zahl(b.wert, 2).replace(/,00$/, "")} {b.einheit} (
                            {b.quelle}, {formatDate(b.stichtag)})
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">
                        Noch kein Marktbericht angelegt.
                      </p>
                    )}
                    {bewertung.ordner && (
                      <a
                        href={bewertung.ordner.webUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-auto flex items-center gap-1 text-xs text-text-muted hover:underline"
                      >
                        Objektordner {bewertung.ordner.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </section>
                </div>

                <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-heading">
                      Vergleichsobjekte (
                      {bewertung.pool.length -
                        ausgeschlossen.filter((id) =>
                          bewertung.pool.some((v) => v.quelleId === id),
                        ).length}{" "}
                      von {bewertung.pool.length} in der Rechnung)
                    </h2>
                    {imPdf && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-text-muted hover:underline"
                        onClick={() => {
                          setImPdf(null);
                          setUngespeichert(true);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" /> PDF-Auswahl
                        automatisch
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    Haken = fließt in die Wertindikation ein. Stern = erscheint
                    auf der Folie „Vergleichstransaktionen“ (höchstens drei).
                  </p>
                  {bewertung.pool.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[44rem] text-xs">
                        <thead className="text-left text-text-subtle">
                          <tr>
                            <th className="w-8 py-1" />
                            <th className="w-8 py-1" />
                            <th className="py-1 pr-2 font-normal">Objekt</th>
                            <th className="py-1 pr-2 font-normal">Quelle</th>
                            <th className="py-1 pr-2 font-normal">
                              Entfernung
                            </th>
                            <th className="py-1 pr-2 font-normal">Preis</th>
                            <th className="py-1 pr-2 font-normal">Faktor</th>
                            <th className="py-1 pr-2 font-normal">€/m²</th>
                            <th className="py-1 font-normal">Stand</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bewertung.pool.map((v) => {
                            const drin = !ausgeschlossen.includes(v.quelleId);
                            const stern = folienVergleiche.some(
                              (f) => f.quelleId === v.quelleId,
                            );
                            return (
                              <tr
                                key={v.quelleId}
                                className={cn(
                                  "border-t border-hairline",
                                  !drin && "opacity-40",
                                )}
                              >
                                <td className="py-1">
                                  <input
                                    type="checkbox"
                                    checked={drin}
                                    aria-label="In die Rechnung"
                                    onChange={() => {
                                      setAusgeschlossen((a) =>
                                        drin
                                          ? [...a, v.quelleId]
                                          : a.filter((x) => x !== v.quelleId),
                                      );
                                      setUngespeichert(true);
                                    }}
                                  />
                                </td>
                                <td className="py-1">
                                  <button
                                    type="button"
                                    aria-label="Auf der Folie zeigen"
                                    onClick={() => {
                                      const aktuell = folienVergleiche.map(
                                        (f) => f.quelleId,
                                      );
                                      const neu = stern
                                        ? aktuell.filter(
                                            (x) => x !== v.quelleId,
                                          )
                                        : [...aktuell, v.quelleId].slice(-3);
                                      setImPdf(neu);
                                      setUngespeichert(true);
                                    }}
                                  >
                                    <Star
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        stern
                                          ? "fill-current text-heading"
                                          : "text-text-subtle",
                                      )}
                                    />
                                  </button>
                                </td>
                                <td className="py-1 pr-2 text-heading">
                                  {[v.adresse, v.ort]
                                    .filter(Boolean)
                                    .join(", ") || "ohne Adresse"}
                                  <span className="block text-text-subtle">
                                    {[
                                      v.objektart,
                                      v.baujahr
                                        ? `Bj. ${Math.round(v.baujahr)}`
                                        : null,
                                      v.flaeche
                                        ? `${zahl(v.flaeche)} m²`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </td>
                                <td className="py-1 pr-2">
                                  {quelleText(v.quelle)}
                                  <span className="block text-text-subtle">
                                    {v.preisart === "kauf"
                                      ? "Kaufpreis"
                                      : "Angebot"}
                                  </span>
                                </td>
                                <td className="py-1 pr-2">
                                  {v.km != null ? `${zahl(v.km, 1)} km` : "–"}
                                </td>
                                <td className="py-1 pr-2">
                                  {mio(v.kaufpreis)}
                                </td>
                                <td className="py-1 pr-2">
                                  {v.faktor ? fach(v.faktor) : "–"}
                                </td>
                                <td className="py-1 pr-2">
                                  {v.preisM2 ? zahl(v.preisM2) : "–"}
                                </td>
                                <td className="py-1">
                                  {v.stichtag ? formatDate(v.stichtag) : "–"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">
                      Keine Vergleichsobjekte gleicher Nutzungsart im Umkreis.
                      Umkreis oder maximales Alter vergrößern und speichern.
                    </p>
                  )}
                </section>

                <section className="grid gap-4 border border-hairline bg-surface p-5 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-heading">
                      Einschätzung für den Eigentümer
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      <TextFeld
                        label="Empfänger (Titelseite)"
                        wert={entscheidung.empfaenger}
                        onWert={(w) => entscheidungSetzen({ empfaenger: w })}
                      />
                      <label className="flex flex-col gap-1 text-xs text-text-muted">
                        Datum
                        <Input
                          type="date"
                          value={entscheidung.datum}
                          onChange={(e) =>
                            entscheidungSetzen({ datum: e.target.value })
                          }
                          className="h-8 text-sm text-heading"
                        />
                      </label>
                      <ZahlFeld
                        label="Preisvorstellung Eigentümer"
                        einheit="€"
                        wert={entscheidung.preisEigentuemer}
                        onWert={(w) =>
                          entscheidungSetzen({ preisEigentuemer: w })
                        }
                        hinweis="Leer = Zeile entfällt in der Preisfindung"
                      />
                      <TextFeld
                        label="Anmerkung zum Preis"
                        wert={entscheidung.preisAnmerkung}
                        onWert={(w) =>
                          entscheidungSetzen({ preisAnmerkung: w })
                        }
                        hinweis="z. B. Soll-Miete, Garagenhof enthalten"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      <span className="flex items-center justify-between">
                        Zusammenfassung (eine Aussage pro Zeile)
                        {entscheidung.zusammenfassung && (
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              entscheidungSetzen({ zusammenfassung: null })
                            }
                          >
                            aus Zahlen neu
                          </button>
                        )}
                      </span>
                      <Textarea
                        rows={5}
                        value={(
                          entscheidung.zusammenfassung ??
                          zusammenfassungStandard
                        ).join("\n")}
                        onChange={(e) =>
                          entscheidungSetzen({
                            zusammenfassung: e.target.value.split("\n"),
                          })
                        }
                        className="text-sm text-heading"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      Weiteres Vorgehen (erste Zeile = Überschrift)
                      <Textarea
                        rows={4}
                        value={(
                          entscheidung.vorgehen ?? STANDARD_VORGEHEN
                        ).join("\n")}
                        onChange={(e) =>
                          entscheidungSetzen({
                            vorgehen: e.target.value.split("\n"),
                          })
                        }
                        className="text-sm text-heading"
                      />
                    </label>
                  </div>
                </section>

                {fotos.length > 0 && (
                  <section className="flex flex-col gap-2 border border-hairline bg-surface p-5">
                    <h2 className="text-sm font-semibold text-heading">
                      Fotos ({fotos.filter((f) => !ohneFoto.has(f.id)).length}{" "}
                      im PDF)
                    </h2>
                    <p className="text-xs text-text-muted">
                      Das erste Foto wird Titelbild, die nächsten drei
                      erscheinen unter „Impressionen“. Antippen nimmt ein Foto
                      heraus.
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {fotos.map((f) => {
                        const aus = ohneFoto.has(f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            title={f.name}
                            onClick={() =>
                              setOhneFoto((s) => {
                                const n = new Set(s);
                                if (aus) n.delete(f.id);
                                else n.add(f.id);
                                return n;
                              })
                            }
                            className={cn(
                              "aspect-[4/3] overflow-hidden border border-hairline",
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
              </>
            )}
        </div>
      </PageWrapper>
    </>
  );
}
