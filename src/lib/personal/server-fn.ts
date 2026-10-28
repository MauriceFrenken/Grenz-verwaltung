/**
 * Server-Funktionen des Personalbereichs. Die Tabellen sind nur über die Service Role
 * erreichbar; hier wird entschieden, wer was sieht: Personalverantwortliche (Geschäftsführung,
 * Administratoren, Manager) alles, alle anderen die eigene Akte, ihre eigenen Abwesenheiten
 * und im Teamkalender bei Kollegen nur „abwesend“ ohne vertraulichen Grund.
 */

import { createServerFn } from "@tanstack/react-start";

import { alleSeiten } from "@/lib/server/alle-seiten";
import { createServiceRoleClient, tokenAus } from "@/lib/server/aufrufer";
import { stattgefundenZeilen } from "@/lib/sf-sync/zaehlen";

import { datum, kontext, pruefe, text, url, zahl } from "./hilfen.server";
import { STANDARD_CHECKLISTEN } from "./berechnen";
import {
  ABWESENHEITSARTEN,
  SCHULUNGSARTEN,
  VERTRAGSARTEN,
  VERTRAULICHE_ARTEN,
  type Abwesenheit,
  type Abwesenheitsart,
  type AppBenutzer,
  type Checkpunkt,
  type Jahreswert,
  type LeistungDto,
  type LeistungZeile,
  type Mitarbeiter,
  type PersonalAktion,
  type PersonalDto,
  type Schulung,
  type SfNutzer,
} from "./typen";

type Roh = Record<string, unknown>;
type Admin = ReturnType<typeof createServiceRoleClient>;

function zuMitarbeiter(z: Roh, vollstaendig: boolean): Mitarbeiter {
  const basis = {
    id: String(z.id),
    profilId: text(z.profil_id),
    name: String(z.name),
    email: text(z.email),
    telefon: text(z.telefon),
    position: text(z.position),
  };
  if (!vollstaendig)
    return {
      ...basis,
      vertragsart: null,
      wochenstunden: null,
      urlaubstageJahr: null,
      eintrittAm: null,
      probezeitBis: null,
      austrittAm: datum(z.austritt_am),
      geburtstag: null,
      notfallkontakt: null,
      sfUserId: null,
      weiterbildungspflichtig: false,
      personalakteUrl: null,
      notizen: null,
      vollstaendig: false,
    };
  return {
    ...basis,
    vertragsart:
      (text(z.vertragsart) as Mitarbeiter["vertragsart"]) ?? "vollzeit",
    wochenstunden: zahl(z.wochenstunden),
    urlaubstageJahr: zahl(z.urlaubstage_jahr),
    eintrittAm: datum(z.eintritt_am),
    probezeitBis: datum(z.probezeit_bis),
    austrittAm: datum(z.austritt_am),
    geburtstag: datum(z.geburtstag),
    notfallkontakt: text(z.notfallkontakt),
    sfUserId: text(z.sf_user_id),
    weiterbildungspflichtig: z.weiterbildungspflichtig !== false,
    personalakteUrl: text(z.personalakte_url),
    notizen: text(z.notizen),
    vollstaendig: true,
  };
}

function zuAbwesenheit(z: Roh, sichtbar: boolean): Abwesenheit {
  const art = String(z.art) as Abwesenheitsart;
  return {
    id: String(z.id),
    mitarbeiterId: String(z.mitarbeiter_id),
    art: sichtbar || !VERTRAULICHE_ARTEN.includes(art) ? art : null,
    von: String(z.von),
    bis: String(z.bis),
    halbtag: z.halbtag === true,
    status: String(z.status) as Abwesenheit["status"],
    notiz: sichtbar ? text(z.notiz) : null,
    entschiedenAm: text(z.entschieden_am),
  };
}

