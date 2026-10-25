import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  dcfRechnen,
  euro,
  fach,
  flaeche,
  mietSummen,
  prozent,
  proM2,
  zahl,
  type DcfEingabe,
} from "@/lib/ki-tools/rechnen";
import type {
  Angabe,
  Beleg,
  DcfDaten,
  Erreichbarkeit,
  ExposeDaten,
  KaufpreisDaten,
  MarktpreisDaten,
  Mieteinheit,
  MieterlisteDaten,
  Objekt,
  ToolErgebnis,
  Vergleichsobjekt,
} from "@/lib/ki-tools/typen";
import { cn } from "@/lib/utils";

type Format = (wert: never) => string;
type Feld = [
  label: string,
  angabe: Angabe<unknown> | undefined,
  format?: Format,
];

const text = (w: string) => w;
const ganz = (w: number) => zahl(w);
const eur0 = (w: number) => euro(w, 0);

/** Herkunft einer Angabe: Seite mit Zitat, Web-Quelle, Vorgabe, Berechnung, Annahme oder fehlt. */
export function BelegBadge({
  beleg,
  geprueft,
  leer,
}: {
  beleg: Beleg | null;
  geprueft: boolean;
  leer?: boolean;
}) {
  if (leer || !beleg) {
    return (
      <Marke
        ton="fehlt"
        icon={<CircleHelp className="h-3 w-3" />}
        label="fehlt"
      />
    );
  }
  if (beleg.art === "annahme") {
    return (
      <Marke
        ton="annahme"
        icon={<AlertTriangle className="h-3 w-3" />}
        label="Annahme"
        titel={beleg.hinweis}
      />
    );
  }
  if (beleg.art === "web") {
    let host = beleg.url;
    try {
      host = new URL(beleg.url).hostname.replace(/^www\./, "");
    } catch {
      /* URL bleibt wie sie ist */
    }
    return (
      <a
        href={beleg.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex"
      >
        <Marke
          ton={geprueft ? "ok" : "annahme"}
          icon={<ExternalLink className="h-3 w-3" />}
          label={host}
          titel={beleg.titel ?? beleg.url}
        />
      </a>
    );
  }
  if (beleg.art === "dokument") {
    return (
      <Marke
        ton={geprueft ? "ok" : "annahme"}
        icon={<CheckCircle2 className="h-3 w-3" />}
        label={`${beleg.unterlage} · S. ${beleg.seite}`}
        titel={`„${beleg.zitat}“`}
      />
    );
  }
  return (
    <Marke
      ton="ok"
      icon={<CheckCircle2 className="h-3 w-3" />}
      label={beleg.art === "nutzer" ? "Vorgabe" : "berechnet"}
      titel={beleg.hinweis}
    />
  );
}

function Marke({
  ton,
  icon,
  label,
  titel,
}: {
  ton: "ok" | "annahme" | "fehlt";
  icon: ReactNode;
  label: string;
  titel?: string;
}) {
  const marke = (
    <span
      className={cn(
        "inline-flex max-w-[14rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        ton === "ok" &&
          "bg-ok-soft text-ok",
        ton === "annahme" &&
          "bg-warn-soft text-warn",
        ton === "fehlt" && "bg-muted text-text-muted",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
  if (!titel) return marke;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{marke}</TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap">
        {titel}
      </TooltipContent>
    </Tooltip>
  );
}

function Abschnitt({
  titel,
  children,
  rechts,
}: {
  titel: string;
  children: ReactNode;
  rechts?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <h3 className="text-sm font-semibold text-heading">{titel}</h3>
        {rechts}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Felder({ felder }: { felder: Feld[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {felder.map(([label, angabe, format]) => {
        const wert = angabe?.wert;
        const leer = wert == null || wert === "";
        return (
          <div
            key={label}
            className="flex items-start justify-between gap-3 border-b border-hairline/60 py-1.5 text-sm last:border-0"
          >
            <dt className="text-text-muted">{label}</dt>
            <dd className="flex flex-col items-end gap-1 text-right">
              <span
                className={cn(
                  "font-medium text-heading",
                  leer && "text-text-muted",
                )}
              >
                {leer ? "–" : format ? format(wert as never) : String(wert)}
              </span>
              <BelegBadge
                beleg={angabe?.beleg ?? null}
                geprueft={angabe?.geprueft ?? false}
                leer={leer}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const objektFelder = (o: Objekt): Feld[] => [
  ["Objektart", o.objektart],
  ["Straße", o.strasse],
  ["PLZ", o.plz],
  ["Ort", o.ort],
  ["Stadtteil", o.stadtteil],
];

function Mietertabelle({ einheiten }: { einheiten: Mieteinheit[] }) {
  if (!einheiten.length)
    return (
      <p className="text-sm text-text-muted">Keine Mieteinheiten gefunden.</p>
    );
  const s = mietSummen(einheiten);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Lage</th>
              <th className="py-1.5 pr-3 font-medium">Mieter</th>
              <th className="py-1.5 pr-3 font-medium">Nutzung</th>
              <th className="py-1.5 pr-3 text-right font-medium">Fläche</th>
              <th className="py-1.5 pr-3 text-right font-medium">
                Kaltmiete IST
              </th>
              <th className="py-1.5 pr-3 text-right font-medium">SOLL</th>
              <th className="py-1.5 font-medium">Beleg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline/60">
            {einheiten.map((e, i) => (
              <tr key={`${e.lage}-${i}`}>
                <td className="py-1.5 pr-3">{e.lage}</td>
                <td className="py-1.5 pr-3">
                  {e.belegung === "leer" ? (
                    <span className="text-text-muted">Leerstand</span>
                  ) : (
                    e.mieter || "–"
                  )}
                </td>
                <td className="py-1.5 pr-3">{e.nutzung}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {flaeche(e.flaeche) || "–"}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {euro(e.kaltmieteIst) || "–"}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {euro(e.kaltmieteSoll) || "–"}
                </td>
                <td className="py-1.5">
                  <BelegBadge beleg={e.beleg} geprueft={e.geprueft} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        {s.wohneinheiten} Wohn-, {s.gewerbeeinheiten} Gewerbeeinheiten,{" "}
        {s.stellplaetze} Stellplätze · {flaeche(s.flaecheGesamt)} · Miete IST{" "}
        {euro(s.mieteMonatIst)} mtl. ({euro(s.mieteMonatIst * 12, 0)} p. a.)
        {s.vermietungsstand != null &&
          ` · Vermietungsstand ${prozent(s.vermietungsstand)}`}
      </p>
    </div>
  );
}

function Liste({ eintraege }: { eintraege: ReactNode[] }) {
  if (!eintraege.length) return <p className="text-sm text-text-muted">–</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-heading">
      {eintraege.map((e, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-heading" />
          <span className="flex flex-wrap items-center gap-2">{e}</span>
        </li>
      ))}
    </ul>
  );
}

function MieterlisteAnsicht({ d }: { d: MieterlisteDaten }) {
  return (
    <>
      <Abschnitt titel="Objekt">
        <Felder
          felder={[
            ...objektFelder(d.objekt),
            ["Kaufpreis", d.kaufpreis, eur0 as Format],
          ]}
        />
      </Abschnitt>
      <Abschnitt titel="Mietaufstellung">
        <Mietertabelle einheiten={d.einheiten} />
      </Abschnitt>
    </>
  );
}

function KaufpreisAnsicht({ d }: { d: KaufpreisDaten }) {
  return (
    <>
      <Abschnitt titel="Objekt">
        <Felder felder={objektFelder(d.objekt)} />
      </Abschnitt>
      <Abschnitt titel="Eingaben Kaufpreistool">
        <Felder
          felder={[
            ["Fläche Wohnen", d.flaecheWohnen, flaeche as Format],
            ["Fläche Gewerbe", d.flaecheGewerbe, flaeche as Format],
            ["Miete mtl. IST", d.mieteMonatIst, euro as Format],
            ["Miete mtl. SOLL", d.mieteMonatSoll, euro as Format],
            ["Marktmiete Wohnen", d.marktmieteWohnen, proM2 as Format],
            ["Marktmiete Gewerbe", d.marktmieteGewerbe, proM2 as Format],
            ["Basis-Kaufpreis", d.basisKaufpreis, eur0 as Format],
            ["Schrittweite", d.schritt, eur0 as Format],
          ]}
        />
      </Abschnitt>
    </>
  );
}

function dcfEingabe(d: DcfDaten): DcfEingabe | null {
  const e = {
    kaufpreis: d.kaufpreis.wert,
    flaeche: d.flaeche.wert,
    einheiten: d.einheiten.wert,
    mieteJahrIst: d.mieteJahrIst.wert,
    mieteJahrMarkt: d.mieteJahrMarkt.wert ?? d.mieteJahrIst.wert,
    anpassungJahre: d.anpassungJahre.wert,
    mietsteigerung: d.mietsteigerung.wert,
    mietausfall: d.mietausfall.wert,
    verwaltungProEinheit: d.verwaltungProEinheit.wert,
    instandhaltungM2: d.instandhaltungM2.wert,
    nichtUmlagefaehig: d.nichtUmlagefaehig.wert,
    kostensteigerung: d.kostensteigerung.wert,
    diskontierung: d.diskontierung.wert,
    exitFaktor: d.exitFaktor.wert,
    grunderwerbsteuer: d.grunderwerbsteuer.wert,
    notarGrundbuch: d.notarGrundbuch.wert,
    makler: d.makler.wert,
  };
  return Object.values(e).every((v) => v != null && Number.isFinite(v))
    ? (e as DcfEingabe)
    : null;
}

function DcfAnsicht({ d }: { d: DcfDaten }) {
  const e = dcfEingabe(d);
  const r = e ? dcfRechnen(e) : null;
  const pz = (w: number) => prozent(w, 2);
  return (
    <>
      {r && (
        <Abschnitt titel="Ergebnis (10 Jahre)">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kennzahl label="Kapitalwert" wert={euro(r.kapitalwert, 0)} />
            <Kennzahl
              label="IRR"
              wert={r.irr == null ? "–" : prozent(r.irr, 2)}
            />
            <Kennzahl label="Max. Kaufpreis" wert={euro(r.maxKaufpreis, 0)} />
            <Kennzahl label="Faktor IST" wert={fach(r.faktorIst) || "–"} />
          </div>
        </Abschnitt>
      )}
      <Abschnitt titel="Objekt und Miete">
        <Felder
          felder={[
            ...objektFelder(d.objekt).slice(1, 4),
            ["Kaufpreis", d.kaufpreis, eur0 as Format],
            ["Fläche", d.flaeche, flaeche as Format],
            ["Einheiten", d.einheiten, ganz as Format],
            ["Jahresmiete IST", d.mieteJahrIst, eur0 as Format],
            ["Jahresmiete Markt", d.mieteJahrMarkt, eur0 as Format],
          ]}
        />
      </Abschnitt>
      <Abschnitt titel="Annahmen">
        <Felder
          felder={[
            ["Mietsteigerung p. a.", d.mietsteigerung, pz as Format],
            ["Anpassung an Markt (Jahre)", d.anpassungJahre, ganz as Format],
            ["Mietausfall", d.mietausfall, pz as Format],
            ["Verwaltung je Einheit", d.verwaltungProEinheit, eur0 as Format],
            ["Instandhaltung je m²", d.instandhaltungM2, proM2 as Format],
            ["Nicht umlagefähige Kosten", d.nichtUmlagefaehig, pz as Format],
            ["Kostensteigerung p. a.", d.kostensteigerung, pz as Format],
            ["Diskontierungszins", d.diskontierung, pz as Format],
            ["Exit-Faktor", d.exitFaktor, fach as Format],
            ["Grunderwerbsteuer", d.grunderwerbsteuer, pz as Format],
            ["Notar und Grundbuch", d.notarGrundbuch, pz as Format],
            ["Makler", d.makler, pz as Format],
          ]}
        />
      </Abschnitt>
    </>
  );
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-base font-semibold tabular-nums text-heading">
        {wert}
      </div>
    </div>
  );
}

function ExposeAnsicht({ d }: { d: ExposeDaten }) {
  return (
    <>
      <Abschnitt titel="Investment">
        <Felder
          felder={[
            ...objektFelder(d.objekt),
            ["Titel", d.titelzeile, text as Format],
            ["Kaufpreis", d.kaufpreis, eur0 as Format],
            ["Jahresmiete IST", d.mieteJahrIst, eur0 as Format],
            ["Jahresmiete SOLL", d.mieteJahrSoll, eur0 as Format],
            ["Vermietungsstand", d.vermietungsstand, prozent as Format],
            ["Grundstück", d.grundstueck, flaeche as Format],
            ["Bodenrichtwert", d.bodenrichtwert],
            ["Gesamtfläche", d.flaecheGesamt, flaeche as Format],
            ["Wohneinheiten", d.wohneinheiten, ganz as Format],
            ["Wohnfläche", d.flaecheWohnen, flaeche as Format],
            ["Gewerbeeinheiten", d.gewerbeeinheiten, ganz as Format],
            ["Gewerbefläche", d.flaecheGewerbe, flaeche as Format],
            ["Stellplätze", d.stellplaetze, ganz as Format],
          ]}
        />
        <p className="mt-3 text-xs text-text-muted">
          Provision:{" "}
          {d.provision === "provisionsfrei"
            ? "provisionsfrei für den Käufer"
            : "Käuferprovision"}
        </p>
      </Abschnitt>
      <Abschnitt titel="Gebäude und Energie">
        <Felder
          felder={[
            ["Baujahr", d.baujahr],
            ["Geschosse", d.geschosse],
            ["Bauweise", d.bauweise],
            ["Geschossdecken", d.geschossdecken],
            ["Fenster", d.fenster],
            ["Heizsystem", d.heizsystem],
            ["Energieträger", d.energietraeger],
            ["Baujahr Heizung", d.baujahrHeizung],
            ["Balkone", d.balkone],
            ["Aufzug", d.aufzug],
            ["Dachgeschoss", d.dachgeschoss],
            ["Denkmalschutz", d.denkmalschutz],
            ["Energieausweis", d.ausweistyp],
            ["Energiekennwert", d.energiekennwert],
            ["Effizienzklasse", d.effizienzklasse],
          ]}
        />
      </Abschnitt>
      <Abschnitt titel="Besonderheiten">
        <Liste
          eintraege={d.besonderheiten.map((b) => (
            <>
              {b.wert}
              <BelegBadge beleg={b.beleg} geprueft={b.geprueft} />
            </>
          ))}
        />
      </Abschnitt>
      <Abschnitt titel="Mieterübersicht">
        <Mietertabelle einheiten={d.mieter} />
      </Abschnitt>
      <Abschnitt titel="Lage">
        <div className="flex flex-col gap-3">
          <Liste
            eintraege={d.erreichbarkeit.map((e: Erreichbarkeit) => (
              <>
                {e.ziel}: {e.minuten != null ? `${e.minuten} Min.` : "–"}{" "}
                {e.verkehrsmittel}
                <BelegBadge beleg={e.beleg} geprueft={e.geprueft} />
              </>
            ))}
          />
          {d.mikrolage.wert && (
            <div className="flex flex-col gap-1 text-sm text-heading">
              <p className="whitespace-pre-wrap">{d.mikrolage.wert}</p>
              <BelegBadge
                beleg={d.mikrolage.beleg}
                geprueft={d.mikrolage.geprueft}
              />
            </div>
          )}
        </div>
      </Abschnitt>
    </>
  );
}

function Vergleichstabelle({ vergleiche }: { vergleiche: Vergleichsobjekt[] }) {
  if (!vergleiche.length)
    return (
      <p className="text-sm text-text-muted">Noch keine Vergleichsobjekte.</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Objekt</th>
            <th className="py-1.5 pr-3 text-right font-medium">Fläche</th>
            <th className="py-1.5 pr-3 text-right font-medium">Jahresmiete</th>
            <th className="py-1.5 pr-3 text-right font-medium">Preis</th>
            <th className="py-1.5 pr-3 text-right font-medium">Faktor</th>
            <th className="py-1.5 font-medium">Quelle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/60">
          {vergleiche.map((v, i) => (
            <tr key={`${v.adresse}-${i}`}>
              <td className="py-1.5 pr-3">
                <div className="text-heading">{v.adresse}</div>
                <div className="text-xs text-text-muted">
                  {[
                    v.objektart,
                    v.preisart === "kauf" ? "Kaufpreis" : "Angebotspreis",
                    ...v.einordnung,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {flaeche(v.flaeche) || "–"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {euro(v.mieteJahr, 0) || "–"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {euro(v.preis, 0) || "–"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {v.preis && v.mieteJahr ? fach(v.preis / v.mieteJahr) : "–"}
              </td>
              <td className="py-1.5">
                <BelegBadge beleg={v.beleg} geprueft={v.geprueft} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarktpreisAnsicht({ d }: { d: MarktpreisDaten }) {
  const spanne = (
    s: { min: number; mittel: number; max: number } | null,
    f: (n: number) => string,
  ) => (s ? `${f(s.min)} bis ${f(s.max)} (Ø ${f(s.mittel)})` : "–");
  return (
    <>
      {d.objekte.map((o, i) => (
        <Abschnitt
          key={`${o.bezeichnung}-${i}`}
          titel={o.bezeichnung || `Liegenschaft ${i + 1}`}
        >
          <Felder
            felder={[
              ["Kaufpreis-Einschätzung", o.preisGrenz, eur0 as Format],
              [
                "Preisvorstellung Eigentümer",
                o.preisEigentuemer,
                eur0 as Format,
              ],
              ["Grundstück", o.grundstueck, flaeche as Format],
              ["Wohneinheiten", o.wohneinheiten, ganz as Format],
              ["Gewerbeeinheiten", o.gewerbeeinheiten],
              ["Wohnfläche", o.flaecheWohnen, flaeche as Format],
              ["Gewerbefläche", o.flaecheGewerbe, flaeche as Format],
              ["Jahresmiete IST", o.mieteJahrIst, eur0 as Format],
              ["Jahresmiete SOLL", o.mieteJahrSoll, eur0 as Format],
              ["Ø Miete Wohnen", o.mieteM2Wohnen, proM2 as Format],
              ["Ø Miete Gewerbe", o.mieteM2Gewerbe, proM2 as Format],
            ]}
          />
          {o.besonderheiten.length > 0 && (
            <div className="mt-3">
              <Liste eintraege={o.besonderheiten} />
            </div>
          )}
        </Abschnitt>
      ))}
      <Abschnitt
        titel="Vergleichsobjekte"
        rechts={
          d.intern && (
            <span className="text-xs text-text-muted">
              Grenz-Daten: {d.intern.anzahl} Vergleiche, Faktor{" "}
              {spanne(d.intern.faktor, (n) => zahl(n, 1))}
            </span>
          )
        }
      >
        <Vergleichstabelle vergleiche={d.vergleiche} />
        {d.intern?.preisM2 && (
          <p className="mt-2 text-xs text-text-muted">
            Preis je m² laut Grenz-Daten:{" "}
            {spanne(d.intern.preisM2, (n) => euro(n, 0))}
          </p>
        )}
      </Abschnitt>
      <Abschnitt titel="Zusammenfassung und Vorgehen">
        <div className="grid gap-4 md:grid-cols-2">
          <Liste eintraege={d.zusammenfassung} />
          <Liste eintraege={d.vorgehen} />
        </div>
      </Abschnitt>
    </>
  );
}

export function KiErgebnis({ ergebnis }: { ergebnis: ToolErgebnis }) {
  const { tool, daten } = ergebnis;
  return (
    <div className="flex flex-col gap-4">
      {(ergebnis.hinweise.length > 0 || ergebnis.verworfen > 0) && (
        <div className="rounded-xl border border-warn bg-warn-soft p-4 text-sm text-warn">
          <div className="mb-1.5 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Bitte prüfen
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {ergebnis.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
            {ergebnis.verworfen > 0 && (
              <li>
                {ergebnis.verworfen}{" "}
                {ergebnis.verworfen === 1 ? "Angabe wurde" : "Angaben wurden"}{" "}
                verworfen, weil der Beleg nicht in den Unterlagen stand.
              </li>
            )}
          </ul>
        </div>
      )}
      {tool === "mieterliste" && (
        <MieterlisteAnsicht d={daten as MieterlisteDaten} />
      )}
      {tool === "kaufpreis" && <KaufpreisAnsicht d={daten as KaufpreisDaten} />}
      {tool === "dcf" && <DcfAnsicht d={daten as DcfDaten} />}
      {tool === "expose" && <ExposeAnsicht d={daten as ExposeDaten} />}
      {tool === "marktpreis" && (
        <MarktpreisAnsicht d={daten as MarktpreisDaten} />
      )}
    </div>
  );
}
