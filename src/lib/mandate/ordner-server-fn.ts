/**
 * Server-Funktionen Objektordner der Mandatsakte: Ordner in der Objektablage finden,
 * Unterlagen einordnen und den KI-Steckbrief erstellen. Die Tabelle mandat_ordner ist
 * optional: ohne sie gibt es keine feste Verknüpfung und keinen gespeicherten Steckbrief.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  besteOrdner,
  dateienFuerSteckbrief,
  kategorieFuer,
  KATEGORIEN,
  type MandatAdresse,
  type OrdnerDatei,
  type OrdnerKandidat,
  type UnterlagenKategorie,
} from "./ordner";
import type { Steckbrief, SteckbriefUnterlage } from "./steckbrief-ki";

type Admin = ReturnType<typeof createServiceRoleClient>;

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

export type OrdnerTreffer = OrdnerKandidat & { score: number };

export type MandatOrdnerDto = {
  eingerichtet: boolean;
  fehler: string | null;
  /** Link zur Admin-Freigabe im Microsoft-Konto der Ablage, wenn sie fehlt. */
  freigabeUrl: string | null;
  ordner: (OrdnerKandidat & { quelle: "verknuepft" | "automatisch" }) | null;
  /** Weitere passende Ordner (zum Umstellen). */
  kandidaten: OrdnerTreffer[];
  dateien: OrdnerDatei[];
  unterlagen: {
    kategorie: UnterlagenKategorie;
    label: string;
    pflicht: boolean;
    anzahl: number;
  }[];
  steckbrief: Steckbrief | null;
  /** Ist die Tabelle für Verknüpfung und Steckbrief vorhanden? */
  speichernMoeglich: boolean;
};

type OrdnerZeile = {
  item_id: string | null;
  name: string | null;
  web_url: string | null;
  steckbrief: Steckbrief | null;
};

/** Gespeicherte Zeile; null, wenn keine da ist oder die Tabelle fehlt. */
async function gespeichert(
  admin: Admin,
  mandatSfId: string,
): Promise<{ zeile: OrdnerZeile | null; tabelle: boolean }> {
  const { data, error } = await admin
    .from("mandat_ordner")
    .select("item_id, name, web_url, steckbrief")
    .eq("mandat_sf_id", mandatSfId)
    .maybeSingle();
  if (error) {
    // 42P01 / PGRST205: Tabelle noch nicht angelegt (Migration offen).
    if (
      /42P01|PGRST205|does not exist|schema cache/i.test(
        `${error.code} ${error.message}`,
      )
    )
      return { zeile: null, tabelle: false };
    throw new Error(error.message);
  }
  return { zeile: (data as OrdnerZeile | null) ?? null, tabelle: true };
}

async function mandatAdresse(
  admin: Admin,
  mandatSfId: string,
): Promise<MandatAdresse & { titel: string }> {
  const { data: m, error } = await admin
    .from("sf_mandate")
    .select("name, real_estate_sf_id")
    .eq("sf_id", mandatSfId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) throw new Error("Mandat nicht gefunden.");
  const o = m.real_estate_sf_id
    ? (
        await admin
          .from("sf_real_estate")
          .select("name, strasse, plz, ort")
          .eq("sf_id", m.real_estate_sf_id)
          .maybeSingle()
      ).data
    : null;
  const strasse = (o?.strasse as string) || (o?.name as string) || null;
  return {
    strasse,
    plz: (o?.plz as string) ?? null,
    ort: (o?.ort as string) ?? null,
    mandatName: (m.name as string) ?? null,
    titel: [strasse, o?.ort].filter(Boolean).join(", ") || String(m.name),
  };
}

let kandidatenCache: { liste: OrdnerKandidat[]; bis: number } | null = null;

