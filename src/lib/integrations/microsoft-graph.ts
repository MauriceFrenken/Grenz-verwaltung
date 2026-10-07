/**
 * Microsoft Graph für Ablage v2: Postfach lesen, Datei in OneDrive ablegen.
 * Bewusst getrennt von `src/lib/microsoft/graph.ts` (produktive Gelb-Ablage),
 * damit Ablage v2 deren Verhalten nicht berührt.
 */
import type { EingangsMail } from "@/lib/ai/klassifikation";
import { integrationsModus, nichtKonfiguriert } from "./modus";

export interface PostfachQuelle {
  neueMails(): Promise<EingangsMail[]>;
}

export interface AblageZiel {
  /** Legt den Anhang der Mail unter `pfad/dateiname` ab und liefert die Web-URL. */
  ablegen(mail: EingangsMail, pfad: string, dateiname: string): Promise<string>;
}

export class GraphPostfachMock implements PostfachQuelle {
  constructor(private mails: EingangsMail[]) {}
  async neueMails() {
    return this.mails;
  }
}

export class OneDriveAblageMock implements AblageZiel {
  readonly abgelegt: Array<{ mailId: string; url: string }> = [];
  async ablegen(mail: EingangsMail, pfad: string, dateiname: string) {
    const url = `${pfad}/${encodeURIComponent(dateiname)}`;
    this.abgelegt.push({ mailId: mail.id, url });
    return url;
  }
}

export class GraphPostfachLive implements PostfachQuelle {
  // TODO(live): GET /users/{postfach}/mailFolders/inbox/messages?$filter=isRead eq false
  // inkl. /attachments; App-Registrierung mit Mail.Read (Application), Secret nur serverseitig.
  async neueMails(): Promise<EingangsMail[]> {
    return nichtKonfiguriert("Microsoft Graph (Postfach)");
  }
}

export class OneDriveAblageLive implements AblageZiel {
  // TODO(live): PUT /drives/{driveId}/root:/{pfad}/{dateiname}:/content (Files.ReadWrite.All),
  // danach Mail in Ordner „Abgelegt v2“ verschieben.
  async ablegen(): Promise<string> {
    return nichtKonfiguriert("Microsoft Graph (OneDrive)");
  }
}

export function graphPostfach(mails: EingangsMail[]): PostfachQuelle {
  return integrationsModus() === "live"
    ? new GraphPostfachLive()
    : new GraphPostfachMock(mails);
}

let ablageMock: OneDriveAblageMock | null = null;
export function oneDriveAblage(): AblageZiel {
  if (integrationsModus() === "live") return new OneDriveAblageLive();
  ablageMock ??= new OneDriveAblageMock();
  return ablageMock;
}
