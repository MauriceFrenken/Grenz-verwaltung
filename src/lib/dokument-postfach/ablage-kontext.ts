/**
 * Kontext für KI: Stammdaten + schrittweise OneDrive-Ordnerwahl. Server-only.
 */
import { waehleUnterordnerSchritt, type DokumentTyp } from "@/lib/dokument-ai";
import {
  graphDriveItemKinder,
  graphDriveRootKinder,
} from "@/lib/microsoft/graph";
import {
  istAblageRootOrdner,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

const MAX_ORDNER_TIEFE = 8;
const OBJEKT_KONFIDENZ_SCHWELLE = 0.45;
const MIN_GESELLSCHAFT_ORDNER_SCORE = 12;

const GENERISCHE_NAMENS_TOKENS = new Set([
  "gmbh",
  "co",
  "kg",
  "ag",
  "und",
  "der",
  "die",
  "das",
  "gruppe",
]);

/** Allein zu schwach — „Capital“ trifft MTF und FRENKEN Capital Management. */
const SCHWACHE_NAMENS_TOKENS = new Set([
  "capital",
  "management",
  "holding",
  "immobilien",
  "investment",
  "frenken",
]);

export function normalisiereSuchtext(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ordnerSuchTokens(input: {
  objektBezeichnung?: string | null;
  strasse?: string | null;
  ort?: string | null;
  bezeichnung?: string | null;
}): string[] {
  const roh = [
    input.objektBezeichnung,
    input.strasse,
    input.bezeichnung,
    input.ort,
  ]
    .filter(Boolean)
    .join(" ");

  const norm = normalisiereSuchtext(roh);
  const tokens = new Set<string>();

  for (const teil of norm.split(/\s+/).filter((t) => t.length >= 4)) {
    tokens.add(teil);
  }

  const strassenMatch = roh.match(
    /([A-Za-zÄÖÜäöüß\-]+(?:straße|strasse|str\.?))/i,
  );
  if (strassenMatch?.[1]) {
    const strasse = normalisiereSuchtext(
      strassenMatch[1].replace(/(?:straße|strasse|str\.?)$/i, ""),
    );
    for (const teil of strasse.split(/\s+/).filter((t) => t.length >= 4)) {
      tokens.add(teil);
    }
  }

  return [...tokens];
}

function scoreObjektMatch(
  objekt: {
    bezeichnung: string;
    strasse?: string | null;
    ort?: string | null;
  },
  suchtext: string | null | undefined,
  tokens: string[],
): number {
  const norm = normalisiereSuchtext(
    [objekt.bezeichnung, objekt.strasse, objekt.ort].filter(Boolean).join(" "),
  );
  const suchNorm = normalisiereSuchtext(suchtext ?? "");
  let score = 0;

  if (suchNorm && norm === suchNorm) return 100;
  if (suchNorm && (norm.includes(suchNorm) || suchNorm.includes(norm))) {
    score += Math.min(suchNorm.length, norm.length);
  }

  for (const token of tokens) {
    if (norm.includes(token)) {
      score += token.length;
      if (token.length >= 6) score += 4;
    }
  }

  const nurOrt =
    tokens.length === 1 &&
    objekt.ort &&
    normalisiereSuchtext(objekt.ort) === tokens[0];
  if (nurOrt) score = Math.min(score, 3);

  return score;
}

/**
 * Wie gut ein OneDrive-Root-Ordner zur Gesellschaft passt.
 * Höher = besser. MTF ≠ FRENKEN Capital Management (nur „capital“ reicht nicht).
 */
export function scoreGesellschaftOrdner(
  ordnerName: string,
  gs: { name: string; kuerzel: string },
): number {
  const ordner = normalisiereSuchtext(ordnerName);
  const name = normalisiereSuchtext(gs.name);
  const kuerzel = normalisiereSuchtext(gs.kuerzel);

  if (!ordner) return 0;

  if (ordner === name) return 100;

  if (kuerzel.length >= 2 && ordner.includes(kuerzel)) {
    return kuerzel.length >= 3 ? 85 : 70;
  }

  const nameTeile = name.split(/\s+/).filter((t) => t.length >= 2);
  const stark = nameTeile.filter(
    (t) => !GENERISCHE_NAMENS_TOKENS.has(t) && !SCHWACHE_NAMENS_TOKENS.has(t),
  );
  const schwach = nameTeile.filter((t) => SCHWACHE_NAMENS_TOKENS.has(t));

  let score = 0;

  for (const t of stark) {
    if (ordner.includes(t)) score += t.length * 3;
    else return 0;
  }

  for (const t of schwach) {
    if (ordner.includes(t)) score += t.length;
  }

  if (name.includes("mtf")) {
    if (!ordner.includes("mtf")) return 0;
    score += 20;
  }

  if (name.includes("frenken")) {
    if (!ordner.includes("frenken")) return 0;
    score += 10;
  } else if (ordner.includes("frenken")) {
    score -= 40;
  }

  if (ordner.includes("mtf") && !name.includes("mtf")) {
    score -= 40;
  }

  if (stark.length === 0 && schwach.length > 0) {
    const schwachTreffer = schwach.filter((t) => ordner.includes(t)).length;
    if (schwachTreffer < schwach.length) return 0;
    score += schwachTreffer * 4;
  }

  if (name.includes("immobilien") && !ordner.includes("immobilien")) return 0;
  if (name.includes("investment") && !ordner.includes("investment")) return 0;
  if (name.includes("holding") && !ordner.includes("holding")) return 0;
  if (
    name.includes("capital") &&
    name.includes("management") &&
    !ordner.includes("management")
  ) {
    score -= 15;
  }

  return score;
}

export async function ladeStammdatenKontext(): Promise<string> {
  const admin = createServiceRoleClient();

  const [{ data: gesellschaften }, { data: objekte }] = await Promise.all([
    admin.from("v_gesellschaften").select("id,name,kuerzel").order("id"),
    admin
      .from("v_objekte")
      .select("id,bezeichnung,gesellschaft_id,gesellschaft_name,strasse,ort")
      .order("id"),
  ]);

  const gsLines = (gesellschaften ?? []).map(
    (g) => `- ${g.id}: ${g.name} (${g.kuerzel})`,
  );
  const objLines = (objekte ?? []).map(
    (o) =>
      `- ${o.id}: ${o.bezeichnung} | ${o.gesellschaft_name ?? o.gesellschaft_id} | ${o.strasse ?? ""}, ${o.ort ?? ""}`,
  );

  return [
    "Gesellschaften:",
    ...gsLines,
    "",
    "Objekte:",
    ...objLines,
  ].join("\n");
}

/** Gesellschafts-Root in OneDrive (ein Oberordner pro Gesellschaft). */
export async function findeGesellschaftRootOrdner(
  accessToken: string,
  gesellschaftId: string,
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>,
): Promise<{ id: string; pfad: string } | null> {
  const gs = gesellschaften.find((g) => g.id === gesellschaftId);
  if (!gs) return null;

  const benutzer = microsoftOneDriveUser();
  const root = await graphDriveRootKinder(accessToken, benutzer);

  let best: { id: string; pfad: string; score: number } | null = null;

  for (const item of root) {
    if (!item.istOrdner || !istAblageRootOrdner(item.name)) continue;
    const score = scoreGesellschaftOrdner(item.name, gs);
    if (score >= MIN_GESELLSCHAFT_ORDNER_SCORE && (!best || score > best.score)) {
      best = { id: item.id, pfad: item.name, score };
    }
  }

  return best ? { id: best.id, pfad: best.pfad } : null;
}

/**
 * Zielordner Ebene für Ebene ermitteln — nur innerhalb des Gesellschafts-Roots.
 * Pro Ebene eine kleine KI-Anfrage mit den direkten Unterordnern.
 */
export async function ermittleZielordnerIterativ(
  accessToken: string,
  input: {
    gesellschaftId: string;
    gesellschaftName: string;
    objektBezeichnung?: string | null;
    dokumentTyp: DokumentTyp;
    documentTitle?: string;
    mailKontext?: string;
    modelContext?: string;
  },
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>,
): Promise<{ id: string; pfad: string } | null> {
  const root = await findeGesellschaftRootOrdner(
    accessToken,
    input.gesellschaftId,
    gesellschaften,
  );
  if (!root) return null;

  const benutzer = microsoftOneDriveUser();
  let aktuell = root;

  for (let tiefe = 0; tiefe < MAX_ORDNER_TIEFE; tiefe++) {
    const kinder = await graphDriveItemKinder(accessToken, benutzer, aktuell.id);
    const ordnerNamen = kinder.filter((k) => k.istOrdner).map((k) => k.name);
    if (ordnerNamen.length === 0) break;

    const wahl = await waehleUnterordnerSchritt({
      documentTitle: input.documentTitle,
      mailKontext: input.mailKontext,
      modelContext: input.modelContext,
      dokumentTyp: input.dokumentTyp,
      gesellschaftName: input.gesellschaftName,
      objektBezeichnung: input.objektBezeichnung,
      aktuellerPfad: aktuell.pfad,
      unterordner: ordnerNamen,
    });

    if (!wahl.gewaehlterOrdner) break;

    const kind = kinder.find(
      (k) => k.istOrdner && k.name === wahl.gewaehlterOrdner,
    );
    if (!kind) break;

    aktuell = { id: kind.id, pfad: `${aktuell.pfad}/${kind.name}` };
  }

  return aktuell;
}

export function hatObjektZuordnung(
  objektText: string | null | undefined,
  konfidenz: number,
): boolean {
  const text = (objektText ?? "").trim();
  if (!text) return false;
  if (konfidenz < OBJEKT_KONFIDENZ_SCHWELLE) return false;
  return true;
}

/** @deprecated Nicht mehr für KI-Kontext — Ordnerwahl läuft iterativ pro Gesellschaft. */
export async function ladeOnedriveKontext(_accessToken: string): Promise<string> {
  return "(Ordner werden serverseitig pro Gesellschaft Ebene für Ebene ermittelt)";
}

/** Ordner-ID anhand eines Pfads wie "02_FRENKEN IMMOBILIEN GMBH/02_Finanzen" auflösen. */
export async function loeseOrdnerPfad(
  accessToken: string,
  pfad: string,
): Promise<{ id: string; pfad: string } | null> {
  const teile = pfad
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
  if (teile.length === 0) return null;

  const benutzer = microsoftOneDriveUser();
  let items = await graphDriveRootKinder(accessToken, benutzer);
  let aktuellerId: string | null = null;
  const aufgeloest: string[] = [];

  for (const teil of teile) {
    const lower = teil.toLowerCase();
    const treffer = items.find(
      (item) =>
        item.istOrdner &&
        item.name.trim().toLowerCase() === lower,
    );
    if (!treffer) {
      const fuzzy = items.find(
        (item) =>
          item.istOrdner &&
          item.name.trim().toLowerCase().includes(lower),
      );
      if (!fuzzy) return null;
      aktuellerId = fuzzy.id;
      aufgeloest.push(fuzzy.name);
      items = await graphDriveItemKinder(accessToken, benutzer, fuzzy.id);
      continue;
    }
    aktuellerId = treffer.id;
    aufgeloest.push(treffer.name);
    items = await graphDriveItemKinder(accessToken, benutzer, treffer.id);
  }

  if (!aktuellerId) return null;
  return { id: aktuellerId, pfad: aufgeloest.join("/") };
}

export function passtPfadZuGesellschaft(
  pfad: string | null | undefined,
  gesellschaftId: string | null,
  gesellschaften: Array<{ id: string; name: string; kuerzel?: string }>,
): boolean {
  if (!pfad?.trim() || !gesellschaftId) return true;
  const gs = gesellschaften.find((g) => g.id === gesellschaftId);
  if (!gs) return true;

  const rootName = pfad.split("/")[0]?.trim() ?? "";
  if (!rootName) return true;

  const score = scoreGesellschaftOrdner(rootName, {
    name: gs.name,
    kuerzel: gs.kuerzel ?? "",
  });
  return score >= MIN_GESELLSCHAFT_ORDNER_SCORE;
}

export function findeGesellschaftId(
  name: string | null | undefined,
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>,
): string | null {
  const such = (name ?? "").trim().toLowerCase();
  if (!such) return null;

  const exakt = gesellschaften.find(
    (g) =>
      g.name.toLowerCase() === such ||
      g.kuerzel.toLowerCase() === such ||
      g.id.toLowerCase() === such,
  );
  if (exakt) return exakt.id;

  let best: { id: string; score: number } | null = null;
  for (const g of gesellschaften) {
    const gn = g.name.toLowerCase();
    let score = 0;
    if (such === gn) score = 100;
    else if (such.includes(gn) || gn.includes(such)) score = Math.min(such.length, gn.length);
    else if (such.includes(g.kuerzel.toLowerCase())) score = g.kuerzel.length;

    if (such.includes("frenken") && !gn.includes("frenken")) score *= 0.5;
    if (score > 0 && (!best || score > best.score)) best = { id: g.id, score };
  }

  return best && best.score >= 4 ? best.id : null;
}

/** Objekt zuerst global per Adresse/Straße matchen — nicht von (falscher) Gesellschaft abhängig. */
export function findeObjektIdStaerkste(
  bezeichnung: string | null | undefined,
  objekte: Array<{
    id: string;
    bezeichnung: string;
    gesellschaft_id: string;
    strasse?: string | null;
    ort?: string | null;
  }>,
  gesellschaftId?: string | null,
): string | null {
  const such = (bezeichnung ?? "").trim();
  if (!such) return null;

  const tokens = ordnerSuchTokens({ objektBezeichnung: such });
  let best: { id: string; score: number } | null = null;

  for (const o of objekte) {
    let score = scoreObjektMatch(o, such, tokens);
    if (gesellschaftId && o.gesellschaft_id === gesellschaftId) score *= 1.15;

    if (score > 0 && (!best || score > best.score)) {
      best = { id: o.id, score };
    }
  }

  const strassenToken = tokens.find((t) => t.length >= 6);
  const minScore = strassenToken ? 8 : 5;
  return best && best.score >= minScore ? best.id : null;
}

export function findeObjektId(
  bezeichnung: string | null | undefined,
  gesellschaftId: string | null,
  objekte: Array<{
    id: string;
    bezeichnung: string;
    gesellschaft_id: string;
    strasse?: string | null;
    ort?: string | null;
  }>,
): string | null {
  const staerkste = findeObjektIdStaerkste(bezeichnung, objekte, gesellschaftId);
  if (staerkste) return staerkste;

  const such = (bezeichnung ?? "").trim().toLowerCase();
  if (!such) return null;

  const kandidaten = gesellschaftId
    ? objekte.filter((o) => o.gesellschaft_id === gesellschaftId)
    : objekte;

  const exakt = kandidaten.find((o) => o.bezeichnung.toLowerCase() === such);
  return exakt?.id ?? null;
}
