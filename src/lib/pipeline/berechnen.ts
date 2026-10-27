/**
 * Deal-Pipeline mit Provisionsprognose. Reine Funktionen über den sf_*-Caches:
 * je Objekt eine Karte (Mandat plus fortgeschrittenster Interessenten-Deal),
 * Stufe vom Erstkontakt bis zum Notartermin, gewichtete Provision je erwartetem Notarmonat.
 */

export type StufeId =
  | "erstkontakt"
  | "einwertung"
  | "beauftragt"
  | "interessent"
  | "besichtigung"
  | "verhandlung"
  | "notar";

export type Stufe = {
  id: StufeId;
  label: string;
  /** Abschlusswahrscheinlichkeit für die Gewichtung. */
  wahrscheinlichkeit: number;
  /** Geschätzte Monate bis zum Notartermin, wenn Salesforce keinen Schlusstermin in der Zukunft hat. */
  restMonate: number;
  beschreibung: string;
};

export const STUFEN: Stufe[] = [
  {
    id: "erstkontakt",
    label: "Erstkontakt",
    wahrscheinlichkeit: 0.1,
    restMonate: 9,
    beschreibung: "Mandat in Akquisition",
  },
  {
    id: "einwertung",
    label: "Einwertung",
    wahrscheinlichkeit: 0.2,
    restMonate: 7,
    beschreibung: "Objekt wird bewertet",
  },
  {
    id: "beauftragt",
    label: "Beauftragt",
    wahrscheinlichkeit: 0.3,
    restMonate: 5,
    beschreibung: "Mandat erteilt, noch kein aktiver Interessent",
  },
  {
    id: "interessent",
    label: "Interessent",
    wahrscheinlichkeit: 0.45,
    restMonate: 4,
    beschreibung: "Interessent mit Erstinteresse",
  },
  {
    id: "besichtigung",
    label: "Besichtigung & Datenraum",
    wahrscheinlichkeit: 0.6,
    restMonate: 3,
    beschreibung: "Besichtigt oder im Datenraum",
  },
  {
    id: "verhandlung",
    label: "Angebot & Verhandlung",
    wahrscheinlichkeit: 0.8,
    restMonate: 2,
    beschreibung: "Kaufangebot, Verhandlung, Provisionsvereinbarung",
  },
  {
    id: "notar",
    label: "Notartermin",
    wahrscheinlichkeit: 0.95,
    restMonate: 1,
    beschreibung: "Gewonnen bzw. beurkundet, Provision noch nicht bezahlt",
  },
];

const RANG = new Map(STUFEN.map((s, i) => [s.id, i]));

export function stufe(id: StufeId): Stufe {
  return STUFEN[RANG.get(id) ?? 0];
}

/** Provisionssatz, wenn am Mandat keiner gepflegt ist (üblicher Grenz-Satz). */
export const STANDARD_PROVISION_PROZENT = 5;

/** Ohne Salesforce-Aktivität seit so vielen Tagen gilt ein Deal als ruhend. */
export const RUHT_AB_TAGEN = 90;

/** Mandatsphase (Mandate__c.Stage__c) → Stufe. Verloren und leere Phasen zählen nicht. */
const MANDAT_STUFE: Record<string, StufeId> = {
  Akquisition: "erstkontakt",
  Einwertung: "einwertung",
  Beauftragung: "beauftragt",
  Gewonnen: "notar",
};

/** Opportunity-Phase (Record Type Real_Estate_Broker) → Stufe. */
const DEAL_STUFE: Record<string, StufeId> = {
  Akquisition: "erstkontakt",
  Einwertung: "einwertung",
  "Off-Market Freigabe": "beauftragt",
  Vermarktung: "beauftragt",
  "Initial interest": "interessent",
  "Contact Qualification": "interessent",
  Contact: "interessent",
  Request: "interessent",
  Qualification: "interessent",
  "Needs Analysis": "interessent",
  "Anfrage erhalten": "interessent",
  Visit: "besichtigung",
  "Data Room": "besichtigung",
  Proposal: "verhandlung",
  Negotiation: "verhandlung",
  "Commission agreement": "verhandlung",
  Exklusivität: "verhandlung",
  "Closed Won": "notar",
};

