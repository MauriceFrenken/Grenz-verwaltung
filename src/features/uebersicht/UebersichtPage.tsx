import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kachel, KachelReihe, Karte } from "@/features/kennzahlen/bausteine";
import { VIZ, euroKurz } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatDate, formatInt, formatMonth } from "@/lib/format";
import type { KennzahlenDto } from "@/lib/kennzahlen/types";
import { prognose, type PipelineDto } from "@/lib/pipeline/berechnen";
import type { UebersichtDto } from "@/lib/uebersicht/berechnen";
import {
  jahresanteil,
  ZIEL_KENNZAHLEN,
  zielerreichung,
  type ZielKennzahl,
  type ZieleDto,
} from "@/lib/ziele/typen";
import { cn } from "@/lib/utils";

function tagesgruss(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

/** Lädt eine Server-Funktion; Fehler einzelner Bereiche blockieren die Seite nicht. */
function useLaden<T>(
  token: string,
  laden: (token: string) => Promise<T>,
  zaehler = 0,
): { daten: T | null; fehler: string | null } {
  const [daten, setDaten] = useState<T | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    void laden(token).then(
      (d) => aktiv && setDaten(d),
      (e) => aktiv && setFehler(apiFehlermeldung(e)),
    );
    return () => {
      aktiv = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, zaehler]);
  return { daten, fehler };
}

const ladeUebersicht = async (token: string) =>
  (await import("@/lib/uebersicht/server-fn")).uebersichtLadenFn({
    data: { supabaseAccessToken: token },
  });
const ladeKennzahlen = async (token: string) =>
  (await import("@/lib/kennzahlen/server-fn")).kennzahlenLadenFn({
    data: { supabaseAccessToken: token, jahr: new Date().getFullYear() },
  });
const ladePipeline = async (token: string) =>
  (await import("@/lib/pipeline/server-fn")).pipelineLadenFn({
    data: { supabaseAccessToken: token },
  });
const ladeZiele = async (token: string) =>
  (await import("@/lib/ziele/server-fn")).zieleLadenFn({
    data: { supabaseAccessToken: token, jahr: new Date().getFullYear() },
  });

/** Startseite: Ergebnisse, Ziele und Strategie von Grenz & Co. Das Operative läuft über Trello. */
export function UebersichtPage() {
  const { benutzer, session } = useAuth();
  const token = session?.access_token ?? "";
  const vorname = benutzer?.name?.trim().split(/\s+/)[0];
  const [zieleStand, setZieleStand] = useState(0);

  const uebersicht = useLaden(token, ladeUebersicht);
  const kennzahlen = useLaden(token, ladeKennzahlen);
  const pipeline = useLaden(token, ladePipeline);
  const ziele = useLaden(token, ladeZiele, zieleStand);

  useEffect(() => {
    if (uebersicht.fehler) toast.error(uebersicht.fehler);
  }, [uebersicht.fehler]);

  const datum = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <header className="hairline-b flex shrink-0 flex-col gap-1 border-b border-hairline bg-surface px-8 py-6">
        <span className="label-caps text-text-muted">{datum}</span>
        <h1 className="titel-ci text-[1.75rem] leading-tight">
          {tagesgruss()}
          {vorname ? `, ${vorname}` : ""}
        </h1>
        <p className="text-sm text-text-muted">
          Ergebnisse, Ziele und Strategie auf einen Blick. Das operative
          Tagesgeschäft läuft über Trello, die Detailauswertungen stehen unter
          Kennzahlen.
        </p>
      </header>
      <PageWrapper>
        {!uebersicht.daten ? (
          <p className="text-sm text-text-muted">
            {uebersicht.fehler ? "Keine Daten." : "Lädt…"}
          </p>
        ) : (
          <Dashboard
            daten={uebersicht.daten}
            kennzahlen={kennzahlen.daten}
            kennzahlenFehler={kennzahlen.fehler}
            pipeline={pipeline.daten}
            ziele={ziele.daten}
            onZieleGespeichert={() => setZieleStand((n) => n + 1)}
          />
        )}
      </PageWrapper>
    </>
  );
}

/** Gewichtete Provisionsprognose vom laufenden Monat bis Dezember. */
function prognoseRestjahr(p: PipelineDto | null): number | null {
  if (!p) return null;
  const monat = Number(p.heute.slice(5, 7));
  return prognose(p, { zurueck: 0, vor: 13 - monat }).reduce(
    (s, m) => s + m.gewichtet,
    0,
  );
}

