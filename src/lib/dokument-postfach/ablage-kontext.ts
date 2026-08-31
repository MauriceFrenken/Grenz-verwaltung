/**
 * Kontext für KI: Stammdaten + OneDrive-Ordnerbaum. Server-only.
 */
import {
  graphDriveItemKinder,
  graphDriveRootKinder,
} from "@/lib/microsoft/graph";
import {
  istAblageRootOrdner,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

const MAX_ROOT = 8;
const MAX_KINDER = 25;
const MAX_ENKEL = 15;
const MAX_OBJEKT_PFADE = 180;
const MAX_OBJEKT_TIEFE = 8;

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

function ordnerNameScore(name: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const norm = normalisiereSuchtext(name);
  let score = 0;
  for (const token of tokens) {
    if (norm.includes(token)) score += token.length;
  }
  if (/^im-/i.test(name)) score += 2;
  return score;
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

async function sammleObjektOrdnerPfade(
  accessToken: string,
  benutzer: string,
  itemId: string,
  prefix: string,
  tiefe: number,
  pfade: string[],
): Promise<void> {
  if (pfade.length >= MAX_OBJEKT_PFADE || tiefe >= MAX_OBJEKT_TIEFE) return;

  const kinder = await graphDriveItemKinder(accessToken, benutzer, itemId);
  for (const kind of kinder.filter((k) => k.istOrdner)) {
    if (pfade.length >= MAX_OBJEKT_PFADE) break;
    const pfad = `${prefix}/${kind.name}`;
    pfade.push(pfad);

    const n = kind.name.toLowerCase();
    const tiefer =
      /^im-/.test(kind.name) ||
      /bestand|ankauf|verkauf|projekte|stammdaten|vertraege|finanzen|technik|mieter|archiv/i.test(
        n,
      );
    if (tiefer) {
      await sammleObjektOrdnerPfade(
        accessToken,
        benutzer,
        kind.id,
        pfad,
        tiefe + 1,
        pfade,
      );
    }
  }
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

/** Kompakter Baum für KI + tiefe Objektordner-Pfade (getrennt, damit Stammdaten nicht verdrängt werden). */
export async function ladeOnedriveKontext(accessToken: string): Promise<string> {
  const benutzer = microsoftOneDriveUser();
  const root = await graphDriveRootKinder(accessToken, benutzer);
  const gesellschaftsOrdner = root
    .filter((item) => item.istOrdner && istAblageRootOrdner(item.name))
    .slice(0, MAX_ROOT);

  const baum: string[] = [];
  const objektPfade: string[] = [];

  for (const ordner of gesellschaftsOrdner) {
    baum.push(ordner.name);
    const kinder = await graphDriveItemKinder(accessToken, benutzer, ordner.id);
    const unterordner = kinder.filter((k) => k.istOrdner).slice(0, MAX_KINDER);

    for (const kind of unterordner) {
      baum.push(`  ${kind.name}`);
      const enkel = await graphDriveItemKinder(accessToken, benutzer, kind.id);
      for (const e of enkel.filter((x) => x.istOrdner).slice(0, MAX_ENKEL)) {
        baum.push(`    ${e.name}`);

        const immobilienAst =
          /immobilien/i.test(kind.name) && /bestand|ankauf|verkauf|projekte/i.test(e.name);
        if (immobilienAst && objektPfade.length < MAX_OBJEKT_PFADE) {
          await sammleObjektOrdnerPfade(
            accessToken,
            benutzer,
            e.id,
            `${ordner.name}/${kind.name}/${e.name}`,
            0,
            objektPfade,
          );
        }
      }
    }
  }

  const teile = [
    "Übersicht (3 Ebenen):",
    baum.length > 0 ? baum.join("\n") : "(keine Ordner gefunden)",
  ];
  if (objektPfade.length > 0) {
    teile.push("", "Objektordner (volle Pfade — für ordnerPfad bevorzugen):", objektPfade.join("\n"));
  }
  return teile.join("\n");
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

/**
 * Von einem Basisordner aus den tiefsten passenden Unterordner finden
 * (nur innerhalb des gewählten Pfads — kein Sprung in andere Gesellschaften).
 */
export async function verfeinereOrdnerPfad(
  accessToken: string,
  basis: { id: string; pfad: string },
  suchInput: {
    objektBezeichnung?: string | null;
    strasse?: string | null;
    ort?: string | null;
    bezeichnung?: string | null;
  },
): Promise<{ id: string; pfad: string }> {
  const tokens = ordnerSuchTokens(suchInput);
  if (tokens.length === 0) return basis;

  const benutzer = microsoftOneDriveUser();
  let best = basis;
  let bestScore = ordnerNameScore(basis.pfad.split("/").pop() ?? "", tokens);

  async function dfs(itemId: string, pfad: string, tiefe: number): Promise<void> {
    if (tiefe > 4) return;

    const kinder = await graphDriveItemKinder(accessToken, benutzer, itemId);
    for (const kind of kinder.filter((k) => k.istOrdner)) {
      const vollerPfad = `${pfad}/${kind.name}`;
      const score = ordnerNameScore(kind.name, tokens);
      if (score > bestScore) {
        bestScore = score;
        best = { id: kind.id, pfad: vollerPfad };
      }

      const weiter =
        score > 0 ||
        /^im-/i.test(kind.name) ||
        /stammdaten|vertraege|finanzen|technik|mieter|archiv/i.test(kind.name);
      if (weiter) {
        await dfs(kind.id, vollerPfad, tiefe + 1);
      }
    }
  }

  await dfs(basis.id, basis.pfad, 0);
  return bestScore > 0 ? best : basis;
}

export function passtPfadZuGesellschaft(
  pfad: string | null | undefined,
  gesellschaftId: string | null,
  gesellschaften: Array<{ id: string; name: string }>,
): boolean {
  if (!pfad?.trim() || !gesellschaftId) return true;
  const gs = gesellschaften.find((g) => g.id === gesellschaftId);
  if (!gs) return true;

  const root = normalisiereSuchtext(pfad.split("/")[0] ?? "");
  const tokens = normalisiereSuchtext(gs.name)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && t !== "gmbh" && t !== "frenken");
  if (tokens.length === 0) return true;

  const treffer = tokens.filter((t) => root.includes(t)).length;
  return treffer >= 1;
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
