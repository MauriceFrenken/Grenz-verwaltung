/**
 * EBICS Go-Live / Bank-Übergabe
 *
 * Ablauf (einmalig pro Gesellschaft / Kunden-ID):
 * 1. Env `EBICS_MASTER_KEY` setzen (≥16 Zeichen, nur Server / Vercel Env, nie VITE_*).
 * 2. In der App „EBICS initialisieren“ → INI + HIA an die Bank, INI-Briefe erzeugen.
 * 3. Briefe ausdrucken, unterschreiben, an Volksbank im Rheinland / Multivia senden.
 * 4. Nach Freischaltung „Bank-Freischaltung prüfen“ (HPB) → Status „Bereit“.
 * 5. Danach: „Umsätze holen“ auf der Sollstellung oder täglicher Cron.
 *
 * Ohne Freischaltung der Bank schlagen C53-Abrufe fehl. BPD/Vereinbarung allein reichen nicht.
 */

export const EBICS_BANK_HANDOFF = {
  hostId: "MULTIVIA",
  url: "https://ebics.multivia-suite.de/ebicsweb/ebicsweb",
  userId: "EBICS001",
  auftragsartAbruf: "C53",
  envKey: "EBICS_MASTER_KEY",
} as const;
