/**
 * Salesforce-Teil der Makler-Kennzahlen (Kennzahlen › Wachstum) live aus den sf_*-Caches.
 * Ersetzt den statischen Salesforce-Auszug; Jahresabschluss, BWA, Objektordner und
 * Gesellschaftsdaten kommen weiter aus den importierten Datenständen. Reine Funktionen.
 */

import { hatSchriftlichenMaklervertrag } from "@/lib/mandate/maklervertrag";
import { zaehltAlsAktivitaet } from "@/lib/sf-sync/zaehlen";

import type { MaklerDto } from "./types";

export type LiveMandat = {
  sfId: string;
  name: string;
  status: string | null;
  art: string | null;
  feeModel: string | null;
  angebotspreis: number | null;
  provisionProzent: number | null;
  provisionPrognose: number | null;
  erstelltAm: string | null;
  objekt: string | null;
  betreuer: string | null;
};

export type LiveDeal = {
  name: string;
  phase: string | null;
  geschlossen: boolean;
  gewonnen: boolean;
  abschlussAm: string | null;
  kaufpreis: number | null;
  betrag: number | null;
  provision: number | null;
};

export type LiveKampagne = {
  sfId: string;
  name: string;
  status: string | null;
  startAm: string | null;
};

export type LiveMitglied = { kampagneSfId: string; status: string | null };

export type LiveAktivitaet = {
  datum: string;
  sfTyp: string | null;
  art: string | null;
  betreff: string | null;
  status: string | null;
};

export type LiveEingabe = {
  heute: string;
  mandate: LiveMandat[];
  deals: LiveDeal[];
  kampagnen: LiveKampagne[];
  mitglieder: LiveMitglied[];
  aktivitaeten: LiveAktivitaet[];
};

export type MaklerLive = Pick<
  MaklerDto,
  | "kacheln"
  | "phasen"
  | "mandateJeQuartal"
  | "pipeline"
  | "dealsJeJahr"
  | "deals"
  | "funnel"
  | "kampagnen"
  | "aktivitaet"
  | "aktivitaetSummen"
>;

const PHASEN = [
  "Akquisition",
  "Einwertung",
  "Beauftragung",
  "Gewonnen",
  "Verloren",
  "Interne Übergabe",
  "ohne Phase",
];

const BEZAHLT = "Invoice Paid";
const VERLOREN = "Closed Lost";

/** Testdatensätze („Test SG …“, „Teststraße“) zählen nicht. */
export function istTestName(name: string): boolean {
  return /^test/i.test(name.trim()) || /\bteststra(ß|ss)e\b/i.test(name);
}

