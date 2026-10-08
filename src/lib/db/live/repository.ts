import { heuteIso } from "@/lib/kalender";
import { supabase } from "@/lib/supabase";
import {
  naechsteBeschlussId,
  type AnkaufAusExposeEingabe,
  type BeschlussEingabe,
  type BeschlussListe,
  type BoardRepository,
  type KontosaldoEingabe,
  type PlanpostenEingabe,
} from "../repository";
import type { AnkaufPhase } from "../transaktionen";
import type {
  Beschluss,
  BoardDaten,
  Loan,
  Machine,
  ReviewItem,
  Segment,
} from "../typen";
import {
  abbilden,
  ibanAusDateiname,
  type LiveRohdaten,
  type Row,
} from "./abbildung";

type Antwort = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

/** Tabelle oder View existiert nicht (Board-Migration noch nicht angewendet). */
function fehltTabelle(error: Antwort["error"]): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    /does not exist|could not find the table/i.test(error.message)
  );
}

async function pflicht(q: PromiseLike<Antwort>, was: string): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw new Error(`${was}: ${error.message}`);
  return (data as Row[]) ?? [];
}

async function optional(
  q: PromiseLike<Antwort>,
  was: string,
  fehlend: string[],
): Promise<Row[] | null> {
  const { data, error } = await q;
  if (fehltTabelle(error)) {
    fehlend.push(was);
    return null;
  }
  if (error) throw new Error(`${was}: ${error.message}`);
  return (data as Row[]) ?? [];
}

/** PostgREST liefert höchstens 1.000 Zeilen je Abfrage; Bankbuchungen seitenweise laden. */
async function alleSeiten(
  baue: (von: number, bis: number) => PromiseLike<Antwort>,
  was: string,
  fehlend?: string[],
): Promise<Row[] | null> {
  const SEITE = 1000;
  const alle: Row[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await baue(von, von + SEITE - 1);
    if (error) {
      if (fehlend && fehltTabelle(error)) {
        fehlend.push(was);
        return null;
      }
      throw new Error(`${was}: ${error.message}`);
    }
    const rows = (data as Row[]) ?? [];
    alle.push(...rows);
    if (rows.length < SEITE) return alle;
  }
}

/**
 * Echte Datenquelle: Bens Tabellen im Schema `public` mit dem Benutzer-JWT.
 * RLS gilt wie in der übrigen App (Lesen für alle Angemeldeten, Schreiben
 * nach `jwt_darf_schreiben()`).
 */
export class LiveRepository implements BoardRepository {
  readonly quelle = "live" as const;