function Dashboard({
  daten,
  kennzahlen,
  kennzahlenFehler,
  pipeline,
  ziele,
  onZieleGespeichert,
}: {
  daten: UebersichtDto;
  kennzahlen: KennzahlenDto | null;
  kennzahlenFehler: string | null;
  pipeline: PipelineDto | null;
  ziele: ZieleDto | null;
  onZieleGespeichert: () => void;
}) {
  const k = daten.kacheln;
  const jahr = daten.heute.slice(0, 4);
  const restjahr = prognoseRestjahr(pipeline);
  const provisionsziel = ziele?.ziele.provision_netto ?? null;
  // Bezahlte Provision zählt nach dem Kontoeingang (netto); Salesforce nur, solange die Bankdaten laden.
  const bankJahr =
    kennzahlen?.provisionen.filter((p) => p.datum.startsWith(jahr)) ?? null;
  const provisionIst = bankJahr
    ? bankJahr.reduce((s, p) => s + p.netto, 0)
    : k.provisionJahr;
  const verkaeufeIst = bankJahr ? bankJahr.length : k.abschluesseJahr;
  const ohneSalesforce = bankJahr
    ? Math.max(0, bankJahr.length - k.abschluesseJahr)
    : 0;
  const anteil = zielerreichung(provisionIst, provisionsziel);
  const runway = kennzahlen?.runway ?? null;
  const vorjahrDiff = provisionIst - k.provisionVorjahrBisHeute;

  return (
    <div className="flex flex-col gap-6">
      {daten.salesforceLeer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm">
          <span className="flex items-center gap-2 text-heading">
            <RefreshCw className="size-4" strokeWidth={1.5} />
            Noch keine Salesforce-Daten abgerufen. Ergebnisse und Pipeline
            erscheinen nach dem ersten Abruf.
          </span>
          <Link
            to="/einstellungen/integrationen"
            className="font-medium text-brand-text hover:underline"
          >
            Jetzt abrufen
          </Link>
        </div>
      ) : null}

      <KachelReihe>
        <Kachel
          titel={`Provision ${jahr} netto`}
          wert={euroKurz(provisionIst)}
          unterzeile={
            anteil != null && provisionsziel
              ? `${Math.round((provisionIst / provisionsziel) * 100)} % vom Jahresziel ${euroKurz(provisionsziel)}`
              : "Jahresziel noch nicht hinterlegt"
          }
          nebenwert={`${verkaeufeIst} ${verkaeufeIst === 1 ? "Provisionseingang" : "Provisionseingänge"} auf dem Konto, ohne USt${ohneSalesforce ? ` (${ohneSalesforce} ohne bezahlten Deal in Salesforce)` : ""} · Vorjahr bis heute ${euroKurz(k.provisionVorjahrBisHeute)} (${vorjahrDiff >= 0 ? "+" : "−"}${euroKurz(Math.abs(vorjahrDiff))})`}
          ton={
            anteil != null && anteil >= jahresanteil(daten.heute)
              ? "gut"
              : undefined
          }
        />
        <Kachel
          titel={`Prognose bis Dezember`}
          wert={restjahr == null ? "…" : euroKurz(restjahr)}
          unterzeile="Gewichtete Provision aus der Deal-Pipeline, netto"
          nebenwert={
            restjahr == null
              ? undefined
              : `Ist + Prognose ${jahr}: ${euroKurz(provisionIst + restjahr)}${provisionsziel ? ` · ${Math.round(((provisionIst + restjahr) / provisionsziel) * 100)} % vom Ziel` : ""}`
          }
        />
        <Kachel
          titel="Runway"
          wert={
            runway
              ? runway.monate == null
                ? "–"
                : `${runway.monate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monate`
              : kennzahlenFehler
                ? "–"
                : "…"
          }
          unterzeile={
            runway
              ? `Liquidität netto ${euroKurz(runway.liquiditaetNetto)} ÷ Fixkosten ${euroKurz(runway.fixProMonat)} je Monat`
              : (kennzahlenFehler ?? "Bankdaten werden geladen")
          }
          nebenwert={
            runway?.reichtBis
              ? `Reicht bis ${formatMonth(`${runway.reichtBis}-01`)}, offene USt bereits abgezogen`
              : undefined
          }
          ton={
            runway?.monate != null
              ? runway.monate < 6
                ? "schlecht"
                : runway.monate >= 12
                  ? "gut"
                  : undefined
              : undefined
          }
        />
        <Kachel
          titel="Provision mit Maklervertrag"
          wert={euroKurz(k.provisionVertrag)}
          unterzeile={`${k.mandateMitVertrag} beauftragte ${k.mandateMitVertrag === 1 ? "Mandat" : "Mandate"} mit schriftlichem Maklervertrag, netto`}
          nebenwert={`Alle ${k.beauftragtGesamt} beauftragten Mandate: ${euroKurz(k.provisionPipeline)} (inkl. lose Beauftragung und Off-Market)`}
        />
      </KachelReihe>

      <div className="grid gap-6 lg:grid-cols-5">
        <JahresZiele
          className="lg:col-span-3"
          daten={daten}
          ziele={ziele}
          restjahr={restjahr}
          provisionIst={provisionIst}
          verkaeufeIst={verkaeufeIst}
          onGespeichert={onZieleGespeichert}
        />
        <Karte
          titel="Mandats-Pipeline"
          hinweis="Offene Mandate nach Phase, Volumen = Summe der Exposé-Preise."
          className="lg:col-span-2"
        >
          <Pipeline daten={daten} />
        </Karte>
      </div>

      <div className="grid gap-6">
        <Karte
          titel="Letzte Abschlüsse"
          hinweis={`${jahr}: Provisionseingänge auf dem Konto, ältere aus Salesforce. Alles netto.`}
        >
          <AbschlussListe
            eintraege={[
              ...(bankJahr ?? []).map((p) => ({
                titel: p.objekt ?? p.zahler,
                datum: p.datum,
                zusatz: p.objekt ? p.zahler : "Kontoeingang",
                provision: p.netto,
                kaufpreis: null,
              })),
              ...daten.abschluesse
                .filter((a) => !bankJahr || !(a.datum ?? "").startsWith(jahr))
                .map((a) => ({
                  titel: a.name.replace(/^Opp\.\s*/, ""),
                  datum: a.datum,
                  zusatz: null,
                  provision: a.provision,
                  kaufpreis: a.kaufpreis,
                })),
            ].slice(0, 6)}
          />
        </Karte>
      </div>

      <p className="text-xs text-text-muted">
        Quelle: Salesforce (Stand{" "}
        {daten.letzterAbruf
          ? new Date(daten.letzterAbruf).toLocaleString("de-DE", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "–"}
        , täglicher Abruf), Bankkonten über EBICS · Provisionen netto ohne USt ·
        Testdatensätze ausgeblendet.
      </p>
    </div>
  );
}