async function sfNutzerLaden(verknuepft: string[]): Promise<SfNutzer[]> {
  const { grenzSfUserIds } = await import("@/lib/sf-sync/config");
  const ids = [...new Set([...grenzSfUserIds(), ...verknuepft])];
  try {
    const { sfAbfrage, soqlIdListe } = await import("@/lib/sf-sync/client");
    const zeilen = await sfAbfrage(
      `SELECT Id, Name FROM User WHERE Id IN (${soqlIdListe(ids)})`,
    );
    const namen = new Map(zeilen.map((z) => [z.Id, text(z.Name) ?? z.Id]));
    return ids.map((id) => ({ id, name: namen.get(id) ?? id }));
  } catch {
    // Salesforce nicht erreichbar: IDs ohne Namen anbieten.
    return ids.map((id) => ({ id, name: id }));
  }
}

export const personalLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { jahr?: unknown };
    const jahr = Number(d.jahr);
    return {
      supabaseAccessToken: tokenAus(data),
      jahr:
        Number.isInteger(jahr) && jahr > 2000 && jahr < 2100
          ? jahr
          : new Date().getFullYear(),
    };
  })
  .handler(async ({ data }): Promise<PersonalDto> => {
    const { admin, verwalten, ichId } = await kontext(data.supabaseAccessToken);
    // Abwesenheiten mit etwas Vorlauf, damit Monatsansichten am Jahreswechsel vollständig sind.
    const von = `${data.jahr - 1}-12-01`;
    const bis = `${data.jahr + 1}-01-31`;
    // Ohne Personalrecht nur die eigenen Einträge (ohne verknüpfte Akte: keine).
    const eigene = verwalten
      ? null
      : (ichId ?? "00000000-0000-0000-0000-000000000000");

    const [
      mitarbeiter,
      abwesenheiten,
      jahreswerte,
      schulungen,
      checkpunkte,
      profile,
    ] = await Promise.all([
      admin.from("personal_mitarbeiter").select("*").order("name"),
      admin
        .from("personal_abwesenheiten")
        .select("*")
        .lte("von", bis)
        .gte("bis", von)
        .order("von"),
      eigene
        ? admin
            .from("personal_jahreswerte")
            .select("*")
            .eq("mitarbeiter_id", eigene)
            .in("jahr", [data.jahr - 1, data.jahr, data.jahr + 1])
        : admin
            .from("personal_jahreswerte")
            .select("*")
            .in("jahr", [data.jahr - 1, data.jahr, data.jahr + 1]),
      eigene
        ? admin
            .from("personal_schulungen")
            .select("*")
            .eq("mitarbeiter_id", eigene)
            .order("datum", { ascending: false })
        : admin
            .from("personal_schulungen")
            .select("*")
            .order("datum", { ascending: false }),
      eigene
        ? admin
            .from("personal_checkpunkte")
            .select("*")
            .eq("mitarbeiter_id", eigene)
            .order("reihenfolge")
        : admin.from("personal_checkpunkte").select("*").order("reihenfolge"),
      verwalten
        ? admin
            .from("profiles")
            .select("id, name, email, stellenbezeichnung")
            .order("name")
        : Promise.resolve({ data: [] as Roh[], error: null }),
    ]);

    const ma = (pruefe(mitarbeiter) as Roh[]).map((z) =>
      zuMitarbeiter(z, verwalten || String(z.id) === ichId),
    );
    const benutzer: AppBenutzer[] = (pruefe(profile) as Roh[]).map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      email: String(p.email ?? ""),
      stellenbezeichnung: String(p.stellenbezeichnung ?? ""),
    }));
    return {
      verwalten,
      ichId,
      jahr: data.jahr,
      mitarbeiter: ma,
      abwesenheiten: (pruefe(abwesenheiten) as Roh[])
        .map((z) =>
          zuAbwesenheit(z, verwalten || String(z.mitarbeiter_id) === ichId),
        )
        // Abgelehnte Anträge anderer gehen niemanden etwas an.
        .filter(
          (a) =>
            verwalten || a.mitarbeiterId === ichId || a.status !== "abgelehnt",
        ),
      jahreswerte: (pruefe(jahreswerte) as Roh[]).map(
        (z): Jahreswert => ({
          mitarbeiterId: String(z.mitarbeiter_id),
          jahr: Number(z.jahr),
          urlaubUebertrag: zahl(z.urlaub_uebertrag) ?? 0,
          provisionszielEur: zahl(z.provisionsziel_eur),
        }),
      ),
      schulungen: (pruefe(schulungen) as Roh[]).map(
        (z): Schulung => ({
          id: String(z.id),
          mitarbeiterId: String(z.mitarbeiter_id),
          art: String(z.art) as Schulung["art"],
          titel: String(z.titel),
          anbieter: text(z.anbieter),
          datum: String(z.datum),
          stunden: zahl(z.stunden),
          nachweisUrl: text(z.nachweis_url),
          notiz: text(z.notiz),
        }),
      ),
      checkpunkte: (pruefe(checkpunkte) as Roh[]).map(
        (z): Checkpunkt => ({
          id: String(z.id),
          mitarbeiterId: String(z.mitarbeiter_id),
          typ: String(z.typ) as Checkpunkt["typ"],
          punkt: String(z.punkt),
          reihenfolge: Number(z.reihenfolge ?? 0),
          erledigtAm: text(z.erledigt_am),
        }),
      ),
      benutzer,
      sfNutzer: verwalten
        ? await sfNutzerLaden(
            ma.map((m) => m.sfUserId).filter((x): x is string => Boolean(x)),
          )
        : [],
    };
  });

