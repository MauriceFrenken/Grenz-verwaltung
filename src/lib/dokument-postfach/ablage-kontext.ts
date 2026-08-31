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
  const root = await graphDriveRootKinder(accessToken, benutzer);
  const gesellschaftsOrdner = root
    .filter((item) => item.istOrdner && istAblageRootOrdner(item.name))
    .slice(0, MAX_ROOT);

  const zeilen: string[] = [];

  for (const ordner of gesellschaftsOrdner) {
    zeilen.push(ordner.name);
    const kinder = await graphDriveItemKinder(accessToken, benutzer, ordner.id);
    const unterordner = kinder.filter((k) => k.istOrdner).slice(0, MAX_KINDER);

    for (const kind of unterordner) {
      zeilen.push(`  ${kind.name}`);
      const enkel = await graphDriveItemKinder(accessToken, benutzer, kind.id);
      for (const e of enkel.filter((x) => x.istOrdner).slice(0, MAX_ENKEL)) {
        zeilen.push(`    ${e.name}`);
      }
    }
  }

  return zeilen.length > 0 ? zeilen.join("\n") : "(keine Ordner gefunden)";
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
