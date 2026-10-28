/**
 * Server-Funktionen des Recruitings. Bewerberdaten sehen und bearbeiten nur
 * Personalverantwortliche (Geschäftsführung, Administratoren, Manager). Die Tabellen sind nur
 * über die Service Role erreichbar.
 */

import { createServerFn } from "@tanstack/react-start";

import { tokenAus } from "@/lib/server/aufrufer";

import { STANDARD_CHECKLISTEN } from "./berechnen";
import {
  ABGESCHLOSSEN,
  PHASEN,
  STELLENSTATUS,
  loeschfaellig,
  type AnzeigenEntwurf,
  type Bewerber,
  type BewerberEreignis,
  type Phase,
  type RecruitingAktion,
  type RecruitingDto,
  type Stelle,
} from "./recruiting";
import { datum, kontext, pruefe, text, url, zahl } from "./hilfen.server";
import { VERTRAGSARTEN } from "./typen";

type Roh = Record<string, unknown>;

async function verwaltung(
  token: string,
  anforderung: "lesen" | "schreiben" = "lesen",
) {
  const k = await kontext(token, anforderung);
  if (!k.verwalten)
    throw new Error("Recruiting ist der Geschäftsführung vorbehalten.");
  return k;
}

/** Wie pruefe(), aber mit eigenem Hinweis, solange die Recruiting-Migration fehlt. */
function pruefeR<T>(ergebnis: {
  data: T;
  error: { message: string } | null;
}): T {
  if (
    ergebnis.error &&
    /personal_(stellen|bewerber)/i.test(ergebnis.error.message)
  )
    throw new Error(
      "Recruiting ist noch nicht eingerichtet (Datenbank-Migration fehlt).",
    );
  return pruefe(ergebnis);
}

function zuStelle(z: Roh): Stelle {
  return {
    id: String(z.id),
    titel: String(z.titel),
    standort: text(z.standort),
    vertragsart: (text(z.vertragsart) ?? "vollzeit") as Stelle["vertragsart"],
    wochenstunden: zahl(z.wochenstunden),
    startAb: datum(z.start_ab),
    status: String(z.status) as Stelle["status"],
    aufgaben: text(z.aufgaben),
    anforderungen: text(z.anforderungen),
    angebot: text(z.angebot),
    anzeigeText: text(z.anzeige_text),
    kanaele: text(z.kanaele),
    verantwortlichId: text(z.verantwortlich_id),
    erstelltAm: String(z.created_at),
  };
}

function zuBewerber(z: Roh): Bewerber {
  return {
    id: String(z.id),
    stelleId: text(z.stelle_id),
    name: String(z.name),
    email: text(z.email),
    telefon: text(z.telefon),
    quelle: text(z.quelle),
    phase: String(z.phase) as Phase,
    reihenfolge: Number(z.reihenfolge ?? 0),
    bewertung: zahl(z.bewertung),
    eingegangenAm: datum(z.eingegangen_am) ?? String(z.created_at).slice(0, 10),
    verfuegbarAb: datum(z.verfuegbar_ab),
    gehaltsvorstellung: text(z.gehaltsvorstellung),
    unterlagenUrl: text(z.unterlagen_url),
    naechsterTermin: text(z.naechster_termin),
    notizen: text(z.notizen),
    absageGrund: text(z.absage_grund),
    abgeschlossenAm: text(z.abgeschlossen_am),
    talentpoolBis: datum(z.talentpool_bis),
    mitarbeiterId: text(z.mitarbeiter_id),
  };
}

export const recruitingLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<RecruitingDto> => {
    const { admin } = await verwaltung(data.supabaseAccessToken);
    const [stellen, bewerber, ereignisse, profile] = await Promise.all([
      admin
        .from("personal_stellen")
        .select("*")
        .order("created_at", { ascending: false }),
      admin
        .from("personal_bewerber")
        .select("*")
        .order("reihenfolge")
        .order("created_at"),
      admin
        .from("personal_bewerber_ereignisse")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, name"),
    ]);
    const namen = new Map(
      (pruefe(profile) as Roh[]).map((p) => [String(p.id), text(p.name)]),
    );
    return {
      stellen: (pruefeR(stellen) as Roh[]).map(zuStelle),
      bewerber: (pruefeR(bewerber) as Roh[]).map(zuBewerber),
      ereignisse: (pruefeR(ereignisse) as Roh[]).map((z): BewerberEreignis => ({
        id: String(z.id),
        bewerberId: String(z.bewerber_id),
        art: String(z.art) as BewerberEreignis["art"],
        text: String(z.text),
        vonName: namen.get(String(z.von_id)) ?? null,
        am: String(z.created_at),
      })),
    };
  });

