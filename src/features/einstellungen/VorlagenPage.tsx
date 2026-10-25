import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { EinstellungenReiter } from "./EinstellungenReiter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { base64Herunterladen, dateiAlsBase64 } from "@/lib/download";
import type { AbschnittDefinition, DesignDefinition, DesignVorlage, DokumentTyp } from "@/lib/vorlagen/typen";

const TYPEN: { typ: DokumentTyp; label: string }[] = [
  { typ: "allgemein", label: "Allgemein" },
  { typ: "eigentuemer_report", label: "Eigentümer-Report" },
  { typ: "expose", label: "Exposé" },
  { typ: "teaser", label: "Teaser" },
  { typ: "bewertung", label: "Bewertung" },
];

const FARBEN: { key: keyof DesignDefinition["farben"]; label: string }[] = [
  { key: "primaer", label: "Primärfarbe" },
  { key: "akzent", label: "Akzent" },
  { key: "text", label: "Text" },
  { key: "textHell", label: "Text hell" },
  { key: "linie", label: "Linien" },
  { key: "flaeche", label: "Flächen" },
];

const TEXTE: { key: "fusszeile" | "disclaimer" | "provisionshinweis" | "widerrufsbelehrung"; label: string }[] = [
  { key: "fusszeile", label: "Fußzeile" },
  { key: "disclaimer", label: "Haftungshinweis" },
  { key: "provisionshinweis", label: "Provisionshinweis" },
  { key: "widerrufsbelehrung", label: "Widerrufsbelehrung" },
];

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-text-subtle">{label}</span>
      {children}
    </label>
  );
}

