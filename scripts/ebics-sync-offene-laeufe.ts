/**
 * EBICS C53 für alle offenen Sollstellungen abrufen und abgleichen.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/ebics-sync-offene-laeufe.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { syncEbicsFuerLauf } from "../src/lib/ebics/sync";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvLocal() {
  const text = await readFile(join(root, ".env.local"), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

async function main() {
  await loadEnvLocal();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-Env fehlt");
  if (!process.env.EBICS_MASTER_KEY) throw new Error("EBICS_MASTER_KEY fehlt");

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: laeufe, error } = await admin
    .from("sollstellung_laeufe")
    .select("id, zeitraum, gesellschaft_id, status")
    .eq("status", "offen")
    .order("zeitraum", { ascending: true });
  if (error) throw new Error(error.message);

  console.log(`Offene Läufe: ${(laeufe ?? []).length}`);
  for (const lauf of laeufe ?? []) {
    process.stdout.write(
      `→ ${lauf.zeitraum} ${lauf.gesellschaft_id ?? "alle"} … `,
    );
    try {
      const r = await syncEbicsFuerLauf(admin, lauf.id as string);
      const fehler = r.ergebnisse.filter((e) => e.status === "fehler");
      console.log(
        `neu=${r.anzahlNeuGesamt}` +
          (r.bankLeer ? " bankLeer" : "") +
          (fehler.length
            ? ` fehler=${fehler.map((f) => f.meldung).join(" | ")}`
            : ""),
      );
    } catch (err) {
      console.log(`ERR ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
