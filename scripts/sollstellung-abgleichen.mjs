/**
 * Offene Sollstellungen neu abgleichen (service_role).
 * Usage: node scripts/sollstellung-abgleichen.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  const admin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: laeufe, error } = await admin
    .from("sollstellung_laeufe")
    .select("id, zeitraum, gesellschaft_id")
    .eq("status", "offen");
  if (error) throw new Error(error.message);
  for (const l of laeufe ?? []) {
    const { error: e } = await admin.rpc("gleiche_sollstellung_ab", {
      p_lauf_id: l.id,
    });
    console.log(
      l.zeitraum,
      l.gesellschaft_id ?? "alle",
      e ? `ERR ${e.message}` : "ok",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
