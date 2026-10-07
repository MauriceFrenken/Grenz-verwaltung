/**
 * Qonto-Geschäftskonten (REST API v2, Transaktionen je Bankkonto).
 * Secrets (Login + Secret Key) nur serverseitig, nie als VITE_*.
 */
import type { BoardDaten, Transaction } from "@/lib/db/typen";
import type { UmsatzQuelle } from "./ebics";
import { integrationsModus, nichtKonfiguriert } from "./modus";

export class QontoMock implements UmsatzQuelle {
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

export class QontoLive implements UmsatzQuelle {
  // TODO(live): GET /v2/transactions?bank_account_id=…&settled_at_from=…, Mapping side=debit → negativ.
  async umsaetze(): Promise<Transaction[]> {
    return nichtKonfiguriert("Qonto");
  }
}

export function qontoQuelle(
  daten: Pick<BoardDaten, "transactions">,
): UmsatzQuelle {
  return integrationsModus() === "live"
    ? new QontoLive()
    : new QontoMock(daten);
}