export const BEZAHLT = "Invoice Paid";
const VERLOREN = "Closed Lost";

type Roh = Record<string, unknown>;

export type MandatEingabe = {
  sfId: string;
  name: string;
  status: string | null;
  art: string | null;
  angebotspreis: number | null;
  provisionProzent: number | null;
  realEstateSfId: string | null;
  daten: Roh;
};

export type ObjektEingabe = {
  sfId: string;
  name: string;
  ort: string | null;
  daten: Roh;
};

export type DealEingabe = {
  sfId: string;
  name: string;
  phase: string | null;
  betrag: number | null;
  abschlussAm: string | null;
  mandatSfId: string | null;
  daten: Roh;
};

export type PipelineEingabe = {
  mandate: MandatEingabe[];
  objekte: ObjektEingabe[];
  deals: DealEingabe[];
  /** Letzte Salesforce-Aktivität je Mandat (ISO-Datum). */
  letzteAktivitaet: Map<string, string>;
  /** ISO-Datum. */
  heute: string;
};

export type BasisQuelle =
  "beurkundet" | "deal" | "exposepreis" | "preisvorstellung" | null;

export type PipelineDeal = {
  /** Mandat-Id, ohne Mandat die Opportunity-Id. */
  id: string;
  mandatSfId: string | null;
  mandat: string | null;
  objekt: string;
  ort: string | null;
  stufe: StufeId;
  /** Phase so, wie sie in Salesforce steht. */
  sfPhase: string;
  art: string | null;
  /** Fortgeschrittenster offener Interessenten-Deal. */
  interessent: { sfId: string; name: string; phase: string | null } | null;
  weitereInteressenten: number;
  kaufpreis: number | null;
  kaufpreisQuelle: BasisQuelle;
  provisionProzent: number | null;
  provisionProzentAngenommen: boolean;
  provisionsfrei: boolean;
  /** Erwartete Provision bei Abschluss (ungewichtet), null wenn kein Preis bekannt. */
  provision: number | null;
  wahrscheinlichkeit: number;
  /** Erwarteter Notarmonat „YYYY-MM“. */
  notarMonat: string;
  notarQuelle: "salesforce" | "geschaetzt";
  letzteAktivitaet: string | null;
  ruht: boolean;
  hinweise: string[];
};

export type PipelineAbschluss = {
  sfId: string;
  name: string;
  objekt: string | null;
  datum: string;
  kaufpreis: number | null;
  provision: number;
};

export type Datenhinweis = { sfId: string; name: string; text: string };

export type PipelineDto = {
  heute: string;
  deals: PipelineDeal[];
  abschluesse: PipelineAbschluss[];
  datenhinweise: Datenhinweis[];
};

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function zahl(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Positive Zahl oder null (Salesforce speichert fehlende Preise oft als 0). */
function positiv(v: unknown): number | null {
  const n = zahl(v);
  return n != null && n > 0 ? n : null;
}

function istTest(name: string): boolean {
  return /^test\b/i.test(name.trim());
}

export function monatPlus(monat: string, n: number): string {
  const j = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7)) - 1 + n;
  const jahr = j + Math.floor(m / 12);
  const mon = ((m % 12) + 12) % 12;
  return `${jahr}-${String(mon + 1).padStart(2, "0")}`;
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis) - Date.parse(von)) / 86_400_000);
}

function dealStufe(d: DealEingabe): StufeId | null {
  const phase = d.phase ?? "";
  if (phase === BEZAHLT || phase === VERLOREN) return null;
  if (d.daten.IsClosed === true && d.daten.IsWon !== true) return null;
  if (d.daten.IsWon === true) return "notar";
  let s = DEAL_STUFE[phase] ?? "interessent";
  // Besichtigungsdatum gepflegt, Phase aber noch „Initial interest“.
  if (s === "interessent" && text(d.daten.Date_of_visit__c)) s = "besichtigung";
  if (
    positiv(d.daten.Beurkundeter_Kaufpreis_in__c) &&
    (RANG.get(s) ?? 0) < (RANG.get("notar") ?? 0)
  )
    s = "notar";
  return s;
}

