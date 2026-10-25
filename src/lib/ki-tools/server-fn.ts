/**
 * Server-Funktionen der KI-Tools: Vorlagen ausliefern (nur angemeldet), Unterlagen aus dem
 * OneDrive-Objektordner lesen, Unterlagen mit Claude auswerten, Marktpreis-Recherche.
 * Die Dateien (PPTX/XLSX) baut der Browser, damit Fotos lokal bleiben.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";

import {
  istDateiTool,
  type DateiToolId,
  type EinschaetzungObjekt,
  type MarktpreisDaten,
  type Objekt,
  type ToolErgebnis,
  type Unterlage,
  type Vergleichsobjekt,
} from "./typen";

export const VORLAGEN = [
  "expose.pptx",
  "einschaetzung.pptx",
  "mietaufstellung.xlsx",
  "kaufpreistool.xlsx",
] as const;
export type VorlageName = (typeof VORLAGEN)[number];

function text(wert: unknown, max = 2000): string {
  return typeof wert === "string" ? wert.slice(0, max) : "";
}

export const kiVorlageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    name: text((data as { name?: unknown })?.name, 40) as VorlageName,
  }))
  .handler(async ({ data }): Promise<{ base64: string }> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    if (!VORLAGEN.includes(data.name)) throw new Error("Unbekannte Vorlage.");
    const { vorlageDataUrl } = await import("./vorlagen/inline");
    const url = vorlageDataUrl(data.name);
    return { base64: url.slice(url.indexOf(",") + 1) };
  });

const MAX_TEXT = 400_000;

function unterlagenAus(roh: unknown): Unterlage[] {
  if (!Array.isArray(roh)) return [];
  let gesamt = 0;
  const liste: Unterlage[] = [];
  for (const u of roh.slice(0, 40) as Record<string, unknown>[]) {
    const t = text(u?.text, MAX_TEXT);
    if (!t.includes("<<<PAGE")) continue;
    gesamt += t.length;
    if (gesamt > 1_200_000) break;
    liste.push({
      id: text(u?.id, 60) || `u${liste.length + 1}`,
      name: text(u?.name, 200) || "Unterlage",
      text: t,
      seiten: Number(u?.seiten) || (t.match(/<<<PAGE \d+>>>/g) ?? []).length,
    });
  }
  return liste;
}

export const kiAuswertenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const tool: DateiToolId | null =
      typeof d.tool === "string" && istDateiTool(d.tool) ? d.tool : null;
    if (!tool) throw new Error("Unbekanntes Tool.");
    return {
      supabaseAccessToken: tokenAus(data),
      tool,
      unterlagen: unterlagenAus(d.unterlagen),
      anweisung: text(d.anweisung, 6000),
      bildnamen: Array.isArray(d.bildnamen)
        ? d.bildnamen.slice(0, 60).map((b) => text(b, 200))
        : [],
      vorher: (d.vorher && typeof d.vorher === "object"
        ? d.vorher
        : null) as ToolErgebnis | null,
    };
  })
  .handler(async ({ data }): Promise<ToolErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    if (!data.unterlagen.length && !data.anweisung.trim() && !data.vorher)
      throw new Error(
        "Bitte Unterlagen hochladen, den Objektordner verbinden oder eine Anweisung schreiben.",
      );
    const { auswerten } = await import("./ki");
    return auswerten(
      {
        tool: data.tool,
        unterlagen: data.unterlagen,
        anweisung: data.anweisung,
        bildnamen: data.bildnamen,
        vorher: data.vorher?.tool === data.tool ? data.vorher : null,
      },
      null,
    );
  });

async function interneVergleiche(
  objekt: Objekt | undefined,
  o: EinschaetzungObjekt,
) {
  const { vergleichsdaten } = await import("@/lib/bewertung/server-fn");
  const { bewerte } = await import("@/lib/bewertung/rechnen");
  const { geocodeExpose } = await import("@/lib/expose-karte/geocode");
  const admin = createServiceRoleClient();
  const geo = objekt?.strasse.wert
    ? await geocodeExpose({
        adresse: objekt.strasse.wert,
        plz: objekt.plz.wert,
        stadt: objekt.ort.wert,
      }).catch(() => null)
    : null;
  const flaeche =
    (o.flaecheWohnen.wert ?? 0) + (o.flaecheGewerbe.wert ?? 0) || null;
  const erg = bewerte(
    {
      bezeichnung: o.bezeichnung,
      objektart: objekt?.objektart.wert ?? null,
      flaeche,
      jahresmiete: o.mieteJahrIst.wert,
      baujahr: null,
      einheiten: o.wohneinheiten.wert,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    },
    await vergleichsdaten(admin),
  );
  const faktor = erg.verfahren.find((v) => v.verfahren === "faktor");
  const qm = erg.verfahren.find((v) => v.verfahren === "vergleich");
  const vergleiche: Vergleichsobjekt[] = erg.vergleiche
    .filter((v) => v.km == null || v.km <= 10)
    .sort((a, b) =>
      a.preisart === b.preisart
        ? (a.km ?? 99) - (b.km ?? 99)
        : a.preisart === "kauf"
          ? -1
          : 1,
    )
    .slice(0, 3)
    .map((v) => ({
      adresse: [v.adresse, v.ort].filter(Boolean).join(", ") || v.quelle,
      objektart: v.objektart ?? "",
      flaeche: v.flaeche,
      mieteJahr: v.jahresmiete,
      preis: v.kaufpreis,
      preisart: v.preisart,
      datum: v.stichtag,
      einordnung: [
        v.km != null ? `${v.km.toFixed(1).replace(".", ",")} km entfernt` : "",
        v.stichtag ? `Stand ${v.stichtag.slice(0, 7)}` : "",
      ].filter(Boolean),
      beleg: {
        art: "berechnung" as const,
        hinweis: `Grenz-Vergleichsdaten: ${v.quelle}`,
      },
      geprueft: true,
    }));
  return {
    anzahl: erg.vergleiche.length,
    faktor: faktor ? faktor.kennwert : null,
    preisM2: qm ? qm.kennwert : null,
    vergleiche,
  };
}

export const kiMarktpreisRechercheFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      supabaseAccessToken: tokenAus(data),
      daten: d.daten as MarktpreisDaten & { objekte: EinschaetzungObjekt[] },
      anweisung: text(d.anweisung, 6000),
      websuche: d.websuche !== false,
    };
  })
  .handler(async ({ data }): Promise<ToolErgebnis<"marktpreis">> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    if (!data.daten?.objekte?.length)
      throw new Error("Keine Liegenschaft für die Recherche.");
    const erstes = data.daten.objekte[0];
    const intern = await interneVergleiche(erstes.objekt, erstes).catch(
      () => null,
    );
    const { marktpreisRecherche } = await import("./ki");
    const r = await marktpreisRecherche(
      data.daten,
      intern,
      data.anweisung,
      data.websuche,
    );
    return {
      tool: "marktpreis",
      daten: r.daten,
      hinweise: r.hinweise,
      verworfen: r.verworfen,
    };
  });

export type OrdnerDatei = {
  id: string;
  name: string;
  groesse: number;
  pfad: string;
};

/** Dateien eines OneDrive-Ordners samt Unterordnern (2 Ebenen). */
export const kiOrdnerDateienFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    itemId: text((data as { itemId?: unknown })?.itemId, 200),
  }))
  .handler(async ({ data }): Promise<OrdnerDatei[]> => {
    const { microsoftOneDriveKinderLesen } =
      await import("@/lib/microsoft/ablage");
    const dateien: OrdnerDatei[] = [];
    const lesen = async (itemId: string, pfad: string, tiefe: number) => {
      const { items } = await microsoftOneDriveKinderLesen({
        supabaseAccessToken: data.supabaseAccessToken,
        itemId,
        frisch: true,
      });
      for (const it of items) {
        if (it.istOrdner) {
          if (tiefe < 2) await lesen(it.id, `${pfad}${it.name}/`, tiefe + 1);
        } else
          dateien.push({
            id: it.id,
            name: it.name,
            groesse: it.groesse,
            pfad: `${pfad}${it.name}`,
          });
        if (dateien.length >= 150) return;
      }
    };
    await lesen(data.itemId, "", 0);
    return dateien;
  });

