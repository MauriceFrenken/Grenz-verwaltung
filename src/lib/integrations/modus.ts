/**
 * Adapter des Labors (Ablage v2: Microsoft Graph, KI; Qonto; EBICS-Gerüst).
 * Unabhängig von der Datenquelle des Boards: Standard ist `mock`, erst
 * VITE_BOARD_INTEGRATIONEN=live schaltet die Live-Gerüste ein. Bens
 * produktive Anbindungen (Gelb-Ablage, EBICS, Salesforce) laufen davon unberührt.
 */
import { NichtKonfiguriertFehler } from "@/lib/db/repository";

export function integrationsModus(): "mock" | "live" {
  return import.meta.env?.VITE_BOARD_INTEGRATIONEN === "live" ? "live" : "mock";
}

export function nichtKonfiguriert(adapter: string): never {
  throw new NichtKonfiguriertFehler(`Die Schnittstelle ${adapter}`);
}