function weiter(a: StufeId, b: StufeId): boolean {
  return (RANG.get(a) ?? 0) > (RANG.get(b) ?? 0);
}

function realEstateVon(d: DealEingabe): string | null {
  return text(d.daten.Real_Estate__c);
}

export function berechnePipeline(e: PipelineEingabe): PipelineDto {
  const heuteMonat = e.heute.slice(0, 7);
  const objektJeId = new Map(e.objekte.map((o) => [o.sfId, o]));
  const mandatJeId = new Map(e.mandate.map((m) => [m.sfId, m]));
  const deals = e.deals.filter((d) => !istTest(d.name));

  // Deals dem laufenden Mandat ihres Objekts zuordnen (ein Objekt kann ein altes, verlorenes Mandat haben).
  const aktivJeObjekt = new Map<string, MandatEingabe>();
  for (const m of e.mandate) {
    if (!m.realEstateSfId || !m.status || !MANDAT_STUFE[m.status]) continue;
    const bisher = aktivJeObjekt.get(m.realEstateSfId);
    const erstellt = text(m.daten.CreatedDate) ?? "";
    if (!bisher || erstellt > (text(bisher.daten.CreatedDate) ?? ""))
      aktivJeObjekt.set(m.realEstateSfId, m);
  }
  const mandatVonDeal = (d: DealEingabe): MandatEingabe | null => {
    const re = realEstateVon(d);
    return (
      (re ? aktivJeObjekt.get(re) : undefined) ??
      (d.mandatSfId ? (mandatJeId.get(d.mandatSfId) ?? null) : null)
    );
  };

  const dealsJeMandat = new Map<string, DealEingabe[]>();
  const ohneMandat: DealEingabe[] = [];
  for (const d of deals) {
    const m = mandatVonDeal(d);
    if (m) dealsJeMandat.set(m.sfId, [...(dealsJeMandat.get(m.sfId) ?? []), d]);
    else ohneMandat.push(d);
  }

  const abschluesse: PipelineAbschluss[] = [];
  for (const d of deals) {
    if (d.phase !== BEZAHLT) continue;
    const datum = text(d.abschlussAm);
    if (!datum) continue;
    const m = mandatVonDeal(d);
    const kaufpreis =
      positiv(d.daten.Beurkundeter_Kaufpreis_in__c) ?? positiv(d.betrag);
    const satz = m?.provisionProzent ?? STANDARD_PROVISION_PROZENT;
    const provision =
      positiv(d.daten.Provision_in__c) ??
      (kaufpreis ? (kaufpreis * satz) / 100 : 0);
    const o = realEstateVon(d)
      ? objektJeId.get(realEstateVon(d) as string)
      : undefined;
    abschluesse.push({
      sfId: d.sfId,
      name: d.name,
      objekt: o?.name ?? null,
      datum,
      kaufpreis,
      provision,
    });
  }
  abschluesse.sort((a, b) => b.datum.localeCompare(a.datum));

  const ergebnis: PipelineDeal[] = [];
  const datenhinweise: Datenhinweis[] = [];

  const karte = (
    m: MandatEingabe | null,
    eigene: DealEingabe[],
    fallback: DealEingabe | null,
  ) => {
    const offen = eigene
      .map((d) => ({ d, s: dealStufe(d) }))
      .filter((x): x is { d: DealEingabe; s: StufeId } => x.s !== null)
      .sort((a, b) => (RANG.get(b.s) ?? 0) - (RANG.get(a.s) ?? 0));
    const bester = offen[0] ?? null;
    const bezahlt = eigene.some((d) => d.phase === BEZAHLT);

    let s: StufeId | null = m?.status ? (MANDAT_STUFE[m.status] ?? null) : null;
    if (m && m.status === "Gewonnen" && bezahlt && !bester) return; // abgeschlossen, steht unter Ist
    if (m && m.status === "Beauftragung" && bezahlt && !bester) {
      datenhinweise.push({
        sfId: m.sfId,
        name: m.name,
        text: "Provision bezahlt, Mandat steht in Salesforce aber noch auf Beauftragung.",
      });
      return;
    }
    if (bester && (s === null || weiter(bester.s, s))) s = bester.s;
    if (s === null) return;

    const objekt = m?.realEstateSfId
      ? objektJeId.get(m.realEstateSfId)
      : fallback && realEstateVon(fallback)
        ? objektJeId.get(realEstateVon(fallback) as string)
        : undefined;
    const hinweise: string[] = [];

    // Kaufpreis: beurkundet → Deal → Exposépreis → Preisvorstellung am Objekt.
    let kaufpreis: number | null = null;
    let kaufpreisQuelle: BasisQuelle = null;
    const kandidaten: Array<[number | null, BasisQuelle]> = [
      [positiv(bester?.d.daten.Beurkundeter_Kaufpreis_in__c), "beurkundet"],
      [positiv(bester?.d.betrag), "deal"],
      [
        positiv(m?.angebotspreis) ?? positiv(objekt?.daten.Expos_price__c),
        "exposepreis",
      ],
      [
        positiv(objekt?.daten.Purchase_price_expectations__c),
        "preisvorstellung",
      ],
    ];
    for (const [wert, quelle] of kandidaten) {
      if (wert != null) {
        kaufpreis = wert;
        kaufpreisQuelle = quelle;
        break;
      }
    }

    const feeModel =
      text(bester?.d.daten.Fee_Model__c) ?? text(m?.daten.Fee_Model__c);
    const provisionsfrei = feeModel === "Provisionsfrei";
    const provisionProzentAngenommen = m?.provisionProzent == null;
    const provisionProzent = provisionsfrei
      ? 0
      : (m?.provisionProzent ?? STANDARD_PROVISION_PROZENT);
    let provision: number | null = null;
    const dealProvision = positiv(bester?.d.daten.Provision_in__c);
    if (provisionsfrei) provision = 0;
    else if (dealProvision != null) provision = dealProvision;
    else if (kaufpreis != null)
      provision = Math.round((kaufpreis * provisionProzent) / 100);
    if (kaufpreis == null)
      hinweise.push("Kein Preis gepflegt, Provision offen");
    if (provisionsfrei) hinweise.push("Provisionsfrei");
    else if (
      provisionProzentAngenommen &&
      provision != null &&
      dealProvision == null
    )
      hinweise.push(
        `Provisionssatz nicht gepflegt, ${STANDARD_PROVISION_PROZENT} % angenommen`,
      );

    const schluss = text(bester?.d.abschlussAm);
    let notarMonat: string;
    let notarQuelle: PipelineDeal["notarQuelle"];
    if (schluss && schluss.slice(0, 7) >= heuteMonat) {
      notarMonat = schluss.slice(0, 7);
      notarQuelle = "salesforce";
    } else {
      notarMonat = monatPlus(heuteMonat, stufe(s).restMonate);
      notarQuelle = "geschaetzt";
      if (schluss)
        hinweise.push(
          `Schlusstermin ${schluss.split("-").reverse().join(".")} überschritten`,
        );
    }

    const id = m?.sfId ?? fallback?.sfId ?? "";
    const letzteAktivitaet =
      [
        e.letzteAktivitaet.get(id) ?? null,
        ...eigene.map((d) => text(d.daten.LastActivityDate)),
      ]
        .filter((x): x is string => !!x)
        .sort()
        .at(-1) ?? null;
    const seit =
      letzteAktivitaet ?? text(m?.daten.CreatedDate)?.slice(0, 10) ?? null;
    const ruht =
      seit != null && tageZwischen(seit.slice(0, 10), e.heute) > RUHT_AB_TAGEN;
    if (ruht) hinweise.push(`Seit über ${RUHT_AB_TAGEN} Tagen keine Aktivität`);

    ergebnis.push({
      id,
      mandatSfId: m?.sfId ?? null,
      mandat: m?.name ?? null,
      objekt: objekt?.name ?? fallback?.name ?? m?.name ?? "Objekt unbekannt",
      ort: objekt?.ort ?? null,
      stufe: s,
      sfPhase: bester
        ? (bester.d.phase ?? "ohne Phase")
        : (m?.status ?? "ohne Phase"),
      art: m?.art ?? null,
      interessent: bester
        ? { sfId: bester.d.sfId, name: bester.d.name, phase: bester.d.phase }
        : null,
      weitereInteressenten: Math.max(0, offen.length - 1),
      kaufpreis,
      kaufpreisQuelle,
      provisionProzent,
      provisionProzentAngenommen,
      provisionsfrei,
      provision,
      wahrscheinlichkeit: stufe(s).wahrscheinlichkeit,
      notarMonat,
      notarQuelle,
      letzteAktivitaet,
      ruht,
      hinweise,
    });
  };

  for (const m of e.mandate) {
    if (istTest(m.name)) continue;
    if (!m.status || !(m.status in MANDAT_STUFE)) {
      if (!m.status && m.realEstateSfId)
        datenhinweise.push({
          sfId: m.sfId,
          name: m.name,
          text: "Phase in Salesforce leer, nicht in der Pipeline.",
        });
      continue;
    }
    karte(m, dealsJeMandat.get(m.sfId) ?? [], null);
  }
  for (const d of ohneMandat) {
    if (dealStufe(d) === null) continue;
    karte(null, [d], d);
  }

  ergebnis.sort(
    (a, b) =>
      (RANG.get(b.stufe) ?? 0) - (RANG.get(a.stufe) ?? 0) ||
      (b.provision ?? 0) - (a.provision ?? 0),
  );
  return { heute: e.heute, deals: ergebnis, abschluesse, datenhinweise };
}

