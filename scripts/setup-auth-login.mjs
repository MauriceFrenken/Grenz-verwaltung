/**
 * Einmaliges Auth-Setup für ein leeres Supabase-Projekt (nur Login, keine Stammdaten).
 *
 * Benötigt in .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   APP_URL=http://localhost:8080
 *   INVITE_EMAIL=ben@aruslabs.com
 *   INVITE_NAME=Ben
 *   BOOTSTRAP_EMAIL=…          — zusätzlicher Passwort-Login (op_admin)
 *   BOOTSTRAP_PASSWORD=…       — sonst wird ein Zufallspasswort ausgegeben
 *   BOOTSTRAP_NAME=OP Admin
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

function initialenAusName(name) {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "–";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return `${teile[0][0] ?? ""}${teile[teile.length - 1][0] ?? ""}`.toUpperCase();
}

function zufallsPasswort() {
  const teile = crypto.getRandomValues(new Uint8Array(12));
  return `Fv-${Buffer.from(teile).toString("base64url")}`;
}

async function upsertProfile(admin, user, { email, name, initialen, rolle = "op_admin" }) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      name,
      initialen,
      rolle,
      stellenbezeichnung: "",
      alle_gesellschaften: true,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function upsertOpAdmin(admin, { email, name, password, invite = false, redirectTo }) {
  const initialen = initialenAusName(name);
  const appMeta = { rolle: "op_admin", gesellschaften: "*" };
  const userMeta = { name, stellenbezeichnung: "", initialen };

  const { data: existingList, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = existingList.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: appMeta,
      user_metadata: userMeta,
      ...(password ? { password } : {}),
    });
    if (error) throw error;
    await upsertProfile(admin, data.user, { email, name, initialen });
    return { mode: "updated", user: data.user };
  }

  if (invite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: userMeta,
      redirectTo,
    });
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) throw new Error("Einladung ohne Benutzer-ID");
    const { data: updated, error: metaError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: appMeta,
    });
    if (metaError) throw metaError;
    await upsertProfile(admin, updated.user, { email, name, initialen });
    return { mode: "invited", user: updated.user };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMeta,
    app_metadata: appMeta,
  });
  if (error) throw error;
  await upsertProfile(admin, data.user, { email, name, initialen });
  return { mode: "created", user: data.user };
}

async function main() {
  const fileEnv = loadEnvFile(resolve(root, ".env.local"));
  const env = { ...fileEnv, ...process.env };

  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error("Fehlt: VITE_SUPABASE_URL in .env.local");
    process.exit(1);
  }
  if (!serviceRole) {
    console.error(
      "Fehlt: SUPABASE_SERVICE_ROLE_KEY in .env.local\n" +
        "Supabase Dashboard → Project Settings → API → service_role (secret)",
    );
    process.exit(1);
  }

  const appUrl = (env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");
  const inviteEmail = env.INVITE_EMAIL ?? "ben@aruslabs.com";
  const inviteName = env.INVITE_NAME ?? "Ben";
  const bootstrapEmail = env.BOOTSTRAP_EMAIL?.trim() || "";
  const bootstrapName = env.BOOTSTRAP_NAME ?? "OP Admin";
  const bootstrapPassword = env.BOOTSTRAP_PASSWORD?.trim() || zufallsPasswort();
  const redirectTo = `${appUrl}/einladung`;

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Supabase Auth-Setup (Benutzer, Rollen, Rechte)\n");
  console.log(`Projekt: ${url}`);
  console.log(`Redirect für Einladungen: ${redirectTo}\n`);
  console.log(
    "Hinweis: Im Supabase Dashboard unter Authentication → URL Configuration prüfen:\n" +
      `  Site URL: ${appUrl}\n` +
      `  Redirect URLs: ${redirectTo}, ${appUrl}/passwort-zuruecksetzen\n`,
  );

  const results = [];

  if (bootstrapEmail) {
    const result = await upsertOpAdmin(admin, {
      email: bootstrapEmail,
      name: bootstrapName,
      password: bootstrapPassword,
      invite: false,
      redirectTo,
    });
    results.push({ email: bootstrapEmail, ...result, password: bootstrapPassword });
  }

  const inviteResult = await upsertOpAdmin(admin, {
    email: inviteEmail,
    name: inviteName,
    invite: true,
    redirectTo,
  });
  results.push({ email: inviteEmail, ...inviteResult });

  console.log("Ergebnis:\n");
  for (const row of results) {
    console.log(`• ${row.email} — ${row.mode} (op_admin)`);
    if (row.password) {
      console.log(`  Passwort (bootstrap): ${row.password}`);
    }
    if (row.mode === "invited") {
      console.log("  Einladungs-E-Mail wurde von Supabase versendet (falls SMTP konfiguriert).");
    }
  }

  const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw error;
  console.log(`\nAktive Auth-Benutzer im Projekt: ${users.users.length}`);
  for (const u of users.users) {
    const rolle = u.app_metadata?.rolle ?? "—";
    console.log(`  - ${u.email} (${rolle})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
