/**
 * Kontext für KI: Stammdaten + schrittweise OneDrive-Ordnerwahl. Server-only.
 */
import {
  waehleGesellschaftRootOrdner,
  waehleUnterordnerSchritt,
  type DokumentTyp,
} from "@/lib/dokument-ai";
import { MICROSOFT_EINGANGSRECHNUNGEN_PFAD } from "@/lib/microsoft/config";
import {
  graphDriveItemKinder,
  graphDriveOrdnerAnlegen,
  graphDriveRootKinder,
  type GraphDriveItem,
} from "@/lib/microsoft/graph";
import {
  istAblageRootOrdner,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

const MAX_ORDNER_TIEFE = 8;

export function normalisiereSuchtext(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Gesellschaften als KI-Kontext. */
export async function ladeStammdatenKontext(): Promise<string> {
  const admin = createServiceRoleClient();

  const { data: gesellschaften } = await admin
    .from("gesellschaften")
    .select("id,name,kuerzel")
    .order("id");

  const gsLines = (gesellschaften ?? []).map(
    (g) => `- ${g.id}: ${g.name} (${g.kuerzel})`,
  );

  return ["Gesellschaften:", ...gsLines].join("\n");
}

/** Gesellschafts-Root in OneDrive — zuerst deterministisch, sonst KI. */
export async function findeGesellschaftRootOrdner(
  accessToken: string,
  input: {
    gesellschaftId: string;
    gesellschaftName: string;
    gesellschaftKuerzel?: string | null;
    documentTitle?: string;
    mailKontext?: string;
    modelContext?: string;
  },
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>,
): Promise<{ id: string; pfad: string } | null> {
  const gs = gesellschaften.find((g) => g.id === input.gesellschaftId);
  if (!gs) return null;

  const benutzer = microsoftOneDriveUser();
  const root = await graphDriveRootKinder(accessToken, benutzer);
  const kandidaten = root.filter(
    (item) => item.istOrdner && istAblageRootOrdner(item.name),
  );
  if (kandidaten.length === 0) return null;

  const deterministisch = findeGesellschaftRootDeterministisch(
    kandidaten,
    input.gesellschaftName || gs.name,
  );
  if (deterministisch) {
    return { id: deterministisch.id, pfad: deterministisch.name };
  }

  const wahl = await waehleGesellschaftRootOrdner({
    gesellschaftName: input.gesellschaftName || gs.name,
    gesellschaftKuerzel: input.gesellschaftKuerzel ?? gs.kuerzel,
    gesellschaftId: input.gesellschaftId,
    rootOrdner: kandidaten.map((k) => k.name),
    documentTitle: input.documentTitle,
    mailKontext: input.mailKontext,
    modelContext: input.modelContext,
  });

  if (!wahl.gewaehlterOrdner) return null;

  const treffer = kandidaten.find((k) => k.name === wahl.gewaehlterOrdner);
  if (!treffer) return null;

  return { id: treffer.id, pfad: treffer.name };
}

/** Ordnername ohne Nummern-Präfix („01_“) und Rechtsform. */
function ordnerKern(normalisiert: string): string {
  return normalisiert
    .replace(/^\d+\s+/, "")
    .replace(/\b(gmbh|gbr|ag|kg|co|ug)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Gesellschafts-Root ohne KI — Zuordnung über den Gesellschaftsnamen. */
export function findeGesellschaftRootDeterministisch(
  rootOrdner: Array<Pick<GraphDriveItem, "id" | "name">>,
  gesellschaftName: string,
): { id: string; name: string } | null {
  const g = normalisiereSuchtext(gesellschaftName);
  if (!g || rootOrdner.length === 0) return null;
  const gKern = ordnerKern(g);

  const scored = rootOrdner.map((root) => {
    const r = normalisiereSuchtext(root.name);
    const rKern = ordnerKern(r);
    let score = 0;

    if (g === r || (gKern && gKern === rKern)) {
      score = 100;
    } else if (g.includes(r) || r.includes(g)) {
      score = Math.min(80, Math.min(g.length, r.length));
    } else if (gKern && rKern && (rKern.includes(gKern) || gKern.includes(rKern))) {
      score = Math.min(80, Math.min(gKern.length, rKern.length) + 40);
    }

    return { root, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 50) return null;
  return { id: best.root.id, name: best.root.name };
}

async function stelleDriveUnterordnerSicher(
  accessToken: string,
  benutzer: string,
  parentId: string,
  name: string,
): Promise<GraphDriveItem> {
  const kinder = await graphDriveItemKinder(accessToken, benutzer, parentId);
  const lower = name.trim().toLowerCase();
  const vorhanden = kinder.find(
    (k) => k.istOrdner && k.name.trim().toLowerCase() === lower,
  );
  if (vorhanden) return vorhanden;
  return graphDriveOrdnerAnlegen(accessToken, benutzer, parentId, name.trim());
}

function istEingangsrechnungenName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.includes("ausgang")) return false;
  return n === "eingangsrechnungen" || n === "eingangsrechnung";
}

function istFinanzenZweigName(name: string): boolean {
  const n = normalisiereSuchtext(name);
  return (
    n.includes("finanz") ||
    n.includes("buchhalt") ||
    n.includes("steuer") ||
    n.includes("rechnung")
  );
}

/**
 * Unter dem Gesellschafts-Root nach exakt Eingangsrechnungen suchen
 * (nie Ausgangsrechnungen). Begrenzt auf Finanzen-/Buchhaltungszweige.
 */
async function sucheEingangsrechnungenUnterRoot(
  accessToken: string,
  benutzer: string,
  root: { id: string; name: string },
): Promise<{ id: string; pfad: string } | null> {
  const queue: Array<{ id: string; pfad: string; tiefe: number }> = [
    { id: root.id, pfad: root.name, tiefe: 0 },
  ];
  const maxTiefe = 5;

  while (queue.length > 0) {
    const aktuell = queue.shift()!;
    if (aktuell.tiefe >= maxTiefe) continue;

    const kinder = await graphDriveItemKinder(accessToken, benutzer, aktuell.id);
    for (const kind of kinder) {
      if (!kind.istOrdner) continue;
      const kindPfad = `${aktuell.pfad}/${kind.name}`;
      if (istEingangsrechnungenName(kind.name)) {
        return { id: kind.id, pfad: kindPfad };
      }
      if (
        aktuell.tiefe < 3 &&
        (aktuell.tiefe === 0 || istFinanzenZweigName(kind.name))
      ) {
        queue.push({ id: kind.id, pfad: kindPfad, tiefe: aktuell.tiefe + 1 });
      }
    }
  }

  return null;
}

/**
 * Fester Rechnungspfad: vorhandenes „Eingangsrechnungen“ unter Gesellschafts-Root,
 * sonst {Root}/02_Finanzen/01_Buchhaltung/Eingangsrechnungen anlegen.
 * Nie Ausgangsrechnungen — gespeicherte Fremdpfade werden nicht verwendet.
 */
export async function findeEingangsrechnungenOrdner(
  accessToken: string,
  gesellschaftName: string,
): Promise<{ id: string; pfad: string } | null> {
  const benutzer = microsoftOneDriveUser();
  const root = await graphDriveRootKinder(accessToken, benutzer);
  const kandidaten = root.filter(
    (item) => item.istOrdner && istAblageRootOrdner(item.name),
  );
  const gesellschaftRoot = findeGesellschaftRootDeterministisch(
    kandidaten,
    gesellschaftName,
  );
  if (!gesellschaftRoot) return null;

  const gefunden = await sucheEingangsrechnungenUnterRoot(
    accessToken,
    benutzer,
    gesellschaftRoot,
  );
  if (gefunden) return gefunden;

  let aktuell = gesellschaftRoot;
  const pfadTeile = [gesellschaftRoot.name];

  for (const segment of MICROSOFT_EINGANGSRECHNUNGEN_PFAD) {
    if (/ausgang/i.test(segment)) {
      throw new Error("Ungültiges Rechnungspfad-Segment.");
    }
    const kind = await stelleDriveUnterordnerSicher(
      accessToken,
      benutzer,
      aktuell.id,
      segment,
    );
    aktuell = { id: kind.id, name: kind.name };
    pfadTeile.push(kind.name);
  }

  if (!istEingangsrechnungenName(aktuell.name)) {
    throw new Error(
      `Erwarteter Ordner „Eingangsrechnungen“, erhalten: „${aktuell.name}“.`,
    );
  }

  return { id: aktuell.id, pfad: pfadTeile.join("/") };
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
    dokumentTyp: DokumentTyp;
    documentTitle?: string;
    mailKontext?: string;
    modelContext?: string;
  },
  gesellschaften: Array<{ id: string; name: string; kuerzel: string }>,
): Promise<{ id: string; pfad: string } | null> {
  const root = await findeGesellschaftRootOrdner(
    accessToken,
    {
      gesellschaftId: input.gesellschaftId,
      gesellschaftName: input.gesellschaftName,
      gesellschaftKuerzel:
        gesellschaften.find((g) => g.id === input.gesellschaftId)?.kuerzel ?? null,
      documentTitle: input.documentTitle,
      mailKontext: input.mailKontext,
      modelContext: input.modelContext,
    },
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
    else if (such.includes(gn) || gn.includes(such)) {
      score = Math.min(such.length, gn.length);
    } else if (such.includes(g.kuerzel.toLowerCase())) {
      score = g.kuerzel.length + 10;
    }

    if (score > 0 && (!best || score > best.score)) best = { id: g.id, score };
  }

  return best && best.score >= 8 ? best.id : null;
}