function quartal(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)} Q${Math.ceil(m / 3)}`;
}

function positiv(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** Erwartete Provision (netto): Preis × Satz, sonst die Prognose aus Salesforce. */
export function mandatsProvision(m: LiveMandat): number | null {
  if (m.feeModel === "Provisionsfrei") return 0;
  const preis = positiv(m.angebotspreis);
  if (preis && m.provisionProzent) return (preis * m.provisionProzent) / 100;
  return positiv(m.provisionPrognose);
}

/** Monate „YYYY-MM“ der letzten `anzahl` Monate bis einschließlich heute. */
function monate(heute: string, anzahl: number): string[] {
  const j = Number(heute.slice(0, 4));
  const mo = Number(heute.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = anzahl - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(j, mo - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Aktivitätsart für das Monatsdiagramm; Briefe stecken im Betreff („Send Letter“). */
function aktivitaetsTyp(
  a: LiveAktivitaet,
): "Akquisebrief" | "Anruf" | "E-Mail" | "Aufgabe" {
  const b = (a.betreff ?? "").toLowerCase().trim();
  if (/^send letter|^akquisebrief|anschreiben (versandt|verschickt)/.test(b))
    return "Akquisebrief";
  if (a.art === "Anruf" || /^(call|anruf|telefonat)\b/.test(b)) return "Anruf";
  if (a.art === "E-Mail" || a.art === "Serien-E-Mail") return "E-Mail";
  return "Aufgabe";
}

export function berechneMaklerLive(e: LiveEingabe): MaklerLive {
  const mandate = e.mandate.filter(
    (m) => !istTestName(m.name) && !istTestName(m.objekt ?? ""),
  );
  const deals = e.deals.filter((d) => !istTestName(d.name));

  const phasen = PHASEN.map((phase) => {
    const liste = mandate.filter((m) => (m.status ?? "ohne Phase") === phase);
    return {
      phase,
      anzahl: liste.length,
      provision: liste.reduce((s, m) => s + (mandatsProvision(m) ?? 0), 0),
    };
  });
  const anzahl = (p: string) => phasen.find((x) => x.phase === p)?.anzahl ?? 0;

  const beauftragt = mandate.filter((m) => m.status === "Beauftragung");
  const mitVertrag = beauftragt.filter((m) =>
    hatSchriftlichenMaklervertrag(m.art),
  );
  const summeProvision = (ms: LiveMandat[]) =>
    ms.reduce((s, m) => s + (mandatsProvision(m) ?? 0), 0);

  const quartale = new Map<string, number>();
  for (const m of mandate) {
    if (!m.erstelltAm) continue;
    const q = quartal(m.erstelltAm);
    quartale.set(q, (quartale.get(q) ?? 0) + 1);
  }

  const jeJahr = new Map<
    string,
    { kaufpreis: number; gewonnen: number; verloren: number }
  >();
  for (const d of deals) {
    const datum = d.abschlussAm;
    if (!datum || datum > e.heute) continue;
    if (d.phase !== BEZAHLT && d.phase !== VERLOREN) continue;
    const j = jeJahr.get(datum.slice(0, 4)) ?? {
      kaufpreis: 0,
      gewonnen: 0,
      verloren: 0,
    };
    if (d.phase === BEZAHLT) {
      j.gewonnen++;
      j.kaufpreis += d.kaufpreis ?? d.betrag ?? 0;
    } else j.verloren++;
    jeJahr.set(datum.slice(0, 4), j);
  }
  const verkauft = deals.filter((d) => d.phase === BEZAHLT);

  // Kampagnen: nur Vermarktungskampagnen, Mitglieder je Status.
  const jeKampagne = new Map<string, Map<string, number>>();
  for (const m of e.mitglieder) {
    const z = jeKampagne.get(m.kampagneSfId) ?? new Map<string, number>();
    const st = m.status ?? "ohne Status";
    z.set(st, (z.get(st) ?? 0) + 1);
    jeKampagne.set(m.kampagneSfId, z);
  }
  const kampagnen = e.kampagnen
    .filter((k) => /^vermarktung/i.test(k.name) && !/test/i.test(k.name))
    .map((k) => {
      const z = jeKampagne.get(k.sfId) ?? new Map<string, number>();
      const n = (...st: string[]) =>
        st.reduce((s, x) => s + (z.get(x) ?? 0), 0);
      return {
        name: k.name.replace(/^Vermarktung(skampagne)?\s*/i, ""),
        status: k.status ?? "–",
        start: k.startAm,
        kontakte: [...z.values()].reduce((s, x) => s + x, 0),
        gesendet: n("Gesendet", "Geantwortet"),
        interesse: n("Interesse"),
        besichtigung: n("Besichtigung", "Besichtigung erfolgt"),
        angebot: n("Kaufangebot", "Angebot gesendet"),
        absage: n("Absage"),
      };
    })
    .filter((k) => k.kontakte > 0)
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));

  const summe = (f: (k: (typeof kampagnen)[number]) => number) =>
    kampagnen.reduce((s, k) => s + f(k), 0);
  const angebot = summe((k) => k.angebot);
  const besichtigung = summe((k) => k.besichtigung) + angebot;
  const interesse = summe((k) => k.interesse) + besichtigung;
  const rueckmeldung = interesse + summe((k) => k.absage);
  const angesprochen = summe((k) => k.gesendet) + rueckmeldung;

  // Aktivität: erledigte Aufgaben, Termine und E-Mails (ohne Doppelzählung, siehe sf-sync/zaehlen.ts).
  const jahr = e.heute.slice(0, 4);
  const vorjahr = String(Number(jahr) - 1);
  const reihe = monate(e.heute, 24);
  const zeilen = new Map(
    reihe.map((m) => [
      m,
      { monat: m, Akquisebrief: 0, Anruf: 0, "E-Mail": 0, Aufgabe: 0 },
    ]),
  );
  const summen = {
    Akquisebrief: { jahr: 0, vorjahr: 0 },
    Anruf: { jahr: 0, vorjahr: 0 },
    "E-Mail": { jahr: 0, vorjahr: 0 },
    Aufgabe: { jahr: 0, vorjahr: 0 },
  };
  for (const a of e.aktivitaeten) {
    if (!zaehltAlsAktivitaet(a)) continue;
    const tag = a.datum.slice(0, 10);
    if (tag > e.heute) continue;
    const typ = aktivitaetsTyp(a);
    const z = zeilen.get(tag.slice(0, 7));
    if (z) z[typ] += 1;
    if (tag.startsWith(jahr)) summen[typ].jahr += 1;
    else if (tag.startsWith(vorjahr)) summen[typ].vorjahr += 1;
  }

  return {
    kacheln: {
      pipelineProvision: summeProvision(mitVertrag),
      pipelineProvisionAlle: summeProvision(beauftragt),
      pipelinePreise: beauftragt.reduce(
        (s, m) => s + (positiv(m.angebotspreis) ?? 0),
        0,
      ),
      beauftragt: beauftragt.length,
      beauftragtMitVertrag: mitVertrag.length,
      beauftragtOhnePreis: beauftragt.filter((m) => !positiv(m.angebotspreis))
        .length,
      gewinnquote:
        anzahl("Gewonnen") + anzahl("Verloren") > 0
          ? Math.round(
              (anzahl("Gewonnen") / (anzahl("Gewonnen") + anzahl("Verloren"))) *
                100,
            )
          : null,
      vermittelterKaufpreis: verkauft.reduce(
        (s, d) => s + (d.kaufpreis ?? d.betrag ?? 0),
        0,
      ),
      verkaeufe: verkauft.length,
      offeneDeals: deals.filter((d) => !d.geschlossen).length,
    },
    phasen: phasen.filter((p) => p.anzahl > 0),
    mandateJeQuartal: [...quartale.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([q, n]) => ({ quartal: q, anzahl: n })),
    pipeline: beauftragt
      .map((m) => ({
        mandat: m.name,
        objekt: m.objekt ?? "–",
        preis: positiv(m.angebotspreis),
        provisionProzent: m.provisionProzent,
        provision: positiv(mandatsProvision(m)),
        art: m.art,
        betreuer: m.betreuer,
      }))
      .sort(
        (a, b) =>
          Number(hatSchriftlichenMaklervertrag(b.art)) -
            Number(hatSchriftlichenMaklervertrag(a.art)) ||
          (b.provision ?? 0) - (a.provision ?? 0),
      ),
    dealsJeJahr: [...jeJahr.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([j, x]) => ({ jahr: j, ...x })),
    deals: deals
      .map((d) => ({
        name: d.name.replace(/^Opp\.\s*/, ""),
        phase: d.phase ?? "",
        kaufpreis: d.kaufpreis ?? d.betrag,
        datum: d.abschlussAm,
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
    aktivitaet: [...zeilen.values()],
    aktivitaetSummen: (
      ["Akquisebrief", "Anruf", "E-Mail", "Aufgabe"] as const
    ).map((typ) => ({ typ, ...summen[typ] })),
  };
}