export type PrognoseMonat = {
  monat: string;
  /** Bezahlte Provision (Ist). */
  ist: number;
  /** Gewichtete erwartete Provision je Stufe. */
  stufen: Record<StufeId, number>;
  gewichtet: number;
  ungewichtet: number;
};

/**
 * Monatsreihe: Ist der letzten `zurueck` Monate, Prognose der nächsten `vor` Monate.
 * Erwartete Termine vor dem laufenden Monat landen im laufenden Monat.
 */
export function prognose(
  dto: Pick<PipelineDto, "deals" | "abschluesse" | "heute">,
  {
    zurueck = 6,
    vor = 12,
    ohneRuhende = false,
  }: { zurueck?: number; vor?: number; ohneRuhende?: boolean } = {},
): PrognoseMonat[] {
  const heuteMonat = dto.heute.slice(0, 7);
  const monate: PrognoseMonat[] = [];
  for (let i = -zurueck; i < vor; i++) {
    monate.push({
      monat: monatPlus(heuteMonat, i),
      ist: 0,
      stufen: Object.fromEntries(STUFEN.map((s) => [s.id, 0])) as Record<
        StufeId,
        number
      >,
      gewichtet: 0,
      ungewichtet: 0,
    });
  }
  const jeMonat = new Map(monate.map((m) => [m.monat, m]));
  for (const a of dto.abschluesse) {
    const m = jeMonat.get(a.datum.slice(0, 7));
    if (m) m.ist += a.provision;
  }
  for (const d of dto.deals) {
    if (d.provision == null || (ohneRuhende && d.ruht)) continue;
    const ziel = d.notarMonat < heuteMonat ? heuteMonat : d.notarMonat;
    const m = jeMonat.get(ziel);
    if (!m) continue;
    const w = d.provision * d.wahrscheinlichkeit;
    m.stufen[d.stufe] += w;
    m.gewichtet += w;
    m.ungewichtet += d.provision;
  }
  for (const m of monate) {
    m.ist = Math.round(m.ist);
    m.gewichtet = Math.round(m.gewichtet);
    m.ungewichtet = Math.round(m.ungewichtet);
    for (const s of STUFEN) m.stufen[s.id] = Math.round(m.stufen[s.id]);
  }
  return monate;
}