  async laden(): Promise<BoardDaten> {
    const fehlend: string[] = [];
    const db = supabase;
    const [
      gesellschaften,
      objekte,
      einheiten,
      mietverhaeltnisse,
      personen,
      mieterhoehungen,
      darlehen,
      darlehenStand,
      darlehenBuchungen,
      ebicsKonten,
      ebicsKunden,
      bankkonten,
      kontosalden,
      sollZuordnungen,
      sollPositionen,
      planposten,
      ankaufPipeline,
      objektVerkauf,
      einheitenVerkauf,
      exposes,
      profiles,
      maschinen,
      maschinenKosten,
    ] = await Promise.all([
      pflicht(
        db.from("gesellschaften").select("*").order("id"),
        "gesellschaften",
      ),
      pflicht(db.from("objekte").select("*").order("id"), "objekte"),
      pflicht(db.from("einheiten").select("*").order("id"), "einheiten"),
      pflicht(db.from("mietverhaeltnisse").select("*"), "mietverhaeltnisse"),
      pflicht(
        db
          .from("personen")
          .select("id, typ, vorname, nachname, firma, e_mail, iban"),
        "personen",
      ),
      pflicht(db.from("mieterhoehungen").select("*"), "mieterhoehungen"),
      pflicht(db.from("darlehen").select("*").order("id"), "darlehen"),
      pflicht(db.from("darlehen_stand").select("*"), "darlehen_stand"),
      pflicht(
        db
          .from("darlehen_buchungen")
          .select("darlehen_id, bankbuchung_id, fingerprint, typ"),
        "darlehen_buchungen",
      ),
      pflicht(
        db.from("ebics_konten").select("iban, ebics_kunde_id, aktiv"),
        "ebics_konten",
      ),
      pflicht(
        db
          .from("ebics_kunden")
          .select("id, gesellschaft_id, bank_name, status"),
        "ebics_kunden",
      ),
      optional(db.from("bankkonten").select("*"), "bankkonten", fehlend),
      optional(
        db.from("kontosalden").select("iban, stichtag, saldo, quelle"),
        "kontosalden",
        fehlend,
      ),
      alleSeiten(
        (von, bis) =>
          db
            .from("sollstellung_zuordnungen")
            .select("position_id, bankbuchung_id, bankbuchungen(fingerprint)")
            .range(von, bis),
        "sollstellung_zuordnungen",
      ),
      alleSeiten(
        (von, bis) =>
          db
            .from("sollstellung_positionen")
            .select("id, objekt_id, mietverhaeltnis_id")
            .range(von, bis),
        "sollstellung_positionen",
      ),
      optional(db.from("planposten").select("*"), "planposten", fehlend),
      pflicht(db.from("ankauf_pipeline").select("*"), "ankauf_pipeline"),
      optional(
        db.from("objekt_verkauf").select("*"),
        "objekt_verkauf",
        fehlend,
      ),
      pflicht(db.from("einheiten_verkauf").select("*"), "einheiten_verkauf"),
      pflicht(
        db
          .from("postfach_exposes")
          .select(
            "id, betreff, absender_name, status, eingegangen_am, felder, salesforce_transaktion_id, updated_at",
          )
          .order("eingegangen_am", { ascending: false }),
        "postfach_exposes",
      ),
      pflicht(db.from("profiles").select("id, name"), "profiles"),
      optional(db.from("maschinen").select("*"), "maschinen", fehlend),
      optional(
        db.from("maschinen_kosten").select("*"),
        "maschinen_kosten",
        fehlend,
      ),
    ]);

    // Eindeutige Bankbuchungen (View), sonst Rohdaten und Dubletten selbst filtern
    let bankbuchungen = await alleSeiten(
      (von, bis) =>
        db
          .from("bankbuchungen_eindeutig")
          .select("*")
          .order("buchungsdatum")
          .range(von, bis),
      "bankbuchungen_eindeutig",
      fehlend,
    );
    const { count: roh } = await db
      .from("bankbuchungen")
      .select("id", { count: "exact", head: true });
    if (!bankbuchungen) {
      const rohzeilen =
        (await alleSeiten(
          (von, bis) =>
            db
              .from("bankbuchungen")
              .select("*, bankauszuege(gesellschaft_id, dateiname)")
              .order("created_at")
              .range(von, bis),
          "bankbuchungen",
        )) ?? [];
      const gesehen = new Set<string>();
      bankbuchungen = [];
      for (const b of rohzeilen) {
        const auszug = (b.bankauszuege as Row | null) ?? {};
        const konto = ibanAusDateiname(auszug.dateiname);
        const schluessel = `${konto ?? auszug.gesellschaft_id}|${b.fingerprint}`;
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        bankbuchungen.push({
          ...b,
          gesellschaft_id: auszug.gesellschaft_id,
          konto_iban: konto,
        });
      }
    }

    // Spalten der Board-Migration an bestehenden Tabellen
    if (gesellschaften.length > 0 && !("segment" in gesellschaften[0]))
      fehlend.push("gesellschaften.segment");
    if (ankaufPipeline.length > 0 && !("stufe_seit" in ankaufPipeline[0]))
      fehlend.push("ankauf_pipeline (Steuerungsfelder)");

    const roh_: LiveRohdaten = {
      stichtag: heuteIso(),
      gesellschaften,
      objekte,
      einheiten,
      mietverhaeltnisse,
      personen,
      mieterhoehungen,
      darlehen,
      darlehenStand,
      darlehenBuchungen,
      bankbuchungen,
      bankbuchungenRoh: roh ?? bankbuchungen.length,
      ebicsKonten,
      ebicsKunden,
      bankkonten,
      kontosalden,
      sollZuordnungen: sollZuordnungen ?? [],
      sollPositionen: sollPositionen ?? [],
      planposten,
      ankaufPipeline,
      objektVerkauf,
      einheitenVerkauf,
      exposes,
      profiles,
      maschinen,
      maschinenKosten,
      fehlendeMigration: [...new Set(fehlend)],
    };
    return abbilden(roh_);
  }

