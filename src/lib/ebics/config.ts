/**
 * EBICS-Umgebungskonfiguration (nur Server).
 * Keys nie in VITE_* oder UI.
 *
 * Hinweis: ebics-client encrypted mit optionalem IV, decrypted aber
 * immer ohne IV (Library-Bug). Deshalb nur Passphrase, kein IV.
 */

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
