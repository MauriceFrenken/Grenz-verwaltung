/**
 * Stdio-MCP für Grenz & Co. nutzt denselben PAT wie die Supabase CLI.
 *
 * Benötigt in .env.local:
 *   SUPABASE_ACCESS_TOKEN=…   (Account-Token: https://supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF=dibvypmrtloxvbvtbgkj
 *
 * Cursor: .cursor/mcp.json → command node scripts/supabase-mcp.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // ignore
  }
  return env;
}

const fileEnv = loadEnvLocal();
const token = (process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN || "").trim();
const projectRef = (
  process.env.SUPABASE_PROJECT_REF ||
  fileEnv.SUPABASE_PROJECT_REF ||
  "dibvypmrtloxvbvtbgkj"
).trim();

if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN fehlt. Token unter https://supabase.com/dashboard/account/tokens erzeugen und in .env.local setzen (gleicher Account wie `supabase orgs list`).",
  );
  process.exit(1);
}

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(
  npxBin,
  [
    "-y",
    "@supabase/mcp-server-supabase@latest",
    "--access-token",
    token,
    "--project-ref",
    projectRef,
  ],
  {
    stdio: "inherit",
    shell: false,
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: token,
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
