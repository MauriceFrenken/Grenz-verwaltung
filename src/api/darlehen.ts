import { supabase } from "@/lib/supabase";
import type { Darlehen, DarlehenBuchung, DarlehenBuchungTyp } from "@/types";

/** PostgREST liefert numeric als String — hier einheitlich zu number. */
function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

function zahlOderNull(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

function textOderNull(wert: unknown): string | null {
  return typeof wert === "string" && wert.trim() ? wert : null;
}

type Row = Record<string, unknown>;

function personName(p: Row): string {
  const firma = textOderNull(p.firma);
  if (firma) return firma;
  return (
    [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || String(p.id)
  );
}

export const darlehenApi = {
  async listDarlehen(): Promise<{ items: Darlehen[] }> {
    const [stand, gesellschaften, personen, objekte] = await Promise.all([
      supabase.from("darlehen_stand").select("*").order("id"),
      supabase.from("gesellschaften").select("id, kuerzel, name"),
      supabase.from("personen").select("id, vorname, nachname, firma"),
      supabase.from("objekte").select("id, bezeichnung"),
    ]);
    for (const res of [stand, gesellschaften, personen, objekte]) {
      if (res.error) throw res.error;
    }

    const gName = new Map(
      (gesellschaften.data ?? []).map((g: Row) => [
        String(g.id),
        String(g.name),
      ]),
    );
    const pName = new Map(
      (personen.data ?? []).map((p: Row) => [String(p.id), personName(p)]),
    );
    const oName = new Map(
      (objekte.data ?? []).map((o: Row) => [
        String(o.id),
        String(o.bezeichnung),
      ]),
    );

    const partei = (gesellschaftId: unknown, personId: unknown) => {
      if (gesellschaftId) {
        const id = String(gesellschaftId);
        return { id, name: gName.get(id) ?? id };
      }
      if (personId) {
        const id = String(personId);
        return { id, name: pName.get(id) ?? "Unbekannt" };
      }
      return { id: null, name: "–" };
    };

    const items = (stand.data ?? []).map((r: Row): Darlehen => {
      const geber = partei(r.geber_gesellschaft_id, r.geber_person_id);
      const nehmer = partei(r.nehmer_gesellschaft_id, r.nehmer_person_id);
      const objektId = textOderNull(r.objekt_id);
      return {
        id: String(r.id),
        art: r.art as Darlehen["art"],
        status: r.status as Darlehen["status"],
        geberId: geber.id,
        geberName: geber.name,
        nehmerId: nehmer.id,
        nehmerName: nehmer.name,
        objektId,
        objektBezeichnung: objektId ? (oName.get(objektId) ?? objektId) : null,
        betrag: zahl(r.betrag),
        zinsPa: zahlOderNull(r.zins_pa),
        zinsArt: (r.zins_art as Darlehen["zinsArt"]) ?? null,
        zinsbindungBis: textOderNull(r.zinsbindung_bis),
        vertragsdatum: textOderNull(r.vertragsdatum),
        ende: textOderNull(r.ende),
        tilgung: textOderNull(r.tilgung),
        rateMonatlich: zahlOderNull(r.rate_monatlich),
        tilgungMonatlich: zahlOderNull(r.tilgung_monatlich),
        nichtAbgerufen: zahlOderNull(r.nicht_abgerufen),
        saldoBank: zahlOderNull(r.saldo_bank),
        saldoAm: textOderNull(r.saldo_am),
        saldoAktuell: zahl(r.saldo_aktuell),
        rueckzahlungen: zahl(r.rueckzahlungen),
        zinsenLfdJahr: zahl(r.zinsen_lfd_jahr),
        letzteZinszahlung: textOderNull(r.letzte_zinszahlung),
        letzteBuchung: textOderNull(r.letzte_buchung),
        unklareBuchungen: zahl(r.unklare_buchungen),
        zinsenPaRechnerisch: zahlOderNull(r.zinsen_pa_rechnerisch),
        hinweis: (r.hinweis as Darlehen["hinweis"]) ?? null,
      };
    });
    return { items };
  },

  async listBuchungen(darlehenId: string): Promise<DarlehenBuchung[]> {
    const { data, error } = await supabase
      .from("darlehen_buchungen")
      .select(
        "id, darlehen_id, buchungsdatum, betrag, seite, typ, zins_anteil, tilgung_anteil, zuordnung, regel, bankbuchungen(auftraggeber_name, verwendungszweck)",
      )
      .eq("darlehen_id", darlehenId)
      .order("buchungsdatum", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Row): DarlehenBuchung => {
      const bb = (r.bankbuchungen ?? {}) as Row;
      return {
        id: String(r.id),
        darlehenId: String(r.darlehen_id),
        buchungsdatum: String(r.buchungsdatum),
        betrag: zahl(r.betrag),
        seite: r.seite as DarlehenBuchung["seite"],
        typ: r.typ as DarlehenBuchungTyp,
        zinsAnteil: zahlOderNull(r.zins_anteil),
        tilgungAnteil: zahlOderNull(r.tilgung_anteil),
        zuordnung: r.zuordnung as DarlehenBuchung["zuordnung"],
        regel: textOderNull(r.regel),
        auftraggeberName: textOderNull(bb.auftraggeber_name),
        verwendungszweck: textOderNull(bb.verwendungszweck),
      };
    });
  },

  /** Typ einer automatisch zugeordneten Buchung von Hand korrigieren. */
  async setBuchungTyp(
    buchung: DarlehenBuchung,
    typ: DarlehenBuchungTyp,
  ): Promise<void> {
    const betrag = Math.abs(buchung.betrag);
    const { error } = await supabase
      .from("darlehen_buchungen")
      .update({
        typ,
        zuordnung: "manuell",
        zins_anteil: typ === "Zinsen" ? betrag : null,
        tilgung_anteil:
          typ === "Tilgung" || typ === "Rückzahlung" ? betrag : null,
      })
      .eq("id", buchung.id);
    if (error) throw error;
  },
};
