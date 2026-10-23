/**
 * EBICS Go-Live / Bank-Übergabe (nur Gesellschaft Grenz & Co.)
 *
 * Ablauf (einmalig pro EBICS-Zugang):
 * 1. Env `EBICS_MASTER_KEY` setzen (≥16 Zeichen, nur Server / Vercel Env, nie VITE_*).
 * 2. Zugang aus der EBICS-Vereinbarung der Bank in `ebics_kunden` eintragen
 *    (Partner-ID, User-ID, Host-ID, URL, Bank, Teilnehmer) und die Konten in
 *    `ebics_konten` + `bankkonten` — siehe README.
 * 3. In der App unter EBICS „Initialisieren“ → INI + HIA an die Bank, INI-Briefe erzeugen.
 * 4. Briefe ausdrucken, unterschreiben und an die Bank senden.
 * 5. Nach Freischaltung „Freischaltung“ (HPB) → Status „Bereit“.
 * 6. Danach „Umsätze abrufen“ oder täglicher Cron `/api/cron/ebics-umsaetze`.
 *
 * Ohne Freischaltung der Bank schlagen C53-Abrufe fehl. BPD/Vereinbarung allein reichen nicht.
 */

export const EBICS_BANK_HANDOFF = {
  auftragsartAbruf: "C53",
  envKey: "EBICS_MASTER_KEY",
} as const;