// ------------------------------------------------------------ Aktionen

function pflichtDatum(v: unknown, feld: string): string {
  const d = datum(v);
  if (!d) throw new Error(`${feld} fehlt.`);
  return d;
}

/** Darf der Aufrufer Daten dieses Mitarbeiters ändern? Eigene Einträge: ja, sonst nur Verwaltung. */
function darf(
  k: { verwalten: boolean; ichId: string | null },
  mitarbeiterId: string,
) {
  if (!k.verwalten && k.ichId !== mitarbeiterId)
    throw new Error("Keine Berechtigung für diese Akte.");
}

async function mitarbeiterVon(
  admin: Admin,
  tabelle: string,
  id: string,
): Promise<Roh> {
  const z = pruefe(
    await admin.from(tabelle).select("*").eq("id", id).maybeSingle(),
  ) as Roh | null;
  if (!z) throw new Error("Eintrag nicht gefunden.");
  return z;
}

export const personalAktionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { aktion?: PersonalAktion };
    if (
      !d.aktion ||
      typeof d.aktion !== "object" ||
      typeof d.aktion.typ !== "string"
    )
      throw new Error("Aktion fehlt.");
    return { supabaseAccessToken: tokenAus(data), aktion: d.aktion };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const k = await kontext(data.supabaseAccessToken, "schreiben");
    const { admin } = k;
    const a = data.aktion;

    switch (a.typ) {
      case "mitarbeiter_speichern": {
        const m = a.mitarbeiter;
        const eigene = Boolean(m.id) && m.id === k.ichId;
        if (!k.verwalten && !eigene)
          throw new Error("Nur die Geschäftsführung pflegt Mitarbeiterakten.");
        const name = text(m.name);
        if (!name) throw new Error("Name fehlt.");
        // Eigene Akte: nur Kontakt- und Notfalldaten, Vertragsdaten pflegt die Verwaltung.
        const zeile: Roh = {
          name,
          email: text(m.email),
          telefon: text(m.telefon),
          geburtstag: datum(m.geburtstag),
          notfallkontakt: text(m.notfallkontakt),
        };
        if (k.verwalten) {
          const vertragsart =
            m.vertragsart && m.vertragsart in VERTRAGSARTEN
              ? m.vertragsart
              : "vollzeit";
          Object.assign(zeile, {
            profil_id: text(m.profilId),
            position: text(m.position),
            vertragsart,
            wochenstunden: zahl(m.wochenstunden),
            urlaubstage_jahr: zahl(m.urlaubstageJahr) ?? 30,
            eintritt_am: datum(m.eintrittAm),
            probezeit_bis: datum(m.probezeitBis),
            austritt_am: datum(m.austrittAm),
            sf_user_id: text(m.sfUserId),
            weiterbildungspflichtig: m.weiterbildungspflichtig !== false,
            personalakte_url: url(m.personalakteUrl),
            notizen: text(m.notizen),
          });
        }
        if (m.id)
          pruefe(
            await admin
              .from("personal_mitarbeiter")
              .update(zeile)
              .eq("id", m.id),
          );
        else pruefe(await admin.from("personal_mitarbeiter").insert(zeile));
        break;
      }
      case "mitarbeiter_loeschen": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        pruefe(
          await admin.from("personal_mitarbeiter").delete().eq("id", a.id),
        );
        break;
      }
      case "abwesenheit_speichern": {
        const x = a.abwesenheit;
        darf(k, x.mitarbeiterId);
        if (!(x.art in ABWESENHEITSARTEN))
          throw new Error("Unbekannte Art der Abwesenheit.");
        const von = pflichtDatum(x.von, "Beginn");
        const bis = pflichtDatum(x.bis, "Ende");
        if (bis < von) throw new Error("Das Ende liegt vor dem Beginn.");
        // Urlaub und Sonderurlaub werden beantragt; Krankheit, Homeoffice usw. nur gemeldet.
        // Trägt die Verwaltung selbst ein, gilt es als genehmigt.
        const antrag = x.art === "urlaub" || x.art === "sonderurlaub";
        const status = k.verwalten || !antrag ? "genehmigt" : "beantragt";
        const zeile: Roh = {
          mitarbeiter_id: x.mitarbeiterId,
          art: x.art,
          von,
          bis,
          halbtag: x.halbtag === true && von === bis,
          notiz: text(x.notiz),
          status,
          entschieden_von:
            status === "genehmigt" && k.verwalten ? k.userId : null,
          entschieden_am:
            status === "genehmigt" && k.verwalten
              ? new Date().toISOString()
              : null,
        };
        if (x.id) {
          const alt = await mitarbeiterVon(
            admin,
            "personal_abwesenheiten",
            x.id,
          );
          darf(k, String(alt.mitarbeiter_id));
          if (!k.verwalten && alt.status === "genehmigt" && antrag)
            throw new Error(
              "Genehmigter Urlaub kann nur von der Geschäftsführung geändert werden.",
            );
          pruefe(
            await admin
              .from("personal_abwesenheiten")
              .update(zeile)
              .eq("id", x.id),
          );
        } else {
          pruefe(
            await admin
              .from("personal_abwesenheiten")
              .insert({ ...zeile, erfasst_von: k.userId }),
          );
        }
        break;
      }
      case "abwesenheit_entscheiden": {
        if (!k.verwalten)
          throw new Error("Nur die Geschäftsführung entscheidet über Anträge.");
        if (a.status !== "genehmigt" && a.status !== "abgelehnt")
          throw new Error("Ungültige Entscheidung.");
        pruefe(
          await admin
            .from("personal_abwesenheiten")
            .update({
              status: a.status,
              entschieden_von: k.userId,
              entschieden_am: new Date().toISOString(),
            })
            .eq("id", a.id),
        );
        break;
      }
      case "abwesenheit_loeschen": {
        const alt = await mitarbeiterVon(admin, "personal_abwesenheiten", a.id);
        darf(k, String(alt.mitarbeiter_id));
        if (
          !k.verwalten &&
          alt.status === "genehmigt" &&
          (alt.art === "urlaub" || alt.art === "sonderurlaub")
        )
          throw new Error(
            "Genehmigten Urlaub bitte über die Geschäftsführung stornieren.",
          );
        pruefe(
          await admin.from("personal_abwesenheiten").delete().eq("id", a.id),
        );
        break;
      }
      case "jahreswert_speichern": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        pruefe(
          await admin.from("personal_jahreswerte").upsert({
            mitarbeiter_id: a.mitarbeiterId,
            jahr: a.jahr,
            urlaub_uebertrag: zahl(a.urlaubUebertrag) ?? 0,
            provisionsziel_eur: zahl(a.provisionszielEur),
          }),
        );
        break;
      }
      case "schulung_speichern": {
        const s = a.schulung;
        darf(k, s.mitarbeiterId);
        if (!(s.art in SCHULUNGSARTEN))
          throw new Error("Unbekannte Schulungsart.");
        const titel = text(s.titel);
        if (!titel) throw new Error("Titel fehlt.");
        const zeile: Roh = {
          mitarbeiter_id: s.mitarbeiterId,
          art: s.art,
          titel,
          anbieter: text(s.anbieter),
          datum: pflichtDatum(s.datum, "Datum"),
          stunden: zahl(s.stunden),
          nachweis_url: url(s.nachweisUrl),
          notiz: text(s.notiz),
        };
        if (s.id) {
          const alt = await mitarbeiterVon(admin, "personal_schulungen", s.id);
          darf(k, String(alt.mitarbeiter_id));
          pruefe(
            await admin
              .from("personal_schulungen")
              .update(zeile)
              .eq("id", s.id),
          );
        } else {
          pruefe(
            await admin
              .from("personal_schulungen")
              .insert({ ...zeile, erfasst_von: k.userId }),
          );
        }
        break;
      }
      case "schulung_loeschen": {
        const alt = await mitarbeiterVon(admin, "personal_schulungen", a.id);
        darf(k, String(alt.mitarbeiter_id));
        pruefe(await admin.from("personal_schulungen").delete().eq("id", a.id));
        break;
      }
      case "checkliste_starten": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        const vorhanden = pruefe(
          await admin
            .from("personal_checkpunkte")
            .select("id")
            .eq("mitarbeiter_id", a.mitarbeiterId)
            .eq("typ", a.checkliste),
        ) as Roh[];
        if (vorhanden.length > 0) break;
        pruefe(
          await admin.from("personal_checkpunkte").insert(
            STANDARD_CHECKLISTEN[a.checkliste].map((punkt, i) => ({
              mitarbeiter_id: a.mitarbeiterId,
              typ: a.checkliste,
              punkt,
              reihenfolge: i + 1,
            })),
          ),
        );
        break;
      }
      case "checkpunkt_hinzufuegen": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        const punkt = text(a.punkt);
        if (!punkt) throw new Error("Text fehlt.");
        pruefe(
          await admin.from("personal_checkpunkte").insert({
            mitarbeiter_id: a.mitarbeiterId,
            typ: a.checkliste,
            punkt,
            reihenfolge: 1000,
          }),
        );
        break;
      }
      case "checkpunkt_umschalten": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        pruefe(
          await admin
            .from("personal_checkpunkte")
            .update(
              a.erledigt
                ? {
                    erledigt_am: new Date().toISOString(),
                    erledigt_von: k.userId,
                  }
                : { erledigt_am: null, erledigt_von: null },
            )
            .eq("id", a.id),
        );
        break;
      }
      case "checkpunkt_loeschen": {
        if (!k.verwalten) throw new Error("Keine Berechtigung.");
        pruefe(
          await admin.from("personal_checkpunkte").delete().eq("id", a.id),
        );
        break;
      }
      default:
        throw new Error("Unbekannte Aktion.");
    }
    return { ok: true };
  });

