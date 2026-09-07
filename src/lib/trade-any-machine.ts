/** TradeAnyMachine GmbH — nicht in Stammdaten, eigener Postfach-Workflow. */

export const TRADE_ANY_MACHINE_NAME = "TradeAnyMachine GmbH";

/** Zieladresse für den TAM-Weiterleitungs-Workflow. */
export const TRADE_ANY_MACHINE_MAIL = "mail@sellanymachine.com";

function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function istTamGesellschaft(name: string | null | undefined): boolean {
  const norm = normalisiere(name ?? "");
  if (!norm) return false;

  return (
    norm.includes("tradeanymachine") ||
    norm.includes("trade any machine") ||
    norm.includes("sellanymachine") ||
    norm.includes("sell any machine") ||
    norm.includes("buyanymachine") ||
    norm.includes("buy any machine") ||
    norm === "tam" ||
    norm.includes("tam gmbh")
  );
}

type TamFelder = {
  gesellschaftName?: { value?: string | null } | null;
  zahlungsempfaenger?: { value?: string | null } | null;
} | null;

export function istTamAusFeldern(felder: TamFelder): boolean {
  if (!felder) return false;
  return (
    istTamGesellschaft(felder.gesellschaftName?.value) ||
    istTamGesellschaft(felder.zahlungsempfaenger?.value)
  );
}