export const recruitingAktionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { aktion?: RecruitingAktion };
    if (
      !d.aktion ||
      typeof d.aktion !== "object" ||
      typeof d.aktion.typ !== "string"
    )
      throw new Error("Aktion fehlt.");
    return { supabaseAccessToken: tokenAus(data), aktion: d.aktion };
  })
  .handler(async ({ data }): Promise<{ ok: true; id?: string }> => {
    const k = await verwaltung(data.supabaseAccessToken, "schreiben");
    const { admin } = k;
    const a = data.aktion;

    const ereignis = async (
      bewerberId: string,
      art: BewerberEreignis["art"],
      inhalt: string,
    ) =>
      pruefeR(
        await admin.from("personal_bewerber_ereignisse").insert({
          bewerber_id: bewerberId,
          art,
          text: inhalt,
          von_id: k.userId,
        }),
      );

    const bewerberLaden = async (id: string): Promise<Bewerber> => {
      const z = pruefeR(
        await admin
          .from("personal_bewerber")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      ) as Roh | null;
      if (!z) throw new Error("Bewerber nicht gefunden.");
      return zuBewerber(z);
    };

    /** Felder, die sich beim Wechsel der Phase ändern (Abschluss für die Löschfrist). */
    const phasenFelder = (alt: Bewerber | null, phase: Phase): Roh => {
      const zu = ABGESCHLOSSEN.includes(phase);
      const warZu = alt ? ABGESCHLOSSEN.includes(alt.phase) : false;
      if (zu && !warZu) return { abgeschlossen_am: new Date().toISOString() };
      if (!zu && warZu) return { abgeschlossen_am: null, absage_grund: null };
      return {};
    };

    switch (a.typ) {
      case "stelle_speichern": {
        const s = a.stelle;
        const titel = text(s.titel);
        if (!titel) throw new Error("Titel fehlt.");
        const zeile: Roh = {
          titel,
          standort: text(s.standort),
          vertragsart:
            s.vertragsart && s.vertragsart in VERTRAGSARTEN
              ? s.vertragsart
              : "vollzeit",
          wochenstunden: zahl(s.wochenstunden),
          start_ab: datum(s.startAb),
          status: s.status && s.status in STELLENSTATUS ? s.status : "entwurf",
          aufgaben: text(s.aufgaben),
          anforderungen: text(s.anforderungen),
          angebot: text(s.angebot),
          anzeige_text: text(s.anzeigeText),
          kanaele: text(s.kanaele),
          verantwortlich_id: text(s.verantwortlichId) ?? k.userId,
        };
        if (s.id) {
          pruefeR(
            await admin.from("personal_stellen").update(zeile).eq("id", s.id),
          );
          return { ok: true, id: s.id };
        }
        const neu = pruefeR(
          await admin
            .from("personal_stellen")
            .insert(zeile)
            .select("id")
            .single(),
        ) as Roh;
        return { ok: true, id: String(neu.id) };
      }
      case "stelle_loeschen": {
        pruefeR(await admin.from("personal_stellen").delete().eq("id", a.id));
        break;
      }
      case "bewerber_speichern": {
        const b = a.bewerber;
        const name = text(b.name);
        if (!name) throw new Error("Name fehlt.");
        const phase: Phase = b.phase && b.phase in PHASEN ? b.phase : "eingang";
        const bewertung = zahl(b.bewertung);
        const zeile: Roh = {
          stelle_id: text(b.stelleId),
          name,
          email: text(b.email),
          telefon: text(b.telefon),
          quelle: text(b.quelle),
          phase,
          bewertung:
            bewertung && bewertung >= 1 && bewertung <= 5
              ? Math.round(bewertung)
              : null,
          verfuegbar_ab: datum(b.verfuegbarAb),
          gehaltsvorstellung: text(b.gehaltsvorstellung),
          unterlagen_url: url(b.unterlagenUrl),
          naechster_termin: text(b.naechsterTermin),
          notizen: text(b.notizen),
          absage_grund: phase === "abgesagt" ? text(b.absageGrund) : null,
          talentpool_bis: datum(b.talentpoolBis),
        };
        if (datum(b.eingegangenAm))
          zeile.eingegangen_am = datum(b.eingegangenAm);
        if (b.id) {
          const alt = await bewerberLaden(b.id);
          pruefeR(
            await admin
              .from("personal_bewerber")
              .update({ ...zeile, ...phasenFelder(alt, phase) })
              .eq("id", b.id),
          );
          if (alt.phase !== phase)
            await ereignis(
              b.id,
              "phase",
              `${PHASEN[alt.phase]} → ${PHASEN[phase]}`,
            );
          if (
            zeile.naechster_termin &&
            zeile.naechster_termin !== alt.naechsterTermin
          )
            await ereignis(b.id, "termin", "Termin vereinbart");
          return { ok: true, id: b.id };
        }
        const neu = pruefeR(
          await admin
            .from("personal_bewerber")
            .insert({ ...zeile, ...phasenFelder(null, phase) })
            .select("id")
            .single(),
        ) as Roh;
        await ereignis(String(neu.id), "phase", "Bewerbung erfasst");
        return { ok: true, id: String(neu.id) };
      }
      case "bewerber_verschieben": {
        if (!(a.phase in PHASEN)) throw new Error("Unbekannte Phase.");
        const alt = await bewerberLaden(a.id);
        if (alt.phase !== a.phase) {
          pruefeR(
            await admin
              .from("personal_bewerber")
              .update({
                phase: a.phase,
                ...phasenFelder(alt, a.phase),
                ...(a.phase === "abgesagt"
                  ? { absage_grund: text(a.absageGrund) }
                  : {}),
              })
              .eq("id", a.id),
          );
          await ereignis(
            a.id,
            "phase",
            `${PHASEN[alt.phase]} → ${PHASEN[a.phase]}${
              a.phase === "abgesagt" && text(a.absageGrund)
                ? ` (${text(a.absageGrund)})`
                : ""
            }`,
          );
        }
        if (Array.isArray(a.reihe))
          await Promise.all(
            a.reihe.map((id, i) =>
              admin
                .from("personal_bewerber")
                .update({ reihenfolge: i + 1 })
                .eq("id", id)
                .eq("phase", a.phase),
            ),
          );
        break;
      }
      case "bewerber_notiz": {
        const t = text(a.text);
        if (!t) throw new Error("Notiz ist leer.");
        await bewerberLaden(a.id);
        await ereignis(a.id, "notiz", t);
        break;
      }
      case "bewerber_loeschen": {
        pruefeR(await admin.from("personal_bewerber").delete().eq("id", a.id));
        break;
      }
      case "bewerber_loeschen_faellig": {
        const heute = new Date().toISOString().slice(0, 10);
        const alle = (
          pruefeR(
            await admin
              .from("personal_bewerber")
              .select("*")
              .in("phase", ABGESCHLOSSEN),
          ) as Roh[]
        ).map(zuBewerber);
        const ids = alle
          .filter((b) => loeschfaellig(b, heute))
          .map((b) => b.id);
        if (ids.length)
          pruefeR(await admin.from("personal_bewerber").delete().in("id", ids));
        break;
      }
      case "bewerber_einstellen": {
        const b = await bewerberLaden(a.id);
        if (b.mitarbeiterId)
          throw new Error("Für diesen Bewerber gibt es schon eine Akte.");
        const stelle = b.stelleId
          ? (pruefeR(
              await admin
                .from("personal_stellen")
                .select("titel")
                .eq("id", b.stelleId)
                .maybeSingle(),
            ) as Roh | null)
          : null;
        const ma = pruefe(
          await admin
            .from("personal_mitarbeiter")
            .insert({
              name: b.name,
              email: b.email,
              telefon: b.telefon,
              position: text(a.position) ?? text(stelle?.titel),
              vertragsart:
                a.vertragsart in VERTRAGSARTEN ? a.vertragsart : "vollzeit",
              wochenstunden: zahl(a.wochenstunden),
              eintritt_am: datum(a.eintrittAm) ?? b.verfuegbarAb,
              notizen: `Aus dem Recruiting übernommen am ${new Date().toLocaleDateString("de-DE")}.`,
            })
            .select("id")
            .single(),
        ) as Roh;
        const maId = String(ma.id);
        pruefe(
          await admin.from("personal_checkpunkte").insert(
            STANDARD_CHECKLISTEN.onboarding.map((punkt, i) => ({
              mitarbeiter_id: maId,
              typ: "onboarding",
              punkt,
              reihenfolge: i + 1,
            })),
          ),
        );
        pruefeR(
          await admin
            .from("personal_bewerber")
            .update({
              mitarbeiter_id: maId,
              phase: "eingestellt",
              ...phasenFelder(b, "eingestellt"),
            })
            .eq("id", b.id),
        );
        await ereignis(
          b.id,
          "phase",
          "Eingestellt: Mitarbeiterakte und Onboarding-Checkliste angelegt",
        );
        if (b.stelleId)
          await admin
            .from("personal_stellen")
            .update({ status: "besetzt" })
            .eq("id", b.stelleId);
        return { ok: true, id: maId };
      }
      default:
        throw new Error("Unbekannte Aktion.");
    }
    return { ok: true };
  });

export const stellenanzeigeEntwerfenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { stelle?: Partial<Stelle> };
    if (!d.stelle || !text(d.stelle.titel))
      throw new Error("Bitte zuerst den Stellentitel eintragen.");
    return { supabaseAccessToken: tokenAus(data), stelle: d.stelle };
  })
  .handler(async ({ data }): Promise<AnzeigenEntwurf> => {
    await verwaltung(data.supabaseAccessToken, "schreiben");
    const { anzeigeEntwerfen } = await import("./recruiting-ki");
    return anzeigeEntwerfen(data.stelle);
  });
