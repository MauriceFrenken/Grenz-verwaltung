import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Karte } from "@/features/kennzahlen/bausteine";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatEuro, formatInt, formatMonth } from "@/lib/format";
import { monatPlus, vormonat } from "@/lib/gesellschafterbericht/berechnen";
import {
  FELD_INFO,
  HAUPTWERTE,
  KOMMENTAR_MAX,
  MAKLER_KENNZAHLEN,
  type BerichtArt,
  type BerichtInhalt,
  type Feldname,
  type GesellschafterberichtDto,
  type GesendeterBericht,
} from "@/lib/gesellschafterbericht/typen";
import { cn } from "@/lib/utils";

const EINGABE =
  "flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

const ALLE_FELDER: Feldname[] = [...HAUPTWERTE, ...MAKLER_KENNZAHLEN];

/** Zahl für das Eingabefeld, ohne Tausenderpunkte. */
function alsText(n: number | null): string {
  if (n === null) return "";
  return n.toLocaleString("de-DE", {
    useGrouping: false,
    maximumFractionDigits: 2,
  });
}

/**
 * Eingabe → Zahl. „84500“, „84.500“, „84.500,50“, „3,1“ und „3.1“ werden verstanden.
 * Leer = null; undefined = ungültig.
 */
function alsZahl(t: string): number | null | undefined {
  const s = t.replace(/\s|€|%/g, "");
  if (!s) return null;
  let norm = s;
  if (s.includes(",")) norm = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : undefined;
}

