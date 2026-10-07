/**
 * Kontoumsätze per EBICS (camt.053, Auftragsart C53) – nur Abruf, nie Zahlungen.
 * Die produktive EBICS-Anbindung liegt in src/lib/ebics/ und bleibt unverändert;
 * der Live-Adapter liest später deren Tabelle `bankbuchungen`.
 */
import type { BoardDaten, Transaction } from "@/lib/db/typen";
import { integrationsModus, nichtKonfiguriert } from "./modus";

export interface UmsatzQuelle {
  umsaetze(accountId: string, von: string, bis: string): Promise<Transaction[]>;
}

export class EbicsMock implements UmsatzQuelle {
  constructor(private daten: Pick<BoardDaten, "transactions">) {}
  async umsaetze(accountId: string, von: string, bis: string) {
    return this.daten.transactions.filter(
      (t) =>
        t.accountId === accountId &&
        t.bookingDate >= von &&
        t.bookingDate <= bis,
    );
  }
}

export class EbicsLive implements UmsatzQuelle {
  // TODO(live): server-fn, die `bankbuchungen` (camt.053) je IBAN liest und auf Transaction mappt.
  async umsaetze(): Promise<Transaction[]> {
    return nichtKonfiguriert("EBICS");
  }
}

export function ebicsQuelle(
  daten: Pick<BoardDaten, "transactions">,
): UmsatzQuelle {
  return integrationsModus() === "live"
    ? new EbicsLive()
    : new EbicsMock(daten);
}
