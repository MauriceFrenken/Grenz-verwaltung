/**
 * Synchronisiert die Auth-E-Mail-Templates auf das gehostete Supabase-Projekt.
 *
 * Benötigt:
 *   SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens
 *   VITE_SUPABASE_URL     — aus .env.local (oder Umgebung)
 *
 * Optional:
 *   SUPABASE_PROJECT_REF  — sonst aus der URL abgeleitet
 *
 * Nutzung:
 *   node scripts/sync-auth-email-templates.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const templatesDir = resolve(root, "supabase/templates");

function loadEnvFile(path) {
  const env = {};
  try {
    const raw = readFileSync(path, "utf8");
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

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function readTemplate(filename) {
  return readFileSync(resolve(templatesDir, filename), "utf8");
}

const fileEnv = loadEnvFile(resolve(root, ".env.local"));
const env = { ...fileEnv, ...process.env };

const accessToken = env.SUPABASE_ACCESS_TOKEN?.trim();
const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
const projectRef =
  env.SUPABASE_PROJECT_REF?.trim() ||
  (supabaseUrl ? projectRefFromUrl(supabaseUrl) : null);

if (!accessToken) {
  console.error(
    "Fehlt SUPABASE_ACCESS_TOKEN. Erstellen Sie ein Token unter https://supabase.com/dashboard/account/tokens",
  );
  process.exit(1);
}

if (!projectRef) {
  console.error("Fehlt SUPABASE_PROJECT_REF oder VITE_SUPABASE_URL in .env.local");
  process.exit(1);
}

const payload = {
  mailer_subjects_invite: "Einladung zu Grenz & Co. Verwaltung",
  mailer_templates_invite_content: readTemplate("invite.html"),
  mailer_subjects_recovery: "Passwort zurücksetzen — Grenz & Co. Verwaltung",
  mailer_templates_recovery_content: readTemplate("recovery.html"),
};

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message ?? body;
  } catch {
    // keep raw body
  }

  console.error(`Sync fehlgeschlagen (${response.status}):`, message);

  if (
    response.status === 400 &&
    typeof message === "string" &&
    message.includes("default email provider")
  ) {
    console.error(`
Hinweis: Auf dem Free-Tier mit Supabase-Standard-SMTP sind keine eigenen E-Mail-Templates möglich.

Nächste Schritte:
  1. Custom SMTP einrichten (z. B. Resend, SendGrid) unter
     Supabase Dashboard → Authentication → SMTP Settings
  2. Danach erneut ausführen:
     node scripts/sync-auth-email-templates.mjs

Die HTML-Templates liegen bereits unter supabase/templates/.
`);
  }

  process.exit(1);
}

console.log(`Auth-E-Mail-Templates für Projekt ${projectRef} aktualisiert:`);
console.log("  • Einladung (invite)");
console.log("  • Passwort zurücksetzen (recovery)");
