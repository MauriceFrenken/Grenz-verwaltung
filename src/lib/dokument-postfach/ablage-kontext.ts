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
const MAX_PFADE = 600;
const MAX_TIEFE = 8;

function normalisiereSuchtext(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ordnerSuchTokens(input: {
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
    const strasse = normalisiereSuchtext(strassenMatch[1].replace(/str\.?$/i, ""));
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

function sollTieferGehen(ordnerName: string, tiefe: number): boolean {
  if (tiefe >= MAX_TIEFE) return false;
  const n = ordnerName.toLowerCase();
  if (/immobilien|bestand|ankauf|verkauf|projekte|^im-/.test(n)) return true;
  return tiefe < 4;
}

async function sammleOrdnerPfade(
  accessToken: string,
  benutzer: string,
  itemId: string | null,
  prefix: string,
  tiefe: number,
  pfade: string[],
): Promise<void> {
  if (pfade.length >= MAX_PFADE || tiefe >= MAX_TIEFE) return;

  const kinder =
    itemId === null
      ? await graphDriveRootKinder(accessToken, benutzer)
      : await graphDriveItemKinder(accessToken, benutzer, itemId);

  const ordner = itemId === null
    ? kinder.filter((k) => k.istOrdner && istAblageRootOrdner(k.name)).slice(0, MAX_ROOT)
    : kinder.filter((k) => k.istOrdner);

  for (const kind of ordner) {
    if (pfade.length >= MAX_PFADE) break;
    const pfad = prefix ? `${prefix}/${kind.name}` : kind.name;
    pfade.push(pfad);

    if (sollTieferGehen(kind.name, tiefe)) {
      await sammleOrdnerPfade(
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

export async function ladeOnedriveKontext(accessToken: string): Promise<string> {
  const benutzer = microsoftOneDriveUser();
  const pfade: string[] = [];
  await sammleOrdnerPfade(accessToken, benutzer, null, "", 0, pfade);
  return pfade.length > 0
    ? pfade.join("\n")
    : "(keine Ordner gefunden)";
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
 * (z. B. Objektordner IM-… unter 02_Bestand).
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
    if (tiefe > 5) return;

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
        /bestand|immobilien/i.test(kind.name);
      if (weiter) {
        await dfs(kind.id, vollerPfad, tiefe + 1);
      }
    }
  }

  await dfs(basis.id, basis.pfad, 0);
  return best;
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

  const teil = gesellschaften.find(
    (g) =>
      such.includes(g.name.toLowerCase()) ||
      g.name.toLowerCase().includes(such) ||
      such.includes(g.kuerzel.toLowerCase()),
  );
  return teil?.id ?? null;
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
  const such = (bezeichnung ?? "").trim().toLowerCase();
  if (!such) return null;

  const kandidaten = gesellschaftId
    ? objekte.filter((o) => o.gesellschaft_id === gesellschaftId)
    : objekte;

  const exakt = kandidaten.find((o) => o.bezeichnung.toLowerCase() === such);
  if (exakt) return exakt.id;

  const teil = kandidaten.find(
    (o) =>
      o.bezeichnung.toLowerCase().includes(such) ||
      such.includes(o.bezeichnung.toLowerCase()) ||
      (o.strasse && such.includes(o.strasse.toLowerCase())) ||
      (o.ort && such.includes(o.ort.toLowerCase())),
  );
  return teil?.id ?? null;
}