function AbschlussListe({
  eintraege,
}: {
  eintraege: Array<{
    titel: string;
    datum: string | null;
    zusatz: string | null;
    provision: number | null;
    kaufpreis: number | null;
  }>;
}) {
  if (eintraege.length === 0)
    return <p className="text-sm text-text-muted">Noch keine Abschlüsse.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {eintraege.map((a, i) => (
        <li
          key={`${a.titel}-${i}`}
          className="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span className="min-w-0">
            <span className="block truncate text-heading">{a.titel}</span>
            <span className="block truncate text-xs text-text-muted">
              {formatDate(a.datum)}
              {a.zusatz ? ` · ${a.zusatz}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="font-semibold tabular-nums text-heading">
              {a.provision ? euroKurz(a.provision) : "–"}
            </span>
            <span className="text-xs tabular-nums text-text-muted">
              {a.kaufpreis ? `${euroKurz(a.kaufpreis)} KP` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Fortschritt({
  ist,
  zusatz,
  ziel,
  soll,
}: {
  ist: number;
  /** Zweites, helleres Segment (z. B. Prognose). */
  zusatz?: number;
  ziel: number;
  /** Zeitanteil des Jahres als Marke (0–1). */
  soll: number;
}) {
  const breite = (n: number) => `${Math.min(100, (n / ziel) * 100)}%`;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <div className="flex h-full">
        <div style={{ width: breite(ist), background: VIZ[0] }} />
        {zusatz ? (
          <div
            style={{
              width: breite(Math.max(0, Math.min(zusatz, ziel - ist))),
              background: VIZ[1],
            }}
          />
        ) : null}
      </div>
      <div
        className="absolute inset-y-0 w-px bg-heading"
        style={{ left: `${soll * 100}%` }}
        title="Zeitanteil des Jahres"
      />
    </div>
  );
}

function JahresZiele({
  daten,
  ziele,
  restjahr,
  provisionIst,
  verkaeufeIst,
  onGespeichert,
  className,
}: {
  daten: UebersichtDto;
  ziele: ZieleDto | null;
  restjahr: number | null;
  provisionIst: number;
  verkaeufeIst: number;
  onGespeichert: () => void;
  className?: string;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const k = daten.kacheln;
  const jahr = daten.heute.slice(0, 4);
  const soll = jahresanteil(daten.heute);
  const ist: Record<ZielKennzahl, number> = {
    provision_netto: provisionIst,
    verkaeufe: verkaeufeIst,
    neue_mandate: k.neueMandateJahr,
  };
  const vorjahr: Partial<Record<ZielKennzahl, string>> = {
    provision_netto: `Vorjahr gesamt ${euroKurz(k.provisionVorjahr)}`,
    verkaeufe: `Vorjahr gesamt ${k.abschluesseVorjahr}`,
  };

  return (
    <Karte
      titel={`Jahresziele ${jahr}`}
      hinweis="Ist gegen Ziel. Der Strich markiert, wie viel vom Jahr vergangen ist; hellblau = gewichtete Prognose bis Dezember."
      className={className}
    >
      {!ziele ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {ZIEL_KENNZAHLEN.map((kz) => {
              const ziel = ziele.ziele[kz.wert];
              const quelle = ziele.quelle[kz.wert];
              const wert = ist[kz.wert];
              const fmt = (n: number) =>
                kz.einheit === "euro" ? euroKurz(n) : formatInt(n);
              return (
                <li key={kz.wert} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-heading">{kz.label}</span>
                    <span className="tabular-nums text-heading">
                      <span className="font-semibold">{fmt(wert)}</span>
                      <span className="text-text-muted">
                        {ziel ? ` von ${fmt(ziel)}` : " · kein Ziel"}
                      </span>
                    </span>
                  </div>
                  {ziel ? (
                    <Fortschritt
                      ist={wert}
                      zusatz={
                        kz.wert === "provision_netto"
                          ? (restjahr ?? undefined)
                          : undefined
                      }
                      ziel={ziel}
                      soll={soll}
                    />
                  ) : null}
                  <span className="text-xs text-text-muted">
                    {kz.hinweis}
                    {ziel
                      ? ` · ${Math.round((wert / ziel) * 100)} % erreicht, ${Math.round(soll * 100)} % des Jahres vorbei`
                      : ""}
                    {vorjahr[kz.wert] ? ` · ${vorjahr[kz.wert]}` : ""}
                    {quelle === "mitarbeiter"
                      ? " · Ziel = Summe der Mitarbeiterziele"
                      : quelle === "standard"
                        ? " · Ziel = Vorschlag"
                        : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
            <span className="text-xs text-text-muted">
              {ziele.tabelle
                ? "Ziele gelten für das ganze Unternehmen."
                : "Vorgeschlagene Ziele. Zum Ändern muss die Migration „unternehmensziele“ eingespielt sein."}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!ziele.tabelle}
              onClick={() => setBearbeiten(true)}
            >
              <Target className="size-4" strokeWidth={1.5} />
              Ziele pflegen
            </Button>
          </div>
          <ZieleDialog
            offen={bearbeiten}
            ziele={ziele}
            onSchliessen={() => setBearbeiten(false)}
            onGespeichert={() => {
              setBearbeiten(false);
              onGespeichert();
            }}
          />
        </>
      )}
    </Karte>
  );
}

function ZieleDialog({
  offen,
  ziele,
  onSchliessen,
  onGespeichert,
}: {
  offen: boolean;
  ziele: ZieleDto;
  onSchliessen: () => void;
  onGespeichert: () => void;
}) {
  const { session } = useAuth();
  // Mit den wirksamen Zielen (auch Vorschlägen) vorbelegt, damit Speichern sie übernimmt.
  const [werte, setWerte] = useState<Record<ZielKennzahl, string>>(
    () =>
      Object.fromEntries(
        ZIEL_KENNZAHLEN.map((k) => [
          k.wert,
          ziele.ziele[k.wert] != null ? String(ziele.ziele[k.wert]) : "",
        ]),
      ) as Record<ZielKennzahl, string>,
  );
  const [speichert, setSpeichert] = useState(false);

  const speichern = useCallback(async () => {
    setSpeichert(true);
    try {
      const { zieleSpeichernFn } = await import("@/lib/ziele/server-fn");
      await zieleSpeichernFn({
        data: {
          supabaseAccessToken: session?.access_token ?? "",
          jahr: ziele.jahr,
          ziele: Object.fromEntries(
            Object.entries(werte).map(([k, v]) => [
              k,
              v.trim() === ""
                ? null
                : Number(v.replace(/\./g, "").replace(",", ".")),
            ]),
          ),
        },
      });
      toast.success("Jahresziele gespeichert");
      onGespeichert();
    } catch (e) {
      toast.error(apiFehlermeldung(e));
    }
    setSpeichert(false);
  }, [session, werte, ziele.jahr, onGespeichert]);

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jahresziele {ziele.jahr}</DialogTitle>
          <DialogDescription>
            Ziele für Grenz & Co. insgesamt. Provision immer netto ohne USt.
            Leer lassen, wenn es kein Ziel gibt.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {ZIEL_KENNZAHLEN.map((k) => (
            <label key={k.wert} className="flex flex-col gap-1 text-sm">
              <span className="text-heading">
                {k.label}
                {k.einheit === "euro" ? " (€ netto)" : " (Anzahl)"}
              </span>
              <Input
                inputMode="decimal"
                value={werte[k.wert]}
                placeholder={
                  k.wert === "provision_netto" &&
                  ziele.mitarbeiterProvisionsziel
                    ? `Summe Mitarbeiterziele: ${Math.round(ziele.mitarbeiterProvisionsziel)}`
                    : undefined
                }
                onChange={(e) =>
                  setWerte((w) => ({ ...w, [k.wert]: e.target.value }))
                }
              />
              <span className="text-xs text-text-muted">{k.hinweis}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSchliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => void speichern()} disabled={speichert}>
            {speichert ? <Loader2 className="size-4 animate-spin" /> : null}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pipeline({ daten }: { daten: UebersichtDto }) {
  const gesamt = daten.mandatsPhasen.reduce((s, p) => s + p.anzahl, 0);
  const abgeschlossen = daten.gewonnen + daten.verloren;
  const k = daten.kacheln;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        {daten.mandatsPhasen.map((p, i) =>
          p.anzahl ? (
            <div
              key={p.phase}
              style={{
                width: `${(p.anzahl / Math.max(1, gesamt)) * 100}%`,
                background: VIZ[i],
              }}
              title={`${p.phase}: ${p.anzahl}`}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {daten.mandatsPhasen.map((p, i) => (
          <li key={p.phase} className="flex items-center gap-3 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: VIZ[i] }}
            />
            <span className="flex-1 text-heading">{p.phase}</span>
            <span className="w-20 text-right text-xs tabular-nums text-text-muted">
              {p.volumen ? euroKurz(p.volumen) : "–"}
            </span>
            <span className="w-8 text-right font-semibold tabular-nums text-heading">
              {p.anzahl}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-3 border-t border-hairline pt-3 text-sm">
        <div>
          <span className="label-caps text-text-muted">Gewinnquote</span>
          <p className="font-semibold tabular-nums text-heading">
            {abgeschlossen
              ? `${Math.round((daten.gewonnen / abgeschlossen) * 100)} %`
              : "–"}
          </p>
          <p className="text-xs text-text-muted">
            {daten.gewonnen} gewonnen · {daten.verloren} verloren
          </p>
        </div>
        <div>
          <span className="label-caps text-text-muted">Neue Mandate</span>
          <p className="font-semibold tabular-nums text-heading">
            {k.neueMandate4W}
          </p>
          <p className="text-xs text-text-muted">
            4 Wochen, davor {k.neueMandateVor4W}
          </p>
        </div>
        <div>
          <span className="label-caps text-text-muted">Mit Deal</span>
          <p className="font-semibold tabular-nums text-heading">
            {k.offeneInteressenten}
          </p>
          <p className="text-xs text-text-muted">
            Kaufinteressenten, {k.imDatenraum} im Datenraum
          </p>
        </div>
      </div>
      <Link
        to="/mandate/pipeline"
        className="group flex items-center gap-1 self-start text-sm font-medium text-brand-text hover:underline"
      >
        Zur Deal-Pipeline
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.5}
        />
      </Link>
    </div>
  );
}
