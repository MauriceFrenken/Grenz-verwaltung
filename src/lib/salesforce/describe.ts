import { salesforceDataApiPath, salesforceRestJson } from "./query";

export type SalesforceObjektRechte = {
  name: string;
  label: string;
  createable: boolean;
  updateable: boolean;
};

type BasicInformation = {
  objectDescribe?: {
    name?: string;
    label?: string;
    createable?: boolean;
    updateable?: boolean;
  };
};

/**
 * Objektrechte des angemeldeten Users. Die "Basic Information"-Ressource ist
 * deutlich kleiner als ein volles Describe und reicht, um zwischen fehlender
 * Berechtigung und einem Trigger-/Validierungsfehler zu unterscheiden.
 */
export async function salesforceObjektRechte(
  accessToken: string,
  instanceUrl: string,
  sobject: string,
): Promise<SalesforceObjektRechte | null> {
  try {
    const info = await salesforceRestJson<BasicInformation>(
      accessToken,
      instanceUrl,
      `${salesforceDataApiPath()}/sobjects/${encodeURIComponent(sobject)}`,
    );
    const beschreibung = info?.objectDescribe;
    if (!beschreibung) return null;

    return {
      name: beschreibung.name ?? sobject,
      label: beschreibung.label ?? sobject,
      createable: beschreibung.createable === true,
      updateable: beschreibung.updateable === true,
    };
  } catch {
    // Die Diagnose darf den eigentlichen Fehler nie überdecken.
    return null;
  }
}

const RECHTE_FEHLER =
  /CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY|INSUFFICIENT_ACCESS|entity type cannot be (inserted|updated)/i;

/**
 * Ergänzt einen Salesforce-Fehler um die Ursache, wenn dem angemeldeten User
 * schlicht das Recht auf dem Objekt fehlt. Salesforce meldet in dem Fall nur
 * "entity type cannot be inserted", was im UI niemand einordnen kann.
 */
export async function mitRechteDiagnose(
  accessToken: string,
  instanceUrl: string,
  sobject: string,
  aktion: "anlegen" | "aktualisieren",
  originalFehler: string,
): Promise<string> {
  if (!RECHTE_FEHLER.test(originalFehler)) return originalFehler;

  const rechte = await salesforceObjektRechte(
    accessToken,
    instanceUrl,
    sobject,
  );
  if (!rechte) return originalFehler;

  const erlaubt = aktion === "anlegen" ? rechte.createable : rechte.updateable;
  if (erlaubt) return originalFehler;

  const recht = aktion === "anlegen" ? "„Erstellen“" : "„Bearbeiten“";
  return (
    `Ihrem Salesforce-Benutzer fehlt das Recht ${recht} für das Objekt „${rechte.label}“ (${rechte.name}). ` +
    `Der Salesforce-Admin muss es im Profil oder in einem Permission Set freischalten. ` +
    `Originalmeldung: ${originalFehler}`
  );
}