function wertAnzeige(f: Feldname, n: number | null): string {
  if (n === null) return "leer";
  const e = FELD_INFO[f].einheit;
  if (e === "euro") return formatEuro(n);
  if (e === "prozent")
    return `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
  return formatInt(n);
}

function zeit(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function monatsOptionen(art: BerichtArt, heute: string): string[] {
  const vm = vormonat(heute);
  return art === "ist"
    ? Array.from({ length: 24 }, (_, i) => monatPlus(vm, -i))
    : Array.from({ length: 14 }, (_, i) => monatPlus(vm, i));
}

function Hinweis({
  ton,
  children,
}: {
  ton: "warnung" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border p-4 text-sm",
        ton === "warnung"
          ? "border-warn bg-warn-soft text-heading"
          : "border-hairline bg-surface text-text-muted",
      )}
    >
      {children}
    </div>
  );
}

/** Gesellschafterbericht: Entwurf prüfen, korrigieren, freigeben und an die FRENKEN-App senden. */
export function GesellschafterberichtSeite() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const heute = new Date().toISOString().slice(0, 10);

  const [art, setArt] = useState<BerichtArt>("ist");
  const [periode, setPeriode] = useState(() => vormonat(heute));
  const [daten, setDaten] = useState<GesellschafterberichtDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [eingaben, setEingaben] = useState<Record<Feldname, string>>(
    () =>
      Object.fromEntries(ALLE_FELDER.map((f) => [f, ""])) as Record<
        Feldname,
        string
      >,
  );
  const [kommentar, setKommentar] = useState("");
  const [vorschau, setVorschau] = useState<BerichtInhalt | null>(null);
  const [geprueft, setGeprueft] = useState(false);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { gesellschafterberichtLadenFn } =
        await import("@/lib/gesellschafterbericht/server-fn");
      const d = await gesellschafterberichtLadenFn({
        data: { supabaseAccessToken: token, periode, art },
      });
      setDaten(d);
      setEingaben(
        Object.fromEntries(
          ALLE_FELDER.map((f) => [f, alsText(d.entwurf.werte[f].wert)]),
        ) as Record<Feldname, string>,
      );
      setFehler(null);
    } catch (err) {
      setFehler(apiFehlermeldung(err));
    } finally {
      setLaedt(false);
    }
  }, [token, periode, art]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const zahlen = useMemo(() => {
    const werte = {} as Record<Feldname, number | null>;
    const ungueltig: Feldname[] = [];
    for (const f of ALLE_FELDER) {
      const n = alsZahl(eingaben[f]);
      if (n === undefined) ungueltig.push(f);
      werte[f] = n ?? null;
    }
    return { werte, ungueltig };
  }, [eingaben]);

  const optionen = monatsOptionen(art, heute);
  const kommentarZuLang = kommentar.trim().length > KOMMENTAR_MAX;
  const sendenMoeglich =
    !!daten?.darfFreigeben &&
    !!daten?.konfiguriert &&
    zahlen.ungueltig.length === 0 &&
    !kommentarZuLang &&
    !laedt;

  const pruefen = async () => {
    setBusy(true);
    try {
      const { gesellschafterberichtVorschauFn } =
        await import("@/lib/gesellschafterbericht/server-fn");
      const r = await gesellschafterberichtVorschauFn({
        data: {
          supabaseAccessToken: token,
          formular: { periode, art, werte: zahlen.werte, kommentar },
        },
      });
      if (r.fehler.length) {
        toast.error(r.fehler.join(" "));
        return;
      }
      setGeprueft(false);
      setVorschau(r.inhalt);
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setBusy(false);
    }
  };

  const senden = async () => {
    if (!vorschau) return;
    setBusy(true);
    try {
      const { gesellschafterberichtSendenFn } =
        await import("@/lib/gesellschafterbericht/server-fn");
      const r = await gesellschafterberichtSendenFn({
        data: { supabaseAccessToken: token, inhalt: vorschau },
      });
      if (r.erfolgreich) {
        toast.success(
          `Bericht ${formatMonth(vorschau.periode)} an die FRENKEN-App gesendet.`,
        );
      } else {
        toast.error(
          `Bericht nicht angenommen${r.antwortStatus ? ` (HTTP ${r.antwortStatus})` : ""}: ${r.antwortText}`,
        );
      }
      setVorschau(null);
      setDaten((alt) =>
        alt ? { ...alt, historie: [r.bericht, ...alt.historie] } : alt,
      );
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        titel="Gesellschafterbericht"
        beschreibung="Monatlicher Kennzahlenbericht an die Gesellschafter (FRENKEN Management App). Die Geschäftsführung prüft, korrigiert und gibt frei."
        aktionen={
          <>
            <select
              aria-label="Art"
              className={cn(EINGABE, "w-28")}
              value={art}
              onChange={(e) => {
                const neu = e.target.value as BerichtArt;
                setArt(neu);
                if (!monatsOptionen(neu, heute).includes(periode))
                  setPeriode(vormonat(heute));
              }}
            >
              <option value="ist">Ist</option>
              <option value="plan">Plan</option>
            </select>
            <select
              aria-label="Berichtsmonat"
              className={cn(EINGABE, "w-44")}
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
            >
              {optionen.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={laedt}
              onClick={() => void laden()}
            >
              {laedt ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Entwurf neu berechnen
            </Button>
          </>
        }
      />
      <PageWrapper>
        {fehler ? (
          <Hinweis ton="warnung">
            <p className="font-medium">Der Entwurf konnte nicht geladen werden.</p>
            <p className="mt-1">{fehler}</p>
          </Hinweis>
        ) : null}

        {daten && !daten.konfiguriert ? (
          <Hinweis ton="warnung">
            Die Schnittstelle zur FRENKEN-App ist nicht eingerichtet. In Vercel
            müssen die Server-Variablen <code>FRENKEN_BERICHT_URL</code> und{" "}
            <code>FRENKEN_BERICHT_SCHLUESSEL</code> gesetzt sein. Bis dahin kann
            der Entwurf geprüft, aber nicht gesendet werden.
          </Hinweis>
        ) : null}
        {daten && !daten.darfFreigeben ? (
          <Hinweis ton="info">
            Freigeben und senden darf nur die Geschäftsführung (Rolle
            Administrator). Sie können den Entwurf ansehen und vorbereiten.
          </Hinweis>
        ) : null}
        {daten?.einrichtungsHinweis ? (
          <Hinweis ton="warnung">{daten.einrichtungsHinweis}</Hinweis>
        ) : null}

        {!daten ? (
          fehler ? null : (
            <Loader2 className="size-4 animate-spin" />
          )
        ) : (
          <>
            <Karte
              titel={`Kennzahlen ${formatMonth(daten.entwurf.periode)} (${daten.entwurf.art === "ist" ? "Ist" : "Plan"})`}
              hinweis="Automatisch berechnete Werte stammen aus den Daten dieser App; die Quelle steht unter jedem Feld. Leere Felder werden als null gesendet. Es fließen nur zusammengefasste Kennzahlen, keine Kunden-, Eigentümer-, Investoren- oder Personendaten."
            >
              <FeldGruppe
                titel="Finanzen und Team"
                felder={[...HAUPTWERTE]}
                daten={daten}
                eingaben={eingaben}
                ungueltig={zahlen.ungueltig}
                onChange={(f, v) => setEingaben((alt) => ({ ...alt, [f]: v }))}
              />
              <FeldGruppe
                titel="Maklerkennzahlen"
                felder={[...MAKLER_KENNZAHLEN]}
                daten={daten}
                eingaben={eingaben}
                ungueltig={zahlen.ungueltig}
                onChange={(f, v) => setEingaben((alt) => ({ ...alt, [f]: v }))}
              />
            </Karte>

            <Karte
              titel="Kommentar"
              hinweis="Lage, Chancen und Risiken in eigenen Worten. Bitte keine Namen von Kunden, Eigentümern, Investoren oder Mitarbeitern."
            >
              <Textarea
                rows={7}
                value={kommentar}
                placeholder="Lage, Chancen und Risiken"
                onChange={(e) => setKommentar(e.target.value)}
              />
              <p
                className={cn(
                  "text-right text-xs",
                  kommentarZuLang ? "text-danger" : "text-text-subtle",
                )}
              >
                {kommentar.trim().length} / {KOMMENTAR_MAX} Zeichen
              </p>
            </Karte>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {zahlen.ungueltig.length ? (
                <span className="text-sm text-danger">
                  Ungültige Zahl:{" "}
                  {zahlen.ungueltig.map((f) => FELD_INFO[f].label).join(", ")}
                </span>
              ) : null}
              <Button
                disabled={!sendenMoeglich || busy}
                onClick={() => void pruefen()}
              >
                {busy && !vorschau ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Prüfen und an Gesellschafter senden
              </Button>
            </div>

            <Historie historie={daten.historie} />
          </>
        )}
      </PageWrapper>

      <Dialog
        open={vorschau !== null}
        onOpenChange={(o) => !o && !busy && setVorschau(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bericht freigeben und senden</DialogTitle>
            <DialogDescription>
              Genau dieser Inhalt geht an die FRENKEN Management App. Ein
              erneuter Bericht für denselben Monat und dieselbe Art ersetzt dort
              den vorherigen.
            </DialogDescription>
          </DialogHeader>
          {vorschau ? (
            <div className="flex flex-col gap-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-hairline">
                    <td className="py-1.5 text-text-muted">Berichtsmonat</td>
                    <td className="py-1.5 text-right">
                      {formatMonth(vorschau.periode)} (
                      {vorschau.art === "ist" ? "Ist" : "Plan"})
                    </td>
                  </tr>
                  {ALLE_FELDER.map((f) => {
                    const n = (HAUPTWERTE as readonly string[]).includes(f)
                      ? (vorschau[f as (typeof HAUPTWERTE)[number]] ?? null)
                      : (vorschau.kennzahlen[
                          f as (typeof MAKLER_KENNZAHLEN)[number]
                        ] ?? null);
                    return (
                      <tr key={f} className="border-b border-hairline">
                        <td className="py-1.5 text-text-muted">
                          {FELD_INFO[f].label}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right tabular-nums",
                            n === null && "text-text-subtle",
                          )}
                        >
                          {wertAnzeige(f, n)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-1.5 text-text-muted">Freigegeben von</td>
                    <td className="py-1.5 text-right">
                      {vorschau.freigegeben_von}, {zeit(vorschau.freigegeben_am)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div>
                <p className="label-caps mb-1 text-text-muted">
                  Gesendeter Inhalt (JSON)
                </p>
                <pre className="max-h-72 overflow-auto border border-hairline bg-surface-muted p-3 text-xs">
                  {JSON.stringify(vorschau, null, 2)}
                </pre>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={geprueft}
                  onChange={(e) => setGeprueft(e.target.checked)}
                />
                Ich habe den Bericht geprüft und gebe ihn als{" "}
                {vorschau.freigegeben_von} zur Übermittlung an die
                Gesellschafter frei.
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setVorschau(null)}
            >
              Abbrechen
            </Button>
            <Button disabled={!geprueft || busy} onClick={() => void senden()}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Freigeben und senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeldGruppe({
  titel,
  felder,
  daten,
  eingaben,
  ungueltig,
  onChange,
}: {
  titel: string;
  felder: Feldname[];
  daten: GesellschafterberichtDto;
  eingaben: Record<Feldname, string>;
  ungueltig: Feldname[];
  onChange: (f: Feldname, v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="label-caps text-text-muted">{titel}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {felder.map((f) => {
          const info = FELD_INFO[f];
          const e = daten.entwurf.werte[f];
          const aktuell = alsZahl(eingaben[f]);
          const geaendert = aktuell !== undefined && aktuell !== e.wert;
          return (
            <div key={f} className="flex flex-col gap-1.5">
              <label
                htmlFor={`gb-${f}`}
                className="flex items-center justify-between gap-2 text-xs text-text-muted"
              >
                <span>
                  {info.label}{" "}
                  <span className="text-text-subtle">({info.erklaerung})</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 px-1.5 py-0.5 text-[11px]",
                    geaendert
                      ? "bg-warn-soft text-warn"
                      : e.automatisch
                        ? "bg-[var(--gc-hellblau)] text-heading"
                        : "bg-surface-muted text-text-subtle",
                  )}
                >
                  {geaendert ? "geändert" : e.automatisch ? "automatisch" : "manuell"}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`gb-${f}`}
                  inputMode="decimal"
                  autoComplete="off"
                  className={cn(
                    EINGABE,
                    ungueltig.includes(f) && "border-danger",
                  )}
                  value={eingaben[f]}
                  placeholder="leer"
                  onChange={(ev) => onChange(f, ev.target.value)}
                />
                <span className="w-6 shrink-0 text-sm text-text-muted">
                  {info.einheit === "euro"
                    ? "€"
                    : info.einheit === "prozent"
                      ? "%"
                      : ""}
                </span>
              </div>
              <p className="text-xs text-text-subtle">
                Quelle: {e.quelle}
                {geaendert
                  ? ` · berechnet: ${e.wert === null ? "leer" : wertAnzeige(f, e.wert)}`
                  : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Historie({ historie }: { historie: GesendeterBericht[] }) {
  const [offen, setOffen] = useState<string | null>(null);
  return (
    <Karte
      titel="Gesendete Berichte"
      hinweis="Jeder Sendeversuch mit Inhalt, Freigabe und Antwort der FRENKEN-App."
    >
      {historie.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Berichte gesendet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-text-muted">
                <th className="px-2 py-2 font-normal">Monat</th>
                <th className="px-2 py-2 font-normal">Art</th>
                <th className="px-2 py-2 font-normal">Freigegeben</th>
                <th className="px-2 py-2 font-normal">Gesendet</th>
                <th className="px-2 py-2 font-normal">Antwort</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {historie.map((b) => (
                <HistorieZeile
                  key={b.id}
                  bericht={b}
                  offen={offen === b.id}
                  onToggle={() => setOffen(offen === b.id ? null : b.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Karte>
  );
}

function HistorieZeile({
  bericht: b,
  offen,
  onToggle,
}: {
  bericht: GesendeterBericht;
  offen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-hairline">
        <td className="whitespace-nowrap px-2 py-2">{formatMonth(b.periode)}</td>
        <td className="px-2 py-2">{b.art === "ist" ? "Ist" : "Plan"}</td>
        <td className="whitespace-nowrap px-2 py-2">
          {b.freigegebenVon}
          <span className="block text-xs text-text-subtle">
            {zeit(b.freigegebenAm)}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2">{zeit(b.gesendetAm)}</td>
        <td className="px-2 py-2">
          <span
            className={cn(
              "px-1.5 py-0.5 text-xs",
              b.erfolgreich
                ? "bg-[var(--gc-navy)] text-white"
                : "bg-danger text-white",
            )}
          >
            {b.erfolgreich
              ? "angenommen"
              : b.antwortStatus
                ? `abgelehnt (HTTP ${b.antwortStatus})`
                : b.gesendetAm
                  ? "keine Antwort"
                  : "nicht gesendet"}
          </span>
        </td>
        <td className="px-2 py-2 text-right">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {offen ? "Schließen" : "Details"}
          </Button>
        </td>
      </tr>
      {offen ? (
        <tr className="border-b border-hairline">
          <td colSpan={6} className="px-2 py-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="label-caps mb-1 text-text-muted">Gesendeter Inhalt</p>
                <pre className="max-h-72 overflow-auto border border-hairline bg-surface-muted p-3 text-xs">
                  {JSON.stringify(b.inhalt, null, 2)}
                </pre>
              </div>
              <div>
                <p className="label-caps mb-1 text-text-muted">Antwort</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-hairline bg-surface-muted p-3 text-xs">
                  {b.antwortText ?? "–"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
