/**
 * Kennzahlen des Maklergeschäfts aus den importierten Datenständen
 * (Salesforce-Auszug, Jahresabschluss, BWA). Reine Funktionen.
 */

import type { MaklerDto } from "./types";

type Zeile = Record<string, unknown>;

export type Datenstand = {
  schluessel: string;
  stand: string;
  quelle: string | null;
  daten: Zeile[];
};

const PHASEN = [
  "Akquisition",
  "Einwertung",
  "Beauftragung",
  "Gewonnen",
  "Verloren",
  "Interne Übergabe",
  "ohne Phase",
];

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function zahl(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = text(v);
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function istTest(z: Zeile): boolean {
  return z.ist_test === true || z.ist_test === "True";
}

function quartal(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)} Q${Math.ceil(m / 3)}`;
}

function zaehle(
  werte: Array<string | null>,
): Array<{ name: string; anzahl: number }> {
  const m = new Map<string, number>();
  for (const w of werte) {
    const k = w ?? "ohne Angabe";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, anzahl]) => ({ name, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/** „Köln-Porz“, „Köln (vermutlich)“ → „Köln“. */
function ort(v: unknown): string | null {
  const t = text(v);
  return t ? t.split(/\s*[-(]/)[0].trim() || null : null;
}

export function berechneMakler(
  staende: Datenstand[],
  heute: string,
): MaklerDto {
  // Jüngster Stand je Schlüssel gewinnt; ältere bleiben in der DB erhalten.
  const neueste = new Map<string, Datenstand>();
  for (const s of staende) {
    const bisher = neueste.get(s.schluessel);
    if (!bisher || s.stand > bisher.stand) neueste.set(s.schluessel, s);
  }
  const blatt = (k: string): Zeile[] => neueste.get(k)?.daten ?? [];

  const mandate = blatt("mandate").filter((m) => !istTest(m));
  const mitPhase: Array<Zeile & { phase: string }> = mandate.map((m) => ({
    ...m,
    phase: text(m.phase) ?? "ohne Phase",
  }));

  const phasen = PHASEN.map((phase) => {
    const liste = mitPhase.filter((m) => m.phase === phase);
    return {
      phase,
      anzahl: liste.length,
      provision: liste.reduce(
        (s, m) => s + (zahl(m.prognose_provision_eur) ?? 0),
        0,
      ),
    };
  });

  const beauftragt = mitPhase.filter((m) => m.phase === "Beauftragung");
  const gewonnen = phasen.find((p) => p.phase === "Gewonnen")?.anzahl ?? 0;
  const verloren = phasen.find((p) => p.phase === "Verloren")?.anzahl ?? 0;

  const quartale = new Map<string, number>();
  for (const m of mandate) {
    const d = text(m.erstellt);
    if (!d) continue;
    quartale.set(quartal(d), (quartale.get(quartal(d)) ?? 0) + 1);
  }

  const deals = blatt("deals").filter((d) => !istTest(d));
  const jeJahr = new Map<
    string,
    { kaufpreis: number; gewonnen: number; verloren: number }
  >();
  for (const d of deals) {
    const datum = text(d.close_date);
    if (!datum || datum > heute) continue;
    if (d.phase !== "Invoice Paid" && d.phase !== "Closed Lost") continue;
    const j = jeJahr.get(datum.slice(0, 4)) ?? {
      kaufpreis: 0,
      gewonnen: 0,
      verloren: 0,
    };
    if (d.phase === "Invoice Paid") {
      j.gewonnen++;
      j.kaufpreis += zahl(d.kaufpreis_eur) ?? 0;
    } else if (d.phase === "Closed Lost") {
      j.verloren++;
    }
    jeJahr.set(datum.slice(0, 4), j);
  }
  const verkauft = deals.filter((d) => d.phase === "Invoice Paid");

  const kampagnen = blatt("kampagnen")
    .filter((k) => /^vermarktung/i.test(String(k.name ?? "")))
    .filter((k) => !/test/i.test(String(k.name ?? "")))
    .map((k) => ({
      name: String(k.name).replace(/^Vermarktung(skampagne)?\s*/i, ""),
      status: text(k.status) ?? "–",
      start: text(k.startdatum),
      kontakte: zahl(k.kontakte) ?? 0,
      gesendet: zahl(k.Gesendet) ?? 0,
      interesse: zahl(k.Interesse) ?? 0,
      besichtigung:
        (zahl(k.Besichtigung) ?? 0) + (zahl(k["Besichtigung erfolgt"]) ?? 0),
      angebot: zahl(k.Kaufangebot) ?? 0,
      absage: zahl(k.Absage) ?? 0,
    }))
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));

  const summe = (f: (k: (typeof kampagnen)[number]) => number) =>
    kampagnen.reduce((s, k) => s + f(k), 0);
  // Jede Stufe zählt alle, die mindestens so weit gekommen sind.
  const angebot = summe((k) => k.angebot);
  const besichtigung = summe((k) => k.besichtigung) + angebot;
  const interesse = summe((k) => k.interesse) + besichtigung;
  const rueckmeldung = interesse + summe((k) => k.absage);
  const angesprochen = summe((k) => k.gesendet) + rueckmeldung;

  const aktivitaet = blatt("aktivitaeten_monat").map((a) => ({
    monat: String(a.monat),
    Akquisebrief: zahl(a.Akquisebrief) ?? 0,
    Anruf: zahl(a.Anruf) ?? 0,
    "E-Mail": zahl(a["E-Mail"]) ?? 0,
    Aufgabe: zahl(a.Aufgabe) ?? 0,
  }));
  const jahrJetzt = heute.slice(0, 4);
  const vorjahr = String(Number(jahrJetzt) - 1);
  const aktivitaetSummen = (
    ["Akquisebrief", "Anruf", "E-Mail", "Aufgabe"] as const
  ).map((typ) => ({
    typ,
    vorjahr: aktivitaet
      .filter((a) => a.monat.startsWith(vorjahr))
      .reduce((s, a) => s + a[typ], 0),
    jahr: aktivitaet
      .filter((a) => a.monat.startsWith(jahrJetzt))
      .reduce((s, a) => s + a[typ], 0),
  }));

  const finanzen = blatt("kennzahlen")
    .filter((k) => k.bereich === "Finanzen")
    .map((k) => ({
      kennzahl: String(k.kennzahl),
      wert: zahl(k.wert) ?? 0,
      einheit: String(k.einheit ?? ""),
      quelle: String(k.quelle ?? ""),
      hinweis: text(k.hinweis),
    }));
  const fin = (name: string) =>
    finanzen.find((f) => f.kennzahl === name)?.wert ?? null;
  const umsatzVergleich = [
    {
      zeitraum: "2025 (Jahresabschluss)",
      umsatz: fin("Umsatzerlöse 2025") ?? 0,
      kosten:
        (fin("Personalaufwand 2025") ?? 0) +
        (fin("Sonstige betriebliche Aufwendungen 2025") ?? 0),
      ergebnis: fin("Jahresüberschuss 2025"),
    },
    {
      zeitraum: "Jan–Sep 2026 (BWA)",
      umsatz: fin("Umsatz Jan-Sep 2026") ?? 0,
      kosten: fin("Gesamtkosten Jan-Sep 2026"),
      ergebnis: fin("Vorläufiges Ergebnis Jan-Sep 2026"),
    },
  ].filter((u) => u.umsatz > 0);

  const objekte = blatt("objekte");
  const pipelinePreise = beauftragt.reduce(
    (s, m) => s + (zahl(m.expose_preis_eur) ?? 0),
    0,
  );

  return {
    stand:
      [...neueste.values()]
        .map((s) => s.stand)
        .sort()
        .at(-1) ?? null,
    quellen: [
      ...new Set(
        [...neueste.values()].flatMap((s) =>
          s.quelle ? [s.quelle.split(" · ")[0]] : [],
        ),
      ),
    ],
    kacheln: {
      pipelineProvision: beauftragt.reduce(
        (s, m) => s + (zahl(m.prognose_provision_eur) ?? 0),
        0,
      ),
      pipelinePreise,
      beauftragt: beauftragt.length,
      beauftragtOhnePreis: beauftragt.filter((m) => !zahl(m.expose_preis_eur))
        .length,
      gewinnquote:
        gewonnen + verloren > 0
          ? Math.round((gewonnen / (gewonnen + verloren)) * 100)
          : null,
      vermittelterKaufpreis: verkauft.reduce(
        (s, d) => s + (zahl(d.kaufpreis_eur) ?? 0),
        0,
      ),
      verkaeufe: verkauft.length,
      offeneDeals: deals.filter(
        (d) =>
          !["Invoice Paid", "Closed Lost", "Closed Won"].includes(
            String(d.phase),
          ),
      ).length,
    },
    phasen: phasen.filter((p) => p.anzahl > 0),
    mandateJeQuartal: [...quartale.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([q, anzahl]) => ({ quartal: q, anzahl })),
    pipeline: beauftragt
      .map((m) => ({
        mandat: String(m.mandat ?? ""),
        objekt: text(m.objekt) ?? "–",
        preis: zahl(m.expose_preis_eur) || null,
        provisionProzent: zahl(m.provision_prozent),
        provision: zahl(m.prognose_provision_eur) || null,
        art: text(m.beauftragungsart),
        betreuer: text(m.account_owner),
      }))
      .sort((a, b) => (b.provision ?? 0) - (a.provision ?? 0)),
    dealsJeJahr: [...jeJahr.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jahr, j]) => ({ jahr, ...j })),
    deals: deals
      .map((d) => ({
        name: String(d.name ?? "").replace(/^Opp\.\s*/, ""),
        phase: String(d.phase ?? ""),
        kaufpreis: zahl(d.kaufpreis_eur),
        datum: text(d.close_date),
      }))
      .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? "")),
    funnel: [
      { stufe: "Angesprochen", anzahl: angesprochen },
      { stufe: "Rückmeldung", anzahl: rueckmeldung },
      { stufe: "Interesse", anzahl: interesse },
      { stufe: "Besichtigung", anzahl: besichtigung },
      { stufe: "Kaufangebot", anzahl: angebot },
    ],
    kampagnen,
    aktivitaet,
    aktivitaetSummen,
    finanzen,
    umsatzVergleich,
    objekte: {
      gesamt: objekte.length,
      jeStatus: zaehle(
        objekte.map((o) => text(o.status)?.split(" (")[0] ?? null),
      ),
      jeSalesforce: zaehle(objekte.map((o) => text(o.sf_status))),
      jeOrt: zaehle(objekte.map((o) => ort(o.ort))).slice(0, 8),
    },
    gesellschaft: blatt("gesellschaft").map((g) => ({
      feld: String(g.feld),
      wert: String(g.wert ?? ""),
    })),
    finanzunterlagen: blatt("finanzunterlagen").map((f) => ({
      unterlage: String(f.unterlage),
      jahr: String(f.jahr ?? ""),
      status: String(f.status ?? ""),
      hinweis: text(f.hinweis),
    })),
  };
}