export function VorlagenPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [typ, setTyp] = useState<DokumentTyp>("allgemein");
  const [vorlage, setVorlage] = useState<DesignVorlage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { vorlageLadenFn } = await import("@/lib/vorlagen/server-fn");
      setVorlage(await vorlageLadenFn({ data: { supabaseAccessToken: token, typ } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vorlage konnte nicht geladen werden.");
    }
  }, [token, typ]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const design = vorlage?.design;
  const setzeDesign = (teil: Partial<DesignDefinition>) =>
    setVorlage((v) => (v ? { ...v, design: { ...v.design, ...teil } } : v));
  const setzeAbschnitte = (abschnitte: AbschnittDefinition[]) => setVorlage((v) => (v ? { ...v, abschnitte } : v));

  const verschieben = (i: number, richtung: -1 | 1) => {
    if (!vorlage) return;
    const liste = [...vorlage.abschnitte];
    const j = i + richtung;
    if (j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    setzeAbschnitte(liste);
  };

  const speichern = async () => {
    if (!vorlage) return;
    setBusy("speichern");
    try {
      const { vorlageSpeichernFn } = await import("@/lib/vorlagen/server-fn");
      setVorlage(
        await vorlageSpeichernFn({
          data: { supabaseAccessToken: token, typ, design: vorlage.design, abschnitte: vorlage.abschnitte },
        }),
      );
      toast.success("Vorlage gespeichert.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const muster = async (format: "pdf" | "pptx") => {
    setBusy(format);
    try {
      const { vorlageMusterFn } = await import("@/lib/vorlagen/server-fn");
      base64Herunterladen(await vorlageMusterFn({ data: { supabaseAccessToken: token, typ, format } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const logoHochladen = async (datei: File | undefined) => {
    if (!datei) return;
    setBusy("logo");
    try {
      const { vorlageLogoHochladenFn } = await import("@/lib/vorlagen/server-fn");
      const { pfad } = await vorlageLogoHochladenFn({
        data: { supabaseAccessToken: token, base64: await dateiAlsBase64(datei), dateiname: datei.name },
      });
      setzeDesign({ logoPfad: pfad });
      toast.success("Logo hochgeladen. Speichern nicht vergessen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        titel="Einstellungen"
        reiter={<EinstellungenReiter aktiv="vorlagen" />}
        beschreibung="Grenz-Design für Exposé, Teaser, Eigentümer-Report und Bewertung. PDF und PowerPoint nutzen dieselbe Vorlage."
      />
      <PageWrapper>
        <div className="flex max-w-4xl flex-col gap-6">
          <div className="flex flex-wrap gap-1">
            {TYPEN.map((t) => (
              <Button
                key={t.typ}
                size="sm"
                variant={t.typ === typ ? "default" : "outline"}
                onClick={() => setTyp(t.typ)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {!design ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
                <h2 className="text-sm font-semibold text-heading">Design (gilt für alle Dokumente)</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {FARBEN.map((f) => (
                    <Feld key={f.key} label={f.label}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={design.farben[f.key]}
                          onChange={(e) => setzeDesign({ farben: { ...design.farben, [f.key]: e.target.value } })}
                          className="h-8 w-10 cursor-pointer border border-hairline"
                        />
                        <Input
                          value={design.farben[f.key]}
                          onChange={(e) => setzeDesign({ farben: { ...design.farben, [f.key]: e.target.value } })}
                        />
                      </div>
                    </Feld>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["titel", "text"] as const).map((k) => (
                    <Feld key={k} label={k === "titel" ? "Schrift Überschriften" : "Schrift Fließtext"}>
                      <select
                        className="h-9 border border-input bg-background px-2 text-sm"
                        value={design.schriften[k]}
                        onChange={(e) =>
                          setzeDesign({ schriften: { ...design.schriften, [k]: e.target.value as "serif" | "sans" } })
                        }
                      >
                        <option value="serif">Serif (Garamond-Stil)</option>
                        <option value="sans">Sans (Source-Sans-Stil)</option>
                      </select>
                    </Feld>
                  ))}
                </div>
                <Feld label="Logo für das Deckblatt (PNG oder JPG, hell auf dunklem Grund)">
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/png,image/jpeg" onChange={(e) => void logoHochladen(e.target.files?.[0])} />
                    <span className="text-text-subtle">{design.logoPfad ? design.logoPfad : "Eingebautes Grenz-Logo"}</span>
                    {design.logoPfad ? (
                      <Button size="sm" variant="outline" onClick={() => setzeDesign({ logoPfad: null })}>
                        Zurücksetzen
                      </Button>
                    ) : null}
                  </div>
                </Feld>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(Object.keys(design.firma) as (keyof DesignDefinition["firma"])[]).map((k) => (
                    <Feld key={k} label={{ name: "Firma", anschrift: "Anschrift", telefon: "Telefon", email: "E-Mail", web: "Web", register: "Register" }[k]}>
                      <Input value={design.firma[k]} onChange={(e) => setzeDesign({ firma: { ...design.firma, [k]: e.target.value } })} />
                    </Feld>
                  ))}
                </div>
                {TEXTE.map((t) => (
                  <Feld key={t.key} label={t.label}>
                    <Textarea rows={t.key === "fusszeile" ? 1 : 3} value={design[t.key]} onChange={(e) => setzeDesign({ [t.key]: e.target.value })} />
                  </Feld>
                ))}
              </section>

              {vorlage && vorlage.abschnitte.length ? (
                <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
                  <h2 className="text-sm font-semibold text-heading">Abschnitte: Reihenfolge und Sichtbarkeit</h2>
                  {vorlage.abschnitte.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={a.sichtbar}
                        onChange={(e) =>
                          setzeAbschnitte(vorlage.abschnitte.map((x) => (x.id === a.id ? { ...x, sichtbar: e.target.checked } : x)))
                        }
                      />
                      <Input
                        className="max-w-sm"
                        value={a.titel}
                        onChange={(e) =>
                          setzeAbschnitte(vorlage.abschnitte.map((x) => (x.id === a.id ? { ...x, titel: e.target.value } : x)))
                        }
                      />
                      <Button size="icon" variant="ghost" onClick={() => verschieben(i, -1)} aria-label="Nach oben">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => verschieben(i, 1)} aria-label="Nach unten">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </section>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => void speichern()}>
                  {busy === "speichern" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Speichern
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void muster("pdf")}>
                  {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Muster als PDF
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void muster("pptx")}>
                  {busy === "pptx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Muster als PowerPoint
                </Button>
              </div>
              <p className="text-xs text-text-subtle">Version {vorlage?.version ?? 1}. Vorschau nutzt die zuletzt gespeicherte Vorlage.</p>
            </>
          )}
        </div>
      </PageWrapper>
    </>
  );
}