/** Ordner bis zur zweiten Ebene der Ablage (z. B. „Mandate/Düsseldorf_…“), 5 Minuten gemerkt. */
async function ordnerKandidaten(): Promise<OrdnerKandidat[]> {
  if (kandidatenCache && kandidatenCache.bis > Date.now())
    return kandidatenCache.liste;
  const liste = await ordnerKandidatenLesen();
  kandidatenCache = { liste, bis: Date.now() + 5 * 60_000 };
  return liste;
}

async function ordnerKandidatenLesen(): Promise<OrdnerKandidat[]> {
  const { objektAblageZugang, ablageKinder } =
    await import("@/lib/microsoft/objekt-ablage");
  const z = await objektAblageZugang();
  const ebene1 = (await ablageKinder(z, z.wurzel.id)).filter(
    (e) => e.istOrdner,
  );
  const kandidaten: OrdnerKandidat[] = ebene1.map((e) => ({
    id: e.id,
    name: e.name,
    pfad: z.wurzel.name,
    webUrl: e.webUrl,
    geaendertAm: e.geaendertAm,
  }));
  // Gruppierungsordner (ohne Hausnummer im Namen) eine Ebene tiefer ansehen.
  const gruppen = ebene1.filter((e) => !/\d/.test(e.name)).slice(0, 25);
  const tiefer = await Promise.all(
    gruppen.map(async (g) =>
      (await ablageKinder(z, g.id))
        .filter((e) => e.istOrdner)
        .map((e) => ({
          id: e.id,
          name: e.name,
          pfad: `${z.wurzel.name}/${g.name}`,
          webUrl: e.webUrl,
          geaendertAm: e.geaendertAm,
        })),
    ),
  );
  return [...kandidaten, ...tiefer.flat()];
}

/** Alle Dateien im Objektordner, bis drei Ebenen tief, höchstens 500. */
async function ordnerDateien(ordnerId: string): Promise<OrdnerDatei[]> {
  const { objektAblageZugang, ablageKinder } =
    await import("@/lib/microsoft/objekt-ablage");
  const z = await objektAblageZugang();
  const dateien: OrdnerDatei[] = [];
  let ebene: { id: string; pfad: string }[] = [{ id: ordnerId, pfad: "" }];
  for (
    let tiefe = 0;
    tiefe < 3 && ebene.length && dateien.length < 500;
    tiefe++
  ) {
    const naechste: { id: string; pfad: string }[] = [];
    const inhalte = await Promise.all(
      ebene
        .slice(0, 40)
        .map(async (o) => ({ o, kinder: await ablageKinder(z, o.id) })),
    );
    for (const { o, kinder } of inhalte) {
      for (const k of kinder) {
        if (k.istOrdner) {
          naechste.push({
            id: k.id,
            pfad: o.pfad ? `${o.pfad}/${k.name}` : k.name,
          });
        } else if (dateien.length < 500) {
          dateien.push({
            id: k.id,
            name: k.name,
            unterordner: o.pfad,
            groesse: k.groesse,
            geaendertAm: k.geaendertAm,
            webUrl: k.webUrl,
            kategorie: kategorieFuer(k.name, o.pfad),
          });
        }
      }
    }
    ebene = naechste;
  }
  return dateien.sort((a, b) =>
    (b.geaendertAm ?? "").localeCompare(a.geaendertAm ?? ""),
  );
}

function unterlagenUebersicht(
  dateien: OrdnerDatei[],
): MandatOrdnerDto["unterlagen"] {
  return KATEGORIEN.map((k) => ({
    kategorie: k.id,
    label: k.label,
    pflicht: k.pflicht,
    anzahl: dateien.filter((d) => d.kategorie === k.id).length,
  }));
}