export type OrdnerInhalt =
  | { art: "text"; name: string; text: string; seiten: number }
  | { art: "bild"; name: string; base64: string; mime: string }
  | { art: "leer"; name: string; grund: string };

const BILD = /\.(jpe?g|png)$/i;

/** Eine Datei aus dem Objektordner: Text mit Seitenmarken oder Bild (max. 3 MB). */
export const kiOrdnerDateiFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    itemId: text((data as { itemId?: unknown })?.itemId, 200),
    name: text((data as { name?: unknown })?.name, 300),
  }))
  .handler(async ({ data }): Promise<OrdnerInhalt> => {
    const { microsoftCallerAusJwt } =
      await import("@/lib/microsoft/supabase-admin");
    await microsoftCallerAusJwt(data.supabaseAccessToken);
    const { microsoftAccessToken } = await import("@/lib/microsoft/postfach");
    const { microsoftOneDriveUser } = await import("@/lib/microsoft/ablage");
    const { graphDriveDateiInhalt } = await import("@/lib/microsoft/graph");
    const { accessToken } = await microsoftAccessToken();
    const bytes = await graphDriveDateiInhalt(
      accessToken,
      microsoftOneDriveUser(),
      data.itemId,
    );
    if (BILD.test(data.name)) {
      if (bytes.byteLength > 3_000_000)
        return {
          art: "leer",
          name: data.name,
          grund: "Bild größer als 3 MB, bitte direkt hochladen.",
        };
      return {
        art: "bild",
        name: data.name,
        base64: Buffer.from(bytes).toString("base64"),
        mime: /\.png$/i.test(data.name) ? "image/png" : "image/jpeg",
      };
    }
    const { unterlageAusBytes } = await import("./unterlagen-server");
    const u = await unterlageAusBytes(data.name, bytes);
    return u
      ? { art: "text", name: data.name, text: u.text, seiten: u.seiten }
      : { art: "leer", name: data.name, grund: "Kein auslesbarer Text." };
  });
