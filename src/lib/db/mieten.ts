/**
 * Mieten-Tracking: Mietkonten, Monatssoll und Mieteingänge aus der Datenbank
 * (Migration 20261013150000_mieten_tracking). Soll, Zuordnung und Rückstand
 * rechnet die Datenbank; hier wird nur gelesen, abgebildet und ausgelöst.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Mahnstufe je Mietvertrag (aus v_mietkonten). */
export const MIET_STUFEN = [
  "ok",
  "offen",
  "mahnen",
  "kuendigung_pruefen",
] as const;
export type MietStufe = (typeof MIET_STUFEN)[number];

export const MONAT_STATUS = [
  "bezahlt",
  "noch_nicht_faellig",
  "teilweise",
  "ueberfaellig",
] as const;
export type MonatStatus = (typeof MONAT_STATUS)[number];

/** Wie eine Zahlung zum Vertrag kam. */
export type ZuordnungsMethode = "iban" | "zahler" | "name" | "manuell";

export interface MietMonat {
  leaseId: string;
  /** erster Tag des Monats */
  monat: string;
  faellig: string;
  soll: number;
  bezahlt: number;
  offen: number;
  status: MonatStatus;
  /** vertrag = aus dem Mietvertrag, manuell = von Hand korrigiert */
  quelle: "vertrag" | "manuell";
}

export interface Mietkonto {
  leaseId: string;
  mieter: string;
  iban: string | null;
  vertragStatus: string;
  beginn: string | null;
  ende: string | null;
  erfasstAb: string;
  einheitId: string;
  einheitLage: string;
  nutzungsart: string;
  objektId: string;
  objektName: string;
  companyId: string;
  vertragsmiete: number;
  monatssoll: number;
  sollFaellig: number;
  gezahlt: number;
  /** positiv = Rückstand, negativ = Guthaben */
  saldo: number;
  rueckstand: number;
  offeneMonate: number;
  aeltesterOffenerMonat: string | null;
  letzteZahlungAm: string | null;
  letzteZahlungBetrag: number | null;
  anzahlZahlungen: number;
  /** IBAN im Vertrag oder gelernter Zahler vorhanden */
  zahlerBekannt: boolean;
  stufe: MietStufe;
  /** Monatsverlauf, älteste zuerst */
  monate: MietMonat[];
}

/** Zahlungseingang, der noch keinem Vertrag zugeordnet ist. */
export interface MietEingang {
  bankbuchungId: string;
  companyId: string;
  kontoIban: string | null;
  kontoObjektId: string | null;
  datum: string;
  betrag: number;
  gegenIban: string | null;
  zahler: string;
  zweck: string;
  /** Amt/Jobcenter: zahlt für viele Mieter */
  sammelzahler: boolean;
  kaution: boolean;
  /** "pruefen" = bewusst zur Prüfung zurückgestellt */
  entscheidung: "pruefen" | null;
}

export interface MietZahlung {
  bankbuchungId: string;
  leaseId: string;
  datum: string;
  betrag: number;
  methode: ZuordnungsMethode;
  zahler: string;
  zweck: string;
  /** Gesamtbetrag der Bankbuchung (bei Aufteilung größer als betrag) */
  buchungBetrag: number;
}

export interface MietenDaten {
  konten: Mietkonto[];
  eingaenge: MietEingang[];
}

type Row = Record<string, unknown>;

const text = (v: unknown): string | null =>
  v == null || String(v).trim() === "" ? null : String(v);
const zahl = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const tag = (v: unknown): string | null => text(v)?.slice(0, 10) ?? null;

function einsAus<T extends string>(
  werte: readonly T[],
  v: unknown,
  sonst: T,
): T {
  return werte.includes(v as T) ? (v as T) : sonst;
}

export function mietMonatAusZeile(r: Row): MietMonat {
  return {
    leaseId: String(r.mietverhaeltnis_id),
    monat: tag(r.monat) ?? "",
    faellig: tag(r.faellig_am) ?? "",
    soll: zahl(r.soll),
    bezahlt: zahl(r.bezahlt),
    offen: zahl(r.offen),
    status: einsAus(MONAT_STATUS, r.status, "ueberfaellig"),
    quelle: r.quelle === "manuell" ? "manuell" : "vertrag",
  };
}

