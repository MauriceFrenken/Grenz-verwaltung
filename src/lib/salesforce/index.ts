export {
  SALESFORCE_LIGHTNING_URL,
  SALESFORCE_LOGIN_URL,
  SALESFORCE_MY_DOMAIN,
  SALESFORCE_OAUTH_CALLBACK_URL,
  SALESFORCE_OAUTH_MESSAGE,
  SALESFORCE_PREFERRED_URL,
  SALESFORCE_PRODUCTION_ORIGIN,
  istSalesforceVerbunden,
  salesforceAdminCallbackUrl,
  salesforceCallbackUrl,
  salesforceClientId,
  salesforceSessionLesen,
  salesforceSessionLoeschen,
  salesforceSessionSpeichern,
  type SalesforceSession,
} from "./config";

export { salesforceLoginPopup, type SalesforceOauthPayload } from "./oauth";