// ------------------------------------------------------------ Leistung aus Salesforce

const GEWONNEN = ["Invoice Paid", "Closed Won"];

export const personalLeistungFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { jahr?: unknown };
    const jahr = Number(d.jahr);
    return {
      supabaseAccessToken: tokenAus(data),
      jahr:
        Number.isInteger(jahr) && jahr > 2000 && jahr < 2100
          ? jahr
          : new Date().getFullYear(),
    };
  })
  .handler(async ({ data }): Promise<LeistungDto> => {
    const { admin, verwalten, ichId } = await kontext(data.supabaseAccessToken);
    const von = `${data.jahr}-01-01`;
    const bis = `${data.jahr}-12-31`;
    const alle = pruefe(
      await admin
        .from("personal_mitarbeiter")
        .select("id, name, sf_user_id")
        .order("name"),
    ) as Roh[];
    const sichtbar = alle.filter((m) => verwalten || String(m.id) === ichId);
    const ziele = pruefe(
      await admin
        .from("personal_jahreswerte")
        .select("mitarbeiter_id, provisionsziel_eur")
        .eq("jahr", data.jahr)
        .in(
          "mitarbeiter_id",
          sichtbar
            .map((m) => String(m.id))
            .concat("00000000-0000-0000-0000-000000000000"),
        ),
    ) as Roh[];

    const zeilen: LeistungZeile[] = await Promise.all(
      sichtbar
        .filter((m) => text(m.sf_user_id))
        .map(async (m): Promise<LeistungZeile> => {
          const sf = String(m.sf_user_id);
          const [akt, termine, mandate, deals] = await Promise.all([
            // Zeilen statt count: offene Aufgaben und doppelte E-Mails fallen in
            // stattgefundenZeilen heraus (siehe sf-sync/zaehlen.ts).
            alleSeiten<{
              sf_typ: string | null;
              art: string | null;
              status: string | null;
              betreff: string | null;
              datum: string | null;
            }>((a, b) =>
              admin
                .from("sf_aktivitaeten")
                .select("sf_typ, art, status, betreff, datum")
                .eq("owner_sf_user_id", sf)
                .gte("datum", von)
                .lte("datum", `${bis}T23:59:59Z`)
                .order("sf_id")
                .range(a, b),
            ),
            admin
              .from("sf_aktivitaeten")
              .select("sf_id", { count: "exact", head: true })
              .eq("owner_sf_user_id", sf)
              .eq("art", "Termin")
              .gte("datum", von)
              .lte("datum", `${bis}T23:59:59Z`),
            admin
              .from("sf_mandate")
              .select("sf_id", { count: "exact", head: true })
              .eq("verantwortlich_sf_user_id", sf)
              // Angelegt im Jahr; Start_date__c (beauftragt_am) ist kaum gepflegt.
              .gte("sf_daten->>CreatedDate", von)
              .lte("sf_daten->>CreatedDate", `${bis}T23:59:59Z`),
            admin
              .from("sf_deals")
              .select("betrag, sf_daten")
              .eq("owner_sf_user_id", sf)
              .in("phase", GEWONNEN)
              .gte("abschluss_am", von)
              .lte("abschluss_am", bis),
          ]);
          const d = (deals.data ?? []) as Roh[];
          const feld = (z: Roh, f: string) =>
            zahl((z.sf_daten as Roh | null)?.[f]);
          return {
            mitarbeiterId: String(m.id),
            name: String(m.name),
            sfUserId: sf,
            aktivitaeten: stattgefundenZeilen(akt).length,
            termine: termine.count ?? 0,
            mandateNeu: mandate.count ?? 0,
            abschluesse: d.length,
            provisionEur: d.reduce(
              (s, z) => s + (feld(z, "Provision_in__c") ?? 0),
              0,
            ),
            kaufpreisEur: d.reduce(
              (s, z) =>
                s +
                (feld(z, "Beurkundeter_Kaufpreis_in__c") ??
                  zahl(z.betrag) ??
                  0),
              0,
            ),
            zielEur: zahl(
              ziele.find((z) => String(z.mitarbeiter_id) === String(m.id))
                ?.provisionsziel_eur,
            ),
          };
        }),
    );
    return {
      jahr: data.jahr,
      zeilen,
      ohneSalesforce: sichtbar
        .filter((m) => !text(m.sf_user_id))
        .map((m) => String(m.name)),
    };
  });
