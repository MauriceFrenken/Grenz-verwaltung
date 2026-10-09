import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  DatabaseZap,
  ListChecks,
  PieChart,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Buehne,
  Countdown,
  GrosseZahl,
  GrosserBetrag,
  LivePunkt,
  LosKarte,
} from "@/components/board/Bausteine";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { Karte, Kennzahlen } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt } from "@/components/board/Status";
import type { Ampel } from "@/components/board/ampel";
import {
  datum,
  datumLang,
  euro,
  euroKompakt,
  euroMitVorzeichen,
  prozent,
  tagKurz,
} from "@/lib/format/de";
import { cn } from "@/lib/utils";
import {
  kreisReihe,
  tiefpunkt,
  tragbaresEk,
  HORIZONT_TAGE,
} from "@/modules/liquiditaet/logik/liquiditaet";
import { leerstandAmpel } from "@/modules/immobilien/logik/objekte";
import {
  ankaufKennzahlen,
  ekBedarfAbAngebot,
} from "@/modules/transaktionen/logik/transaktionen";
import {
  faelligDieseWoche,
  pruefFallZiel,
  QUELLE_LABEL,
} from "@/modules/pruefliste/logik/pruefliste";
import { useLage } from "@/modules/pruefliste/useLage";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import {
  handelAuswerten,
  plattformAuswerten,
} from "@/modules/baumaschinen/logik/baumaschinen";
import { fristenBis, kapitalbindung, letzteBuchungen } from "./logik/antworten";
import { saalLose } from "./SaalLose";
import { useRechnungsfreigabeOffen } from "./useRechnungsfreigabe";

/** Blau-Abstufungen für die Kapitalbindung (größter Posten im FRENKEN-Blau). */
const BINDUNG_FARBEN = ["#4a5fe0", "#7b8cf0", "#aab5f7", "#71717a", "#3f3f46"];

function AntwortKopf({
  titel,
  frage,
  href,
  icon: Icon,
}: {
  titel: string;
  frage: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Link to={href} className="group min-w-0">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted group-hover:text-heading">
          {titel}
          <ArrowRight
            className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </h2>
        <p className="mt-0.5 text-xs text-text-subtle">{frage}</p>
      </Link>
      <span
        className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
    </div>
  );
}

function HinweisLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex h-6 items-center rounded-full border border-hairline px-2.5 text-[11px] text-text-muted transition-colors hover:border-input hover:text-heading"
    >
      {children}
    </Link>
  );
}