/** Objektordner, Dateien und gespeicherter Steckbrief eines Mandats (ohne Rechteprüfung). */
export async function mandatOrdnerLaden(
  admin: Admin,
  mandatSfId: string,
): Promise<MandatOrdnerDto> {
  const { objektAblageKonfiguriert } =
    await import("@/lib/microsoft/objekt-ablage");
  const [{ zeile, tabelle }, adresse] = await Promise.all([
    gespeichert(admin, mandatSfId),
    mandatAdresse(admin, mandatSfId),
  ]);
  const leer: MandatOrdnerDto = {
    eingerichtet: objektAblageKonfiguriert(),
    fehler: null,
    freigabeUrl: null,
    ordner: null,
    kandidaten: [],
    dateien: [],
    unterlagen: unterlagenUebersicht([]),
    steckbrief: zeile?.steckbrief ?? null,
    speichernMoeglich: tabelle,
  };
  if (!leer.eingerichtet) return leer;

  try {
    const kandidaten = besteOrdner(await ordnerKandidaten(), adresse);
    let ordner: MandatOrdnerDto["ordner"] = null;
    if (zeile?.item_id) {
      const bekannt = kandidaten.find((k) => k.id === zeile.item_id);
      ordner = {
        id: zeile.item_id,
        name: bekannt?.name ?? zeile.name ?? "Verknüpfter Ordner",
        pfad: bekannt?.pfad ?? null,
        webUrl: bekannt?.webUrl ?? zeile.web_url,
        geaendertAm: bekannt?.geaendertAm ?? null,
        quelle: "verknuepft",
      };
    } else if (kandidaten[0]) {
      ordner = { ...kandidaten[0], quelle: "automatisch" };
    }
    const dateien = ordner ? await ordnerDateien(ordner.id) : [];
    return {
      ...leer,
      ordner,
      kandidaten: kandidaten.filter((k) => k.id !== ordner?.id).slice(0, 5),
      dateien,
      unterlagen: unterlagenUebersicht(dateien),
    };
  } catch (e) {
    const fehler =
      e instanceof Error ? e.message : "Objektablage nicht erreichbar.";
    const { objektAblageFreigabeUrl } =
      await import("@/lib/microsoft/objekt-ablage");
    return {
      ...leer,
      fehler,
      freigabeUrl: /Admin-Consent|Kein Zugriff|nicht freigegeben/i.test(fehler)
        ? objektAblageFreigabeUrl()
        : null,
    };
  }
}

export const mandatOrdnerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { mandatSfId?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
    };
  })
  .handler(async ({ data }): Promise<MandatOrdnerDto> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return mandatOrdnerLaden(createServiceRoleClient(), data.mandatSfId);
  });

