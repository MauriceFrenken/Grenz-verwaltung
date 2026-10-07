/**
 * Integrationen folgen derselben Umschaltung wie die Datenbank:
 * VITE_BOARD_DATENQUELLE=mock (Standard) aktiviert alle Mock-Adapter.
 */
import { konfigurierteDatenquelle } from "@/lib/db/config";
import { NichtKonfiguriertFehler } from "@/lib/db/repository";

export const integrationsModus = konfigurierteDatenquelle;

export function nichtKonfiguriert(adapter: string): never {
  throw new NichtKonfiguriertFehler(`Die Schnittstelle ${adapter}`);
}