  async darlehenSpeichern(loans: Loan[]) {
    const ids = loans.map((l) => l.id);
    const { data: vorhanden, error } = await supabase
      .from("darlehen")
      .select("id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const alt = new Set((vorhanden ?? []).map((r) => String(r.id)));
    const rows = loans.map((l) => ({
      id: l.id,
      art: l.kind,
      geber_gesellschaft_id: l.lenderCompanyId,
      geber_person_id: l.lenderPartyId,
      nehmer_gesellschaft_id: l.borrowerCompanyId,
      nehmer_person_id: l.borrowerPartyId,
      objekt_id: l.propertyId,
      betrag: l.principal,
      zins_pa: Math.round(l.rate * 100 * 10_000) / 10_000,
      auszahlung_am: l.disbursementDate,
      ende: l.maturityDate,
      zins_art: l.rateType,
      zinsbindung_bis: l.fixedUntil,
      zinszahlung: l.frequency,
      tilgung:
        l.repayment.kind === "annuitaet"
          ? "annuitaet"
          : l.repayment.kind === "ratentilgung"
            ? "raten"
            : "endfaellig",
      rate_monatlich:
        l.repayment.kind === "annuitaet" ? l.repayment.installment : null,
      tilgung_monatlich:
        l.repayment.kind === "ratentilgung"
          ? l.repayment.principalPerPeriod
          : null,
      status: l.status,
      bemerkung: l.purpose || null,
    }));
    const { error: e2 } = await supabase
      .from("darlehen")
      .upsert(rows, { onConflict: "id" });
    if (e2) throw new Error(e2.message);
    const neu = ids.filter((id) => !alt.has(id)).length;
    return { neu, aktualisiert: ids.length - neu };
  }

  async pruefStatusSetzen(id: string, status: ReviewItem["status"]) {
    const { error } = await supabase
      .from("pruefliste_status")
      .upsert(
        { pruef_id: id, status, geaendert_am: new Date().toISOString() },
        { onConflict: "pruef_id" },
      );
    if (error) throw new Error(error.message);
  }

  async erledigtePruefFaelle() {
    const { data, error } = await supabase
      .from("pruefliste_status")
      .select("pruef_id")
      .eq("status", "erledigt");
    if (fehltTabelle(error)) return [];
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => String(r.pruef_id));
  }

  async kontosaldoErfassen(e: KontosaldoEingabe) {
    const iban = e.iban.replace(/\s+/g, "").toUpperCase();
    const konto = await supabase
      .from("bankkonten")
      .upsert(
        { iban, gesellschaft_id: e.companyId, bank: e.bankName ?? null },
        { onConflict: "iban", ignoreDuplicates: true },
      );
    if (konto.error) throw new Error(konto.error.message);
    const { error } = await supabase
      .from("kontosalden")
      .upsert(
        { iban, stichtag: e.stichtag, saldo: e.saldo, quelle: "manuell" },
        { onConflict: "iban,stichtag,quelle" },
      );
    if (error) throw new Error(error.message);
  }

  async mindestliquiditaetSetzen(companyId: string, betrag: number | null) {
    const { error } = await supabase
      .from("gesellschaften")
      .update({ mindestliquiditaet: betrag })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
  }

  async segmentSetzen(companyId: string, segment: Segment) {
    const { error } = await supabase
      .from("gesellschaften")
      .update({ segment })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
  }

  async planpostenAnlegen(e: PlanpostenEingabe) {
    const { error } = await supabase.from("planposten").insert({
      gesellschaft_id: e.companyId,
      datum: e.datum,
      betrag: e.betrag,
      bezeichnung: e.bezeichnung,
      kategorie: e.kategorie,
      monatlich_bis: e.monatlichBis,
    });
    if (error) throw new Error(error.message);
  }

  async ankaufStufeSetzen(ankaufId: string, phase: AnkaufPhase) {
    const { error } = await supabase
      .from("ankauf_pipeline")
      .update({ stufe: phase })
      .eq("id", ankaufId);
    if (error) throw new Error(error.message);
  }