/** Ordner fest verknüpfen; itemId null stellt auf automatische Suche zurück. */
export const mandatOrdnerVerknuepfenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { mandatSfId?: unknown; itemId?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
      itemId: d.itemId == null ? null : text(d.itemId, 200),
    };
  })
  .handler(async ({ data }) => {
    const { userId } = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    const admin = createServiceRoleClient();
    let name: string | null = null;
    let webUrl: string | null = null;
    if (data.itemId) {
      const { objektAblageZugang, ablageElement } =
        await import("@/lib/microsoft/objekt-ablage");
      const e = await ablageElement(await objektAblageZugang(), data.itemId);
      if (!e.istOrdner) throw new Error("Bitte einen Ordner wählen.");
      name = e.name;
      webUrl = e.webUrl;
    }
    const { error } = await admin.from("mandat_ordner").upsert({
      mandat_sf_id: data.mandatSfId,
      item_id: data.itemId,
      name,
      web_url: webUrl,
      verknuepft_von: userId === "cron" ? null : userId,
      verknuepft_am: new Date().toISOString(),
      steckbrief: null,
      steckbrief_am: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BLATT_ZEILEN = 400;

async function unterlageLesen(
  d: OrdnerDatei,
  bytes: Uint8Array,
): Promise<{ unterlage: SteckbriefUnterlage | null; hinweis: string | null }> {
  if (/\.pdf$/i.test(d.name)) {
    const { extrahierePdfText } = await import("@/lib/postfach/pdf-text");
    const pdf = await extrahierePdfText(bytes);
    const zeichen = pdf.pages.reduce((s, p) => s + p.text.length, 0);
    if (zeichen < 200)
      return { unterlage: null, hinweis: "kein Text lesbar (vermutlich Scan)" };
    return {
      unterlage: {
        id: d.id,
        name: d.name,
        webUrl: d.webUrl,
        text: pdf.pages
          .map((p) => `<<<PAGE ${p.pageNumber}>>>\n${p.text}`)
          .join("\n"),
      },
      hinweis: `${pdf.seiten} Seiten`,
    };
  }
  if (/\.(xlsx|xlsm|xls)$/i.test(d.name)) {
    const XLSX = await import("xlsx");
    const mappe = XLSX.read(bytes, { type: "array" });
    const blaetter = mappe.SheetNames.slice(0, 12);
    const text = blaetter
      .map((n, i) => {
        const csv = XLSX.utils.sheet_to_csv(mappe.Sheets[n], {
          blankrows: false,
          FS: " | ",
        });
        return `<<<PAGE ${i + 1}>>>\n[Blatt ${n}]\n${csv.split("\n").slice(0, BLATT_ZEILEN).join("\n")}`;
      })
      .join("\n");
    return {
      unterlage: { id: d.id, name: d.name, webUrl: d.webUrl, text, blaetter },
      hinweis: `${blaetter.length} Tabellenblätter`,
    };
  }
  const t = new TextDecoder().decode(bytes).slice(0, 200_000);
  return {
    unterlage: {
      id: d.id,
      name: d.name,
      webUrl: d.webUrl,
      text: `<<<PAGE 1>>>\n${t}`,
    },
    hinweis: null,
  };
}

/** Liest die wichtigsten Unterlagen des Ordners, erstellt den Steckbrief und speichert ihn. */
export async function steckbriefErzeugen(
  admin: Admin,
  mandatSfId: string,
  ordnerId: string,
): Promise<Steckbrief> {
  if (!ordnerId) throw new Error("Kein Objektordner gefunden.");
  const adresse = await mandatAdresse(admin, mandatSfId);
  const { objektAblageZugang, ablageDateiInhalt } =
    await import("@/lib/microsoft/objekt-ablage");
  const z = await objektAblageZugang();
  const auswahl = dateienFuerSteckbrief(await ordnerDateien(ordnerId));
  if (!auswahl.length)
    throw new Error("Im Ordner liegen keine lesbaren Unterlagen (PDF, Excel).");

  const gelesen = await Promise.all(
    auswahl.map(async (d) => {
      try {
        return {
          d,
          ...(await unterlageLesen(d, await ablageDateiInhalt(z, d.id))),
        };
      } catch (e) {
        return {
          d,
          unterlage: null,
          hinweis: e instanceof Error ? e.message : "nicht lesbar",
        };
      }
    }),
  );
  const unterlagen = gelesen.flatMap((g) => (g.unterlage ? [g.unterlage] : []));
  if (!unterlagen.length)
    throw new Error("Keine der Unterlagen enthält lesbaren Text.");

  const { steckbriefErstellen } = await import("./steckbrief-ki");
  const steckbrief = await steckbriefErstellen({
    objekt: adresse.titel,
    unterlagen,
    hinweise: gelesen.map((g) => ({
      datei: g.d.name,
      webUrl: g.d.webUrl,
      hinweis: g.hinweis,
    })),
  });

  const { tabelle } = await gespeichert(admin, mandatSfId);
  if (tabelle) {
    await admin.from("mandat_ordner").upsert(
      {
        mandat_sf_id: mandatSfId,
        steckbrief,
        steckbrief_am: steckbrief.erstelltAm,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mandat_sf_id" },
    );
  }
  return steckbrief;
}

export const mandatSteckbriefFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { mandatSfId?: unknown; ordnerId?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      mandatSfId: text(d.mandatSfId, 18),
      ordnerId: text(d.ordnerId, 200),
    };
  })
  .handler(async ({ data }): Promise<Steckbrief> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    return steckbriefErzeugen(
      createServiceRoleClient(),
      data.mandatSfId,
      data.ordnerId,
    );
  });
