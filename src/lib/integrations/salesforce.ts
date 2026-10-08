/**
 * Salesforce im Management Board: nur lesen und verknüpfen.
 *
 * Bens Exposé-Export (src/lib/salesforce) schreibt die Salesforce-Transaktion
 * (Transaktion__c) in public.postfach_exposes.salesforce_transaktion_id. Ein
 * Ankauf, der aus einem Exposé entsteht, übernimmt diese ID. Das Board schreibt
 * in dieser Phase nichts nach Salesforce und hat keinen eigenen Adapter mehr.
 */
export {
  ANKAUF_PHASEN,
  PHASE_LABEL,
  type Ankauf,
  type AnkaufPhase,
  type CrmDaten,
  type Kaeufer,
  type Reservierung,
} from "@/lib/db/transaktionen";
export { erzeugeCrmMock } from "@/lib/db/mock/transaktionen";

/** Link auf einen Salesforce-Datensatz, falls die Instanz bekannt ist. */
export function salesforceLink(
  instanzUrl: string | null,
  sfId: string | null,
): string | null {
  if (!instanzUrl || !sfId) return null;
  return `${instanzUrl.replace(/\/$/, "")}/lightning/r/Transaktion__c/${sfId}/view`;
}