export function mietkontoAusZeile(r: Row, monate: MietMonat[] = []): Mietkonto {
  return {
    leaseId: String(r.mietverhaeltnis_id),
    mieter: text(r.mieter_name) ?? "Unbekannt",
    iban: text(r.iban),
    vertragStatus: String(r.vertrag_status ?? "aktiv"),
    beginn: tag(r.beginn),
    ende: tag(r.ende),
    erfasstAb: tag(r.erfasst_ab) ?? "",
    einheitId: String(r.einheit_id ?? ""),
    einheitLage: text(r.einheit_lage) ?? "",
    nutzungsart: text(r.nutzungsart) ?? "",
    objektId: String(r.objekt_id ?? ""),
    objektName: text(r.objekt_bezeichnung) ?? "",
    companyId: String(r.gesellschaft_id ?? ""),
    vertragsmiete: zahl(r.vertragsmiete),
    monatssoll: zahl(r.monatssoll),
    sollFaellig: zahl(r.soll_faellig),
    gezahlt: zahl(r.gezahlt),
    saldo: zahl(r.saldo),
    rueckstand: zahl(r.rueckstand),
    offeneMonate: zahl(r.offene_monate),
    aeltesterOffenerMonat: tag(r.aeltester_offener_monat),
    letzteZahlungAm: tag(r.letzte_zahlung_am),
    letzteZahlungBetrag:
      r.letzte_zahlung_betrag == null ? null : zahl(r.letzte_zahlung_betrag),
    anzahlZahlungen: zahl(r.anzahl_zahlungen),
    zahlerBekannt: r.zahler_bekannt === true,
    stufe: einsAus(MIET_STUFEN, r.stufe, "ok"),
    monate,
  };
}

export function eingangAusZeile(r: Row): MietEingang {
  return {
    bankbuchungId: String(r.bankbuchung_id),
    companyId: String(r.gesellschaft_id ?? ""),
    kontoIban: text(r.konto_iban),
    kontoObjektId: text(r.konto_objekt_id),
    datum: tag(r.buchungsdatum) ?? "",
    betrag: zahl(r.betrag),
    gegenIban: text(r.gegenkonto_iban),
    zahler: text(r.auftraggeber_name) ?? "",
    zweck: text(r.verwendungszweck) ?? "",
    sammelzahler: r.sammelzahler === true,
    kaution: r.kaution === true,
    entscheidung: r.entscheidung === "pruefen" ? "pruefen" : null,
  };
}

export function zahlungAusZeile(r: Row): MietZahlung {
  const b = (r.bankbuchungen as Row | null) ?? {};
  return {
    bankbuchungId: String(r.bankbuchung_id),
    leaseId: String(r.mietverhaeltnis_id),
    datum: tag(r.buchungsdatum) ?? "",
    betrag: zahl(r.betrag),
    methode: einsAus(
      ["iban", "zahler", "name", "manuell"] as const,
      r.methode,
      "manuell",
    ),
    zahler: text(b.auftraggeber_name) ?? "",
    zweck: text(b.verwendungszweck) ?? "",
    buchungBetrag: zahl(b.betrag ?? r.betrag),
  };
}

// ---------------------------------------------------------------- Laden

type Antwort = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

/** Mietkonto-Tabellen fehlen (Migration noch nicht eingespielt). */
export function mietenFehlen(error: Antwort["error"]): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message)
  );
}

async function seitenweise(
  baue: (von: number, bis: number) => PromiseLike<Antwort>,
): Promise<Row[]> {
  const SEITE = 1000;
  const alle: Row[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await baue(von, von + SEITE - 1);
    if (error) throw Object.assign(new Error(error.message), error);
    const rows = (data as Row[]) ?? [];
    alle.push(...rows);
    if (rows.length < SEITE) return alle;
  }
}

