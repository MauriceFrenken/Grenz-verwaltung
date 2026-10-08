import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ListChecks,
} from "lucide-react";
import { ZeitreihenDiagramm } from "@/components/board/Diagramm";
import { KpiKarte } from "@/components/board/KpiKarte";
import { Karte } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt } from "@/components/board/Status";
import type { Ampel } from "@/components/board/ampel";
import {
  datum,
  datumLang,
  euro,
  euroKompakt,
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
  const min = daten.companies
    .filter((c) => ids.includes(c.id))
    .reduce((s, c) => s + c.minLiquidity, 0);
  const reihe = kreisReihe(l.verlauf, ids);
  const kurz = reihe.slice(0, HORIZONT_TAGE + 1);
  const heute = kurz[0].wert;
  const in13 = kurz.at(-1)!.wert;
  const tief13 = tiefpunkt(kurz);
  const liqAmpel = (x: number): Ampel =>
    x < min ? "rot" : x < 1.5 * min ? "gelb" : "gruen";

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

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-heading">
          {gruss()}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {datumLang(stichtag)} ·{" "}
          {filter.alle
            ? "Gruppe (frei verfügbar, ohne Maklerbereich)"
            : daten.companies.find((c) => c.id === filter.gesellschaft)?.name}
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiKarte
          label="Liquidität heute"
          wert={euroKompakt(heute)}
          hinweis={`Mindestens ${euroKompakt(min)}`}
          ampel={liqAmpel(heute)}
          href="/board/liquiditaet"
        />
        <KpiKarte
          label="In 13 Wochen"
          wert={euroKompakt(in13)}
          hinweis={`Tiefpunkt ${euroKompakt(tief13.saldo)} am ${datum(tief13.datum)}`}
          ampel={liqAmpel(tief13.saldo)}
          href="/board/liquiditaet"
        />
        <KpiKarte
          label="Offene Prüffälle"
          wert={String(offen.length)}
          hinweis={`${rot.length} rot`}
          ampel={rot.length ? "rot" : offen.length > 10 ? "gelb" : "gruen"}
          href="/board/pruefliste"
        />
        <KpiKarte
          label="Aktive Darlehen"
          wert={String(aktiveDarlehen.length)}
          hinweis={`Bank ${euroKompakt(bankRest)} Restschuld`}
          ampel={fristRot ? "rot" : fristen.length ? "gelb" : "gruen"}
          href="/board/darlehen"
        />
        <KpiKarte
          label="Soll-Miete / Monat"
          wert={euroKompakt(sollMiete)}
          hinweis={`${bestand.length} Bestandsobjekte`}
          href="/board/immobilien"
        />
        <KpiKarte
          label="Leerstand"
          wert={prozent(leerQuote, 1)}
          hinweis={`${bestand.reduce((s, o) => s + o.leer.length, 0)} Einheiten`}
          ampel={leerstandAmpel(leerQuote)}
          href="/board/immobilien"
        />
      </div>

      {aussagen.length ? (
        <Karte className="mb-8 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-heading">
            Lagebild
          </h2>
          <ul className="space-y-2.5">
            {aussagen.map((a) => (
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

      <div className="mb-8 grid gap-4 *:min-w-0 xl:grid-cols-2">
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
              className="text-xs text-primary hover:underline"
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

      <Karte className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-heading">
            Liquidität nächste 13 Wochen
          </h2>
          <Link
            to="/board/liquiditaet"
            className="text-xs text-primary hover:underline"
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
              farbe: "var(--primary)",
              flaeche: true,
            },
          ]}
        />
      </Karte>
    </>
  );
}