  async ankaufAusExpose(e: AnkaufAusExposeEingabe) {
    const basis = {
      bezeichnung: e.name,
      strasse: e.strasse || null,
      ort: e.ort || null,
      quelle: "Postfach-Exposé",
      expose_id: e.exposeId,
      stufe: "bewertung",
      kaufpreis_forderung: e.angebotspreis,
    };
    const erweitert = {
      ...basis,
      jahresnettokaltmiete: e.jahresnettokaltmiete,
      flaeche_m2: e.flaeche,
      einheiten_anzahl: e.einheiten,
      makler: e.makler,
      salesforce_transaktion_id: e.sfId,
      naechster_schritt: "Erstbewertung",
    };
    let res = await supabase
      .from("ankauf_pipeline")
      .insert(erweitert)
      .select("id")
      .single();
    // ohne Board-Migration nur die Grundfelder
    if (res.error && fehltTabelle(res.error))
      res = await supabase
        .from("ankauf_pipeline")
        .insert(basis)
        .select("id")
        .single();
    if (res.error) throw new Error(res.error.message);
    return String(res.data.id);
  }

  async maschinenSpeichern(maschinen: Machine[]) {
    const ids = maschinen.map((m) => m.id);
    const { data: vorhanden, error } = await supabase
      .from("maschinen")
      .select("id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const alt = new Set((vorhanden ?? []).map((r) => String(r.id)));
    const rows = maschinen.map((m) => ({
      id: m.id,
      gesellschaft_id: m.companyId,
      hersteller: m.hersteller,
      modell: m.modell,
      kategorie: m.kategorie,
      baujahr: m.baujahr,
      betriebsstunden: m.betriebsstunden,
      seriennummer: m.seriennummer,
      standort: m.standort,
      status: m.status,
      ankauf_am: m.ankaufAm,
      einkaufspreis: m.einkaufspreis,
      lieferant: m.lieferant,
      angebotspreis: m.angebotspreis,
      inserat_url: m.inseratUrl,
      verkauf_am: m.verkaufAm,
      verkaufspreis: m.verkaufspreis,
      kaeufer: m.kaeufer,
      bemerkung: m.bemerkung,
    }));
    const { error: e2 } = await supabase
      .from("maschinen")
      .upsert(rows, { onConflict: "id" });
    if (e2) throw new Error(e2.message);
    const neu = ids.filter((id) => !alt.has(id)).length;
    return { neu, aktualisiert: ids.length - neu };
  }

  // --- Wochenrunde (Tabelle board_beschluesse, Migration 20261009070000) ---

  async beschluesse(): Promise<BeschlussListe> {
    const { data, error } = await supabase
      .from("board_beschluesse")
      .select("*")
      .order("runde_am", { ascending: false })
      .order("id");
    if (fehltTabelle(error)) return { eintraege: [], tabelleFehlt: true };
    if (error) throw new Error(error.message);
    return {
      eintraege: ((data as Row[]) ?? []).map(beschlussAusZeile),
      tabelleFehlt: false,
    };
  }

  async beschlussAnlegen(e: BeschlussEingabe): Promise<string> {
    const vorhanden = await this.beschluesse();
    if (vorhanden.tabelleFehlt)
      throw new Error(
        "Beschlüsse können erst gespeichert werden, wenn die Datenbank-Erweiterung 20261009070000_board_wochenrunde angewendet ist.",
      );
    const id = naechsteBeschlussId(
      vorhanden.eintraege.map((b) => b.id),
      e.rundeAm,
    );
    const { error } = await supabase.from("board_beschluesse").insert({
      id,
      runde_am: e.rundeAm,
      text: e.text,
      verantwortlich: e.verantwortlich,
      faellig_am: e.faelligAm,
      bezug_typ: e.bezugTyp,
      bezug_id: e.bezugId,
      gesellschaft_id: e.companyId,
      status: "offen",
    });
    if (error) throw new Error(error.message);
    return id;
  }

  async beschlussStatusSetzen(
    id: string,
    status: Beschluss["status"],
    am: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("board_beschluesse")
      .update({ status, erledigt_am: status === "erledigt" ? am : null })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

function beschlussAusZeile(r: Row): Beschluss {
  const text = (v: unknown) => (v == null || v === "" ? null : String(v));
  const bezug = text(r.bezug_typ);
  return {
    id: String(r.id),
    rundeAm: String(r.runde_am).slice(0, 10),
    text: String(r.text ?? ""),
    verantwortlich: text(r.verantwortlich),
    faelligAm: text(r.faellig_am)?.slice(0, 10) ?? null,
    bezugTyp: (bezug as Beschluss["bezugTyp"]) ?? null,
    bezugId: text(r.bezug_id),
    companyId: text(r.gesellschaft_id),
    status: r.status === "erledigt" ? "erledigt" : "offen",
    erledigtAm: text(r.erledigt_am)?.slice(0, 10) ?? null,
  };
}
