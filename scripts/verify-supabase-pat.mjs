import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const env = {};
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
  return env;
}

const env = loadEnvLocal();
const token = (env.SUPABASE_ACCESS_TOKEN || "").trim();
const ref = (env.SUPABASE_PROJECT_REF || "dibvypmrtloxvbvtbgkj").trim();

if (!token) {
  console.log("TOKEN_MISSING");
  process.exit(1);
}

console.log(`TOKEN_SET len=${token.length} prefix=${token.slice(0, 4)}`);
console.log(`PROJECT_REF=${ref}`);

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

const orgsRes = await fetch("https://api.supabase.com/v1/organizations", {
  headers,
});
const orgsText = await orgsRes.text();
console.log(`orgs_status=${orgsRes.status}`);
if (!orgsRes.ok) {
  console.log(`orgs_err=${orgsText.slice(0, 200)}`);
  process.exit(1);
}

const orgs = JSON.parse(orgsText);
console.log(`orgs=${orgs.map((o) => o.name).join(" | ")}`);
console.log(`has_grenz=${orgs.some((o) => /Grenz/i.test(o.name))}`);

const projectRes = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
  headers,
});
const projectText = await projectRes.text();
console.log(`project_status=${projectRes.status}`);
if (!projectRes.ok) {
  console.log(`project_err=${projectText.slice(0, 200)}`);
  process.exit(1);
}

const project = JSON.parse(projectText);
console.log(`project=${project.name} status=${project.status}`);

const dbRes = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    }),
  },
);
const dbText = await dbRes.text();
console.log(`db_status=${dbRes.status}`);
console.log(`db_body=${dbText.slice(0, 300)}`);