/** Erster Monat, der im Monatsverlauf mitgeladen wird (12 Monate zurück). */
export function verlaufAb(heute: string, monate = 12): string {
  const [j, m] = heute.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 - (monate - 1), 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Mietkonten mit Monatsverlauf und offene Eingänge.
 * `null`, wenn die Migration noch nicht eingespielt ist.
 */
export async function mietenLaden(
  db: SupabaseClient,
  heute: string,
): Promise<MietenDaten | null> {
  try {
    const [konten, monate, eingaenge] = await Promise.all([
      seitenweise((von, bis) =>
        db.from("v_mietkonten").select("*").range(von, bis),
      ),
      seitenweise((von, bis) =>
        db
          .from("v_mietkonto_monate")
          .select("*")
          .gte("monat", verlaufAb(heute))
          .order("monat")
          .range(von, bis),
      ),
      seitenweise((von, bis) =>
        db
          .from("v_mieteingaenge_offen")
          .select("*")
          .order("buchungsdatum", { ascending: false })
          .range(von, bis),
      ),
    ]);
    const jeVertrag = new Map<string, MietMonat[]>();
    for (const r of monate) {
      const m = mietMonatAusZeile(r);
      const liste = jeVertrag.get(m.leaseId) ?? [];
      liste.push(m);
      jeVertrag.set(m.leaseId, liste);
    }
    return {
      konten: konten.map((r) =>
        mietkontoAusZeile(r, jeVertrag.get(String(r.mietverhaeltnis_id))),
      ),
      eingaenge: eingaenge.map(eingangAusZeile),
    };
  } catch (err) {
    if (mietenFehlen(err as Antwort["error"])) return null;
    throw err;
  }
}

/** Zahlungen eines Vertrags (für das Mietkonto im Detail). */
export async function zahlungenLaden(
  db: SupabaseClient,
  leaseId: string,
): Promise<MietZahlung[]> {
  const { data, error } = await db
    .from("mietzahlungen")
    .select(
      "bankbuchung_id, mietverhaeltnis_id, buchungsdatum, betrag, methode, bankbuchungen(auftraggeber_name, verwendungszweck, betrag)",
    )
    .eq("mietverhaeltnis_id", leaseId)
    .order("buchungsdatum", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map(zahlungAusZeile);
}

/**
 * Zuordnungen für das übrige Board (Kategorie "miete" der Bankumsätze),
 * im Format der bisherigen Sollstellungs-Zuordnungen.
 */
export async function mietZuordnungenLaden(
  db: SupabaseClient,
): Promise<{ zuordnungen: Row[]; positionen: Row[] } | null> {
  try {
    const [zahlungen, vertraege] = await Promise.all([
      seitenweise((von, bis) =>
        db
          .from("mietzahlungen")
          .select("mietverhaeltnis_id, bankbuchungen(fingerprint)")
          .range(von, bis),
      ),
      seitenweise((von, bis) =>
        db
          .from("v_mieten_vertraege")
          .select("mietverhaeltnis_id, objekt_id")
          .range(von, bis),
      ),
    ]);
    return {
      zuordnungen: zahlungen.map((z) => ({
        position_id: z.mietverhaeltnis_id,
        bankbuchungen: z.bankbuchungen,
      })),
      positionen: vertraege.map((v) => ({
        id: v.mietverhaeltnis_id,
        objekt_id: v.objekt_id,
        mietverhaeltnis_id: v.mietverhaeltnis_id,
      })),
    };
  } catch (err) {
    if (mietenFehlen(err as Antwort["error"])) return null;
    throw err;
  }
}

// ---------------------------------------------------------------- Aktionen

async function rpc<T>(
  db: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface AbgleichErgebnis {
  soll_geaendert?: number;
  iban: number;
  zahler: number;
  name: number;
}

/** Soll fortschreiben und neue Eingänge zuordnen. */
export function mietenAktualisieren(db: SupabaseClient) {
  return rpc<AbgleichErgebnis>(db, "mieten_aktualisieren");
}

/** Eingang Verträgen zuordnen; merkt sich IBAN und Zahler (bei Ämtern die Referenz). */
export function eingangZuordnen(
  db: SupabaseClient,
  bankbuchungId: string,
  leaseIds: string[],
  merken = true,
) {
  return rpc<AbgleichErgebnis>(db, "mieteingang_zuordnen", {
    p_bankbuchung_id: bankbuchungId,
    p_mietverhaeltnis_ids: leaseIds,
    p_merken: merken,
  });
}

/** Keine Miete (optional für alle Eingänge dieses Zahlers) oder zur Prüfung zurückstellen. */
export function eingangEntscheiden(
  db: SupabaseClient,
  bankbuchungId: string,
  art: "keine_miete" | "pruefen",
  optionen: { grund?: string; zahlerMerken?: boolean } = {},
) {
  return rpc<void>(db, "mieteingang_entscheiden", {
    p_bankbuchung_id: bankbuchungId,
    p_art: art,
    p_grund: optionen.grund ?? null,
    p_zahler_merken: optionen.zahlerMerken ?? false,
  });
}

/** Entscheidung zurücknehmen: der Eingang läuft wieder durch die Automatik. */
export function eingangFreigeben(db: SupabaseClient, bankbuchungId: string) {
  return rpc<AbgleichErgebnis>(db, "mieteingang_freigeben", {
    p_bankbuchung_id: bankbuchungId,
  });
}
