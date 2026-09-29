/**
 * EBICS-Umgebungskonfiguration (nur Server).
 * Keys nie in VITE_* oder UI.
 */

import { createHash } from "node:crypto";

function readEnv(name: string): string {
  if (typeof process === "undefined") return "";
  return (process.env[name] ?? "").trim();
}

export function ebicsMasterKey(): string {
  const key = readEnv("EBICS_MASTER_KEY");
  if (!key || key.length < 16) {
    throw new Error(
      "EBICS_MASTER_KEY fehlt oder ist zu kurz (min. 16 Zeichen, nur serverseitig).",
    );
  }
  return key;
}

/** AES-256 Key + IV aus Master-Key (stabil, pro Deployment gleich). */
export function ebicsCipherMaterial(): { passphrase: Buffer; iv: Buffer } {
  const master = ebicsMasterKey();
  const passphrase = createHash("sha256").update(`ebics-pass:${master}`).digest();
  const iv = createHash("md5").update(`ebics-iv:${master}`).digest();
  return { passphrase, iv };
}