function gruss(): string {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

interface Aussage {
  ampel: Ampel;
  text: string;
  href: string;
}

export function CockpitSeite() {
  const lage = useLage();
  const filter = useGesellschaftsFilter();
  const rechnungenOffen = useRechnungsfreigabeOffen();

  if (lage.fehler)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Cockpit nicht verfügbar"
        text={(lage.fehler as Error).message}
      />
    );
  if (
    lage.laedt ||
    !lage.data ||
    !lage.liquiditaet ||
    !lage.darlehen ||
    !lage.immobilien ||
    !lage.faelle ||
    !lage.crm
  )
    return <SeitenSkelett />;

  const { data: daten, liquiditaet: l, darlehen, immobilien, crm } = lage;
  const stichtag = daten.stichtag;
  const passt = (id: string | null | undefined) => filter.passt(id);

  // Liquidität: Kreis = freie Gruppe oder gewählte Gesellschaft
  const ids = filter.alle ? l.freieIds : [filter.gesellschaft];
  const kreis = daten.companies.filter((c) => ids.includes(c.id));
  const min = kreis.reduce((s, c) => s + c.minLiquidity, 0);
  const minFehlt = kreis.filter((c) => !c.minLiquidityGesetzt).length;
  const ohneSaldo = daten.bankAccounts.filter(
    (k) => ids.includes(k.companyId) && !k.saldoBekannt,
  ).length;
  const reihe = kreisReihe(l.verlauf, ids);
  const kurz = reihe.slice(0, HORIZONT_TAGE + 1);
  const heute = kurz[0].wert;
  const in13 = kurz.at(-1)!.wert;
  const tief13 = tiefpunkt(kurz);
  const liqAmpel = (x: number): Ampel =>
    ohneSaldo || minFehlt === kreis.length
      ? "grau"
      : x < min
        ? "rot"
        : x < 1.5 * min
          ? "gelb"
          : "gruen";
  const liqHinweis = ohneSaldo
    ? `Daten fehlen: ${ohneSaldo} ${ohneSaldo > 1 ? "Konten" : "Konto"} ohne Saldo`
    : minFehlt
      ? `Mindestliquidität bei ${minFehlt} Gesellschaft${minFehlt > 1 ? "en" : ""} nicht festgelegt`
      : `Mindestens ${euroKompakt(min)}`;

  // Datengrundlage: Herkunft je Kachel (Tooltip)
  const quelle = (id: string) => {
    const q = daten.datenstand.find((x) => x.id === id);
    if (!q) return daten.quelle === "mock" ? "Musterdaten" : undefined;
    return `${q.system} · Stand ${q.stand ? datum(q.stand.slice(0, 10)) : "unbekannt"}`;
  };
  const lueckenRot = daten.luecken.filter((x) => x.schwere === "rot").length;

  // Baumaschinen und Holding
  const handel = handelAuswerten(daten, passt);
  const plattform = plattformAuswerten(daten, passt);
  const runway = plattform
    .map((p) => p.runwayMonate)
    .filter((x): x is number => x != null);
  const zeigeSegment = (segmente: string[]) =>
    daten.companies.some((c) => segmente.includes(c.segment) && passt(c.id));
  const intern = darlehen.staende.filter(
    (s) =>
      s.loan.status === "aktiv" &&
      s.loan.kind !== "bank" &&
      (passt(s.loan.borrowerCompanyId) || passt(s.loan.lenderCompanyId)),
  );

  // Prüffälle
  const offen = lage.faelle.filter(
    (f) =>
      f.status === "offen" &&
      (filter.alle || f.companyId === filter.gesellschaft),
  );
  const rot = offen.filter((f) => f.severity === "rot");

  // Darlehen: aktive Bankdarlehen als Nehmer der Gruppe
  const aktiveDarlehen = darlehen.staende.filter(
    (s) => s.loan.status === "aktiv" && passt(s.loan.borrowerCompanyId),
  );
  const bankRest = aktiveDarlehen
    .filter((s) => s.loan.kind === "bank")
    .reduce((s, x) => s + x.restschuld, 0);
  const fristRot = aktiveDarlehen.filter((s) => s.ampel === "rot").length;

  // Immobilien Bestand
  const bestand = immobilien.objekte.filter(
    (o) => o.property.strategy === "bestand" && passt(o.property.companyId),
  );
  const sollMiete = bestand.reduce((s, o) => s + o.sollMieteMonat, 0);
  const flaeche = bestand.reduce((s, o) => s + o.vermietbar, 0);
  const leer = bestand.reduce(
    (s, o) => s + o.leer.reduce((x, u) => x + u.area, 0),
    0,
  );
  const leerQuote = flaeche ? leer / flaeche : 0;

  // Heute zu tun
  const faellig = faelligDieseWoche(daten, l.bewegungen).filter((p) =>
    passt(p.companyId),
  );
  const zuEntscheiden = offen.slice(0, 7);
  const kurzName = (id: string | null) =>
    daten.companies.find((c) => c.id === id)?.shortName ?? "–";

  // Lagebild: drei Aussagen mit Konsequenz
  const aussagen: Aussage[] = [];
  const unter = l.gesellschaften
    .filter((g) => g.ersteUnterschreitung && passt(g.company.id))
    .sort((a, b) =>
      a.ersteUnterschreitung!.localeCompare(b.ersteUnterschreitung!),
    );
  if (unter.length)
    aussagen.push({
      ampel: unter[0].ampel,
      text: `${unter[0].company.name} unterschreitet ab ${datum(unter[0].ersteUnterschreitung)} die Mindestliquidität (Lücke ${euroKompakt(unter[0].luecke)})${
        unter.length > 1
          ? `; ${unter.length - 1} weitere Gesellschaft${unter.length > 2 ? "en" : ""} im 24-Monats-Plan`
          : ""
      }.`,
      href: "/board/liquiditaet",
    });
  if (filter.alle) {
    const ek = ekBedarfAbAngebot(
      crm.ankaeufe.map((a) => ankaufKennzahlen(a, stichtag)),
    );
    const tragbar = tragbaresEk(reihe, stichtag, min);
    aussagen.push({
      ampel: ek > tragbar ? "rot" : ek > 0.7 * tragbar ? "gelb" : "gruen",
      text: `Pipeline braucht ab Angebot ${euroKompakt(ek)} Eigenkapital; frei verfügbar sind ${euroKompakt(tragbar)}${
        ek > tragbar ? ", also priorisieren oder Fremdkapital erhöhen" : ""
      }.`,
      href: "/board/transaktionen",
    });
  }
  const fristen = aktiveDarlehen.filter(
    (s) => s.ampel !== "gruen" && s.ampel !== "grau",
  );
  if (fristen.length)
    aussagen.push({
      ampel: fristRot ? "rot" : "gelb",
      text: `${fristen.length} Darlehen über ${euroKompakt(fristen.reduce((s, x) => s + x.restschuld, 0))} enden oder verlieren in 12 Monaten die Zinsbindung; Anschlussfinanzierung jetzt verhandeln.`,
      href: "/board/darlehen",
    });

  // Die drei Antworten
  const bindung = kapitalbindung(darlehen.staende, daten.companies);
  const fristen90 = fristenBis(darlehen.staende, stichtag, 90, passt);
  // Liste: nächste Fristen im Jahr, damit die Spalte nicht leer bleibt
  const fristenJahr = fristenBis(darlehen.staende, stichtag, 365, passt);
  const ticker = letzteBuchungen(daten, 14, passt);
  const naechste = faellig
    .filter((p) => !p.ueberfaellig)
    .sort((x, y) => x.datum.localeCompare(y.datum))[0];
  const bankStand = daten.datenstand.find(
    (x) => x.id === "bankumsaetze",
  )?.stand;
  const geldKreis = l.gesellschaften
    .filter((g) => ids.includes(g.company.id))
    .sort((x, y) => y.heute - x.heute)
    .slice(0, 5);
  const geldMax = Math.max(
    1,
    ...geldKreis.map((g) => Math.max(g.heute, g.company.minLiquidity)),
  );
  const lose = saalLose({
    stichtag,
    fristen: fristen90,
    ankaeufe: crm.ankaeufe.filter(
      (a) => passt(a.zielGesellschaftId) || filter.alle,
    ),
    maschinen: handel.bestand.filter((m) => passt(m.machine.companyId)),
    kurzName,
  });
  const top = aussagen[0];

  return (
    <>
      <Buehne>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
              <LivePunkt />
              {bankStand
                ? `Bankstand ${datum(bankStand.slice(0, 10))}`
                : daten.quelle === "mock"
                  ? "Demodaten"
                  : "Bankstand unbekannt"}
            </div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-heading">
              {gruss()}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {datumLang(stichtag)} ·{" "}
              {filter.alle
                ? "Gruppe (frei verfügbar, ohne Maklerbereich)"
                : daten.companies.find((c) => c.id === filter.gesellschaft)
                    ?.name}
            </p>
          </div>
          {naechste ? (
            <div className="min-w-[260px] rounded-lg border border-hairline bg-surface px-4 py-3 schatten-karte">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-text-muted">Nächste Zahlung</span>
                <Countdown
                  ziel={naechste.datum}
                  stichtag={stichtag}
                  className="text-xs font-medium"
                />
              </div>
              <div className="ziffern mt-1 text-xl font-semibold tracking-[-0.02em] text-heading">
                {euro(naechste.betrag)}
              </div>
              <div className="mt-0.5 max-w-[260px] truncate text-xs text-text-muted">
                {naechste.label}
              </div>
            </div>
          ) : null}
        </div>
      </Buehne>

      {top || (daten.quelle === "live" && lueckenRot) ? (
        <div className="mb-6 space-y-2">
          {top ? (
            <Link
              to={top.href}
              className="group flex items-start gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm text-heading schatten-karte transition-colors hover:border-input"
            >
              <AmpelPunkt ampel={top.ampel} className="mt-1.5" />
              <span className="flex-1">{top.text}</span>
              <ArrowRight
                className="mt-0.5 size-4 shrink-0 text-text-subtle transition-colors group-hover:text-heading"
                aria-hidden
              />
            </Link>
          ) : null}
          {daten.quelle === "live" && lueckenRot ? (
            <Link
              to="/board/daten"
              className="flex items-center gap-3 rounded-lg border border-bad/20 bg-bad-soft px-4 py-2.5 text-sm text-bad hover:border-bad/40"
            >
              <DatabaseZap className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                {lueckenRot} kritische Datenlücke{lueckenRot > 1 ? "n" : ""}:
                betroffene Zahlen sind markiert
              </span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 *:min-w-0 lg:grid-cols-3">
        {/* Geld */}
        <Karte className="flex flex-col p-6">
          <AntwortKopf
            titel="Geld"
            frage="Wie viel ist frei?"
            href="/board/liquiditaet"
            icon={Wallet}
          />
          <div
            className="mt-4 text-[32px] font-semibold leading-none tracking-[-0.03em] text-heading"
            title={quelle("kontosalden")}
          >
            <GrosserBetrag wert={heute} />
          </div>
          <p className="ziffern mt-2 text-xs text-text-muted">
            frei heute · Tiefpunkt 13 Wochen{" "}
            <span
              className={cn(
                "font-medium",
                liqAmpel(tief13.saldo) === "rot" ? "text-bad" : "text-heading",
              )}
            >
              {euroKompakt(tief13.saldo)}
            </span>{" "}
            am {datum(tief13.datum)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{liqHinweis}</p>
          <ul className="mt-5 space-y-3 border-t border-hairline pt-4">
            {geldKreis.map((g) => (
              <li key={g.company.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-text-muted">
                    <span className="mr-1.5 font-medium text-heading">
                      {g.company.shortName}
                    </span>
                    {g.company.name}
                  </span>
                  <span className="ziffern shrink-0 text-heading">
                    {euroKompakt(g.heute)}
                  </span>
                </div>
                <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-muted">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      g.ampel === "rot"
                        ? "bg-bad"
                        : g.ampel === "gelb"
                          ? "bg-warn"
                          : "bg-brand",
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(100, (g.heute / geldMax) * 100))}%`,
                    }}
                  />
                  {g.company.minLiquidityGesetzt ? (
                    <div
                      className="absolute -inset-y-0.5 w-0.5 rounded-full bg-heading"
                      style={{
                        left: `${Math.min(100, (g.company.minLiquidity / geldMax) * 100)}%`,
                      }}
                      title={`Mindestliquidität ${euroKompakt(g.company.minLiquidity)}`}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {geldKreis.some((g) => g.company.minLiquidityGesetzt) ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-muted">
              <span
                className="inline-block h-2.5 w-0.5 rounded-full bg-heading"
                aria-hidden
              />
              Mindestliquidität
            </p>
          ) : null}
        </Karte>

        {/* Risiko */}
        <Karte className="flex flex-col p-6">
          <AntwortKopf
            titel="Risiko"
            frage="Was läuft ab?"
            href="/board/darlehen"
            icon={ShieldAlert}
          />
          <div className="mt-4 flex items-baseline gap-8">
            <div>
              <div className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-heading">
                <GrosseZahl wert={fristen90.length} />
              </div>
              <div className="mt-2 text-xs text-text-muted">
                Fristen ≤ 90 Tage
              </div>
            </div>
            <div>
              <div
                className={cn(
                  "text-[32px] font-semibold leading-none tracking-[-0.03em]",
                  rot.length ? "text-bad" : "text-heading",
                )}
              >
                <GrosseZahl wert={rot.length} />
              </div>
              <div className="mt-2 text-xs text-text-muted">rote Prüffälle</div>
            </div>
          </div>
          <div className="mt-5 border-t border-hairline pt-4 text-xs font-medium text-text-muted">
            Nächste Fristen (12 Monate)
          </div>
          <ul className="-mx-2 mt-1.5">
            {fristenJahr.slice(0, 4).map((f) => (
              <li key={f.stand.loan.id}>
                <Link
                  to="/board/darlehen"
                  search={{ darlehen: f.stand.loan.id } as never}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-surface-muted"
                >
                  <span className="ziffern w-[86px] shrink-0 font-medium text-heading">
                    {f.stand.loan.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-muted">
                    {f.ereignis} · {kurzName(f.stand.loan.borrowerCompanyId)} ·{" "}
                    {euroKompakt(f.stand.restschuld)}
                  </span>
                  <Countdown ziel={f.datum} stichtag={stichtag} />
                </Link>
              </li>
            ))}
            {fristenJahr.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-text-muted">
                Keine Fristen in den nächsten 12 Monaten.
              </li>
            ) : null}
          </ul>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            <HinweisLink to="/board/pruefliste">
              {offen.length} offene Prüffälle
            </HinweisLink>
            <HinweisLink to="/board/daten">
              {daten.luecken.length} Datenlücken ({lueckenRot} kritisch)
            </HinweisLink>
            {rechnungenOffen != null ? (
              <HinweisLink to="/dokumente/rechnungsfreigabe">
                {rechnungenOffen} Rechnungen zur Freigabe
              </HinweisLink>
            ) : null}
          </div>
        </Karte>

        {/* Kapitalbindung */}
        <Karte className="flex flex-col p-6">
          <AntwortKopf
            titel="Kapitalbindung"
            frage="Wo steckt das Geld?"
            href="/board/darlehen"
            icon={PieChart}
          />
          <div className="mt-4 text-[32px] font-semibold leading-none tracking-[-0.03em] text-heading">
            <GrosserBetrag wert={bindung.summe} />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            interne Darlehen der Holding an die Segmente
          </p>
          {bindung.posten.length ? (
            <div className="mt-5 border-t border-hairline pt-4">
              <div
                className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={bindung.posten
                  .map((p) => `${p.label} ${prozent(p.anteil, 0)}`)
                  .join(", ")}
              >
                {bindung.posten.map((p, i) => (
                  <div
                    key={p.segment}
                    className="h-full"
                    style={{
                      width: `${p.anteil * 100}%`,
                      background: BINDUNG_FARBEN[i % BINDUNG_FARBEN.length],
                    }}
                  />
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {bindung.posten.map((p, i) => (
                  <li
                    key={p.segment}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: BINDUNG_FARBEN[i % BINDUNG_FARBEN.length],
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-text-muted">
                      {p.label}
                    </span>
                    <span className="ziffern text-heading">
                      {euroKompakt(p.betrag)}
                    </span>
                    <span className="ziffern w-10 text-right text-text-muted">
                      {prozent(p.anteil, 0)}
                    </span>
                  </li>
                ))}
              </ul>
              {bindung.posten[0].anteil >= 0.5 ? (
                <p className="mt-4 rounded-md bg-surface-muted px-3 py-2 text-xs text-heading">
                  {prozent(bindung.posten[0].anteil, 0)} stecken in{" "}
                  {bindung.posten[0].label}.
                  {bindung.posten[0].segment.startsWith("baumaschinen") &&
                  daten.machines.length === 0
                    ? " Zu Bestand und Standzeit gibt es noch keine Zahl."
                    : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-xs text-text-muted">
              Keine internen Darlehen der Holding.
            </p>
          )}
        </Karte>
      </div>

      <div className="mb-6 grid gap-4 *:min-w-0 lg:grid-cols-3">
        <SegmentKarte titel="Immobilien" href="/board/immobilien">
          <Kennzahlen
            eintraege={[
              { label: "Soll-Miete / Monat", wert: euroKompakt(sollMiete) },
              {
                label: "Leerstand",
                wert: (
                  <span className="inline-flex items-center gap-1.5">
                    <AmpelPunkt ampel={leerstandAmpel(leerQuote)} />
                    {prozent(leerQuote, 1)}
                  </span>
                ),
              },
              { label: "Bestandsobjekte", wert: String(bestand.length) },
              {
                label: "Ankäufe in Arbeit",
                wert: String(
                  crm.ankaeufe.filter(
                    (a) => a.phase !== "gekauft" && a.phase !== "abgesagt",
                  ).length,
                ),
              },
            ]}
          />
        </SegmentKarte>
        <SegmentKarte titel="Baumaschinen" href="/board/baumaschinen">
          {zeigeSegment(["baumaschinen_handel", "baumaschinen_plattform"]) ? (
            <Kennzahlen
              eintraege={[
                {
                  label: "Lagerwert Handel",
                  wert: daten.machines.length
                    ? euroKompakt(handel.lagerwert)
                    : "Daten fehlen",
                },
                {
                  label: "Ø Lagerdauer",
                  wert:
                    handel.lagerDauerSchnitt == null
                      ? "–"
                      : `${handel.lagerDauerSchnitt} Tage`,
                },
                {
                  label: "Rohertrag 12 M",
                  wert: daten.machines.length
                    ? euroKompakt(handel.rohertrag12)
                    : "–",
                },
                {
                  label: "Runway Plattform",
                  wert: runway.length
                    ? `${Math.min(...runway).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monate`
                    : "Daten fehlen",
                },
              ]}
            />
          ) : (
            <p className="text-sm text-text-muted">
              Für den gewählten Filter keine Baumaschinen-Gesellschaft.
            </p>
          )}
        </SegmentKarte>
        <SegmentKarte titel="Holding / Finanzierung" href="/board/darlehen">
          <Kennzahlen
            eintraege={[
              { label: "Bankdarlehen Restschuld", wert: euroKompakt(bankRest) },
              {
                label: "Fristen ≤ 12 Monate",
                wert: (
                  <span className="inline-flex items-center gap-1.5">
                    <AmpelPunkt
                      ampel={
                        fristRot ? "rot" : fristen.length ? "gelb" : "gruen"
                      }
                    />
                    {fristen.length}
                  </span>
                ),
              },
              { label: "Interne Darlehen", wert: String(intern.length) },
              {
                label: "davon Volumen",
                wert: euroKompakt(intern.reduce((s, x) => s + x.restschuld, 0)),
              },
            ]}
          />
        </SegmentKarte>
      </div>

      {lose.length ? (
        <section className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-heading">
                Anstehend
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Fristen, Deals und Maschinen, nach Dringlichkeit
              </p>
            </div>
            <Link
              to="/board/runde"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
            >
              Zur Wochenrunde <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {lose.slice(0, 4).map((los) => (
              <LosKarte key={los.los} {...los} />
            ))}
          </div>
        </section>
      ) : null}

      {aussagen.length > 1 ? (
        <Karte className="mb-6 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-heading">
            Lagebild
          </h2>
          <ul className="space-y-2.5">
            {aussagen.slice(1).map((a) => (
              <li key={a.href}>
                <Link
                  to={a.href}
                  className="group flex items-start gap-3 text-sm"
                >
                  <AmpelPunkt ampel={a.ampel} className="mt-1.5" />
                  <span className="flex-1 group-hover:text-heading">
                    {a.text}
                  </span>
                  <ArrowRight
                    className="mt-0.5 size-4 shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Karte>
      ) : null}

      <div className="mb-6 grid gap-4 *:min-w-0 xl:grid-cols-2">
        <Karte className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-heading">
              <CalendarClock className="size-4 text-text-muted" aria-hidden />{" "}
              Fällig diese Woche
            </h2>
            <span className="text-xs tabular-nums text-text-muted">
              {euro(faellig.reduce((s, p) => s + p.betrag, 0))}
            </span>
          </div>
          {faellig.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Keine größeren Zahlungen in den nächsten 7 Tagen.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {faellig.slice(0, 8).map((p, i) => (
                <li
                  key={`${p.label}-${i}`}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      "w-16 shrink-0 tabular-nums",
                      p.ueberfaellig
                        ? "font-medium text-bad"
                        : "text-text-muted",
                    )}
                  >
                    {p.ueberfaellig ? "überfällig" : tagKurz(p.datum)}
                  </span>
                  <span className="w-10 shrink-0 text-xs text-text-subtle">
                    {kurzName(p.companyId)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {euro(p.betrag)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {faellig.length > 8 ? (
            <p className="mt-2 text-xs text-text-muted">
              und {faellig.length - 8} weitere
            </p>
          ) : null}
        </Karte>

        <Karte className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-heading">
              <ListChecks className="size-4 text-text-muted" aria-hidden /> Zu
              entscheiden
            </h2>
            <Link
              to="/board/pruefliste"
              className="text-xs font-medium text-brand-text hover:underline"
            >
              Alle {offen.length} ansehen
            </Link>
          </div>
          {zuEntscheiden.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Keine offenen Prüffälle.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {zuEntscheiden.map((f) => {
                const ziel = pruefFallZiel(f, daten);
                return (
                  <li key={f.id}>
                    <Link
                      to={ziel.to}
                      search={ziel.search as never}
                      className="flex items-start gap-3 py-2 text-sm hover:text-heading"
                    >
                      <AmpelPunkt ampel={f.severity} className="mt-1.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{f.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {f.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-text-subtle">
                        {QUELLE_LABEL[f.source]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Karte>
      </div>

      <div className="grid gap-4 *:min-w-0 xl:grid-cols-[1.4fr_1fr]">
        <Karte className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-heading">
              Liquidität nächste 13 Wochen
            </h2>
            <Link
              to="/board/liquiditaet"
              className="text-xs font-medium text-brand-text hover:underline"
            >
              Planung öffnen
            </Link>
          </div>
          <ZeitreihenDiagramm
            label="Liquidität 13 Wochen"
            daten={kurz.map((p) => ({ x: p.datum, saldo: p.wert }))}
            xSchluessel="x"
            xFormat={tagKurz}
            hoehe={220}
            kompakt
            referenz={{ wert: min, label: "Mindestliquidität" }}
            reihen={[
              {
                schluessel: "saldo",
                label: "Saldo",
                farbe: "var(--brand)",
                flaeche: true,
              },
            ]}
          />
        </Karte>
        <Karte className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-heading">
              Letzte Buchungen
            </h2>
            <span className="text-xs text-text-muted">Bankumsätze</span>
          </div>
          {ticker.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Noch keine Bankumsätze.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {ticker.slice(0, 7).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-xs">
                  <span className="ziffern w-12 shrink-0 text-text-muted">
                    {tagKurz(t.datum)}
                  </span>
                  <span className="w-9 shrink-0 font-medium text-heading">
                    {t.kuerzel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-muted">
                    {t.text}
                  </span>
                  <span
                    className={cn(
                      "ziffern shrink-0 font-medium",
                      t.betrag >= 0 ? "text-ok" : "text-heading",
                    )}
                  >
                    {euroMitVorzeichen(t.betrag)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Karte>
      </div>
    </>
  );
}

function SegmentKarte({
  titel,
  href,
  children,
}: {
  titel: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Karte className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-heading">{titel}</h2>
        <Link
          to={href}
          className="text-xs font-medium text-brand-text hover:underline"
        >
          Öffnen
        </Link>
      </div>
      {children}
    </Karte>
  );
}
