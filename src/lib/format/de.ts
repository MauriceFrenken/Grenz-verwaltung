/**
 * Formatierung für das Management Board (de-DE).
 * Beträge: 1.234,56 € · Datum: TT.MM.JJJJ · Prozent: 3,25 %
 */
const eur2 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const zahl0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

const LEER = "–";

function istZahl(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 1.234,56 € */
export function euro(v: number | null | undefined): string {
  return istZahl(v) ? eur2.format(v).replace(/\u00a0/g, " ") : LEER;
}

/** 1.235 € (ohne Nachkommastellen, für KPI-Karten und Diagramme) */
export function euroGanz(v: number | null | undefined): string {
  return istZahl(v) ? eur0.format(Math.round(v)).replace(/\u00a0/g, " ") : LEER;
}

/** Kompakt: 1,2 Mio. € / 345 Tsd. € */
export function euroKompakt(v: number | null | undefined): string {
  if (!istZahl(v)) return LEER;
  const abs = Math.abs(v);
  const vz = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${vz}${dezimal(abs / 1_000_000, 1)} Mio. €`;
  if (abs >= 10_000) return `${vz}${zahl0.format(abs / 1000)} Tsd. €`;
  return euroGanz(v);
}

/** Vorzeichen immer zeigen: +1.234,56 € / −1.234,56 € */
export function euroMitVorzeichen(v: number | null | undefined): string {
  if (!istZahl(v)) return LEER;
  const s = euro(Math.abs(v));
  if (v > 0) return `+${s}`;
  if (v < 0) return `−${s}`;
  return s;
}

export function dezimal(v: number | null | undefined, stellen = 2): string {
  if (!istZahl(v)) return LEER;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(v);
}

export function ganzzahl(v: number | null | undefined): string {
  return istZahl(v) ? zahl0.format(v) : LEER;
}

/** Anteil (0,0325) als Prozent: 3,25 % */
export function prozent(
  anteil: number | null | undefined,
  stellen = 2,
): string {
  return istZahl(anteil) ? `${dezimal(anteil * 100, stellen)} %` : LEER;
}

export function flaeche(m2: number | null | undefined): string {
  return istZahl(m2) ? `${dezimal(m2, m2 % 1 === 0 ? 0 : 2)} m²` : LEER;
}

/** ISO (JJJJ-MM-TT) → TT.MM.JJJJ */
export function datum(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return LEER;
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const MONATE_KURZ = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
const WOCHENTAGE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

/** JJJJ-MM oder ISO-Datum → "Oktober 2026" */
export function monat(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return LEER;
  const [j, m] = iso.split("-");
  return `${MONATE[Number(m) - 1]} ${j}`;
}

/** → "Okt 26" (Diagrammachsen) */
export function monatKurz(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return LEER;
  const [j, m] = iso.split("-");
  return `${MONATE_KURZ[Number(m) - 1]} ${j.slice(2)}`;
}

/** → "07.10." (Diagrammachsen) */
export function tagKurz(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return LEER;
  const [, m, t] = iso.split("-");
  return `${t}.${m}.`;
}

/** → "Mittwoch, 7. Oktober 2026" */
export function datumLang(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return LEER;
  const [j, m, t] = iso.split("-").map(Number);
  const wt = new Date(Date.UTC(j, m - 1, t)).getUTCDay();
  return `${WOCHENTAGE[wt]}, ${t}. ${MONATE[m - 1]} ${j}`;
}

/** Relative Angabe für Fristen: "heute", "morgen", "in 5 Tagen", "seit 3 Tagen" */
export function relativTage(tage: number): string {
  if (tage === 0) return "heute";
  if (tage === 1) return "morgen";
  if (tage === -1) return "gestern";
  if (tage > 1) return `in ${tage} Tagen`;
  return `seit ${-tage} Tagen`;
}

/** Deutsche Zahl ("1.234,56", "1234,5", "3 %") in Zahl wandeln; null bei ungültig. */
export function parseDeutscheZahl(
  text: string | number | null | undefined,
): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (!text) return null;
  const s = String(text)
    .replace(/[€%\s\u00a0]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** TT.MM.JJJJ → ISO; akzeptiert auch bereits ISO. null bei ungültig. */
export function parseDeutschesDatum(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const t = String(text).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (!de) return null;
  const [, tag, mon, jahr] = de;
  const d = new Date(Date.UTC(Number(jahr), Number(mon) - 1, Number(tag)));
  if (d.getUTCDate() !== Number(tag) || d.getUTCMonth() !== Number(mon) - 1)
    return null;
  return d.toISOString().slice(0, 10);
}
