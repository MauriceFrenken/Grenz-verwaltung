import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { salesforceFehlerText, salesforceLoginPopup } from "@/lib/salesforce";
import type { SyncStatusDto } from "@/lib/sf-sync/server-fn";

const OBJEKT_NAMEN: Record<string, string> = {
  Mandate__c: "Mandate",
  Real_Estate__c: "Objekte (Real Estate)",
  Opportunity: "Deals",
  Campaign: "Kampagnen",
  CampaignMember: "Kampagnenmitglieder",
  Investorprofile__c: "Ankaufsprofile",
  Search_Location__c: "Suchregionen",
  Task: "Aufgaben",
  Event: "Termine",
  EmailMessage: "E-Mails",
  Contact: "Kontakte",
  Account: "Accounts",
  Lead: "Leads",
};

function zeit(iso: string | null): string {
  if (!iso) return "noch nie";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Stand des Salesforce-Syncs (sf_*-Caches) mit Button für einen sofortigen Abruf. */
export function SalesforceSyncKarte({ token }: { token: string }) {
  const [status, setStatus] = useState<SyncStatusDto | null>(null);
  const [laeuft, setLaeuft] = useState<
    "inkrementell" | "voll" | "verbinden" | null
  >(null);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { salesforceSyncStatusFn } =
        await import("@/lib/sf-sync/server-fn");
      setStatus(
        await salesforceSyncStatusFn({ data: { supabaseAccessToken: token } }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Sync-Stand konnte nicht geladen werden.",
      );
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const starten = async (voll: boolean) => {
    setLaeuft(voll ? "voll" : "inkrementell");
    try {
      const { salesforceSyncStartenFn } =
        await import("@/lib/sf-sync/server-fn");
      const { salesforceSessionHintFrisch } =
        await import("@/lib/salesforce/api");
      const sfSitzung = await salesforceSessionHintFrisch();
      const ergebnisse = await salesforceSyncStartenFn({
        data: { supabaseAccessToken: token, voll, sfSitzung },
      });
      const fehler = ergebnisse.filter((e) => e.fehler);
      const summe = ergebnisse.reduce((s, e) => s + e.geholt, 0);
      if (fehler.length) {
        toast.error(
          `${fehler.length} Objekte mit Fehler, ${summe.toLocaleString("de-DE")} Datensätze geholt.`,
        );
      } else {
        toast.success(
          `${summe.toLocaleString("de-DE")} Datensätze aus Salesforce aktualisiert.`,
        );
      }
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync fehlgeschlagen.", {
        duration: 14_000,
      });
    } finally {
      setLaeuft(null);
    }
  };

  // Popup im Klick öffnen (Safari), deshalb salesforceLoginPopup ohne vorheriges await.
  const verbinden = async () => {
    setLaeuft("verbinden");
    try {
      const sitzung = await salesforceLoginPopup();
      if (!sitzung.refreshToken) {
        throw new Error(
          "Salesforce hat keinen Refresh Token geliefert. In der Connected App muss der Scope „refresh_token, offline_access“ erlaubt sein.",
        );
      }
      const { salesforceVerbindungHinterlegenFn } =
        await import("@/lib/sf-sync/server-fn");
      const v = await salesforceVerbindungHinterlegenFn({
        data: {
          supabaseAccessToken: token,
          sfSitzung: { refreshToken: sitzung.refreshToken },
        },
      });
      toast.success(
        `Salesforce dauerhaft verbunden${v.kontoEmail ? ` als ${v.kontoEmail}` : ""}. Der Abruf läuft ab jetzt automatisch.`,
      );
      await laden();
      void starten(false);
    } catch (e) {
      const msg = salesforceFehlerText(e, "Verbindung fehlgeschlagen");
      if (!msg.includes("abgebrochen")) toast.error(msg, { duration: 14_000 });
      setLaeuft(null);
    }
  };

  const trennen = async () => {
    try {
      const { salesforceVerbindungEntfernenFn } =
        await import("@/lib/sf-sync/server-fn");
      await salesforceVerbindungEntfernenFn({
        data: { supabaseAccessToken: token },
      });
      toast.info("Hinterlegte Salesforce-Verbindung entfernt.");
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trennen fehlgeschlagen.");
    }
  };

  const v = status?.verbindung;
  const zugangText =
    status?.zugang === "jwt"
      ? "Connected App (JWT)"
      : status?.zugang === "hinterlegt"
        ? v?.status === "fehler"
          ? "Hinterlegte Verbindung abgelehnt, bitte neu verbinden"
          : `Automatischer Abruf über ${v?.kontoEmail ?? "hinterlegte Anmeldung"}`
        : status?.zugang === "uebergang"
          ? "Übergang: Refresh Token aus der Umgebung"
          : "Nicht dauerhaft verbunden";
  const zeigeVerbinden = status && status.zugang !== "jwt";

  return (
    <article className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-heading">Salesforce-Sync</h2>
        <span className="text-xs text-text-subtle">{zugangText}</span>
      </div>
      <p className="text-xs text-text-subtle">
        Salesforce ist führend. Die App hält nur eine Lesekopie der
        Grenz-Datensätze und holt Änderungen automatisch ab: beim Öffnen der App
        und danach alle 15 Minuten, nachts zusätzlich per Zeitplan.
      </p>
      {zeigeVerbinden && status.zugang !== "hinterlegt" ? (
        <p className="border border-hairline bg-surface-muted/40 p-3 text-xs text-heading">
          Für den automatischen Abruf einmal mit Salesforce anmelden. Die
          Anmeldung wird verschlüsselt gespeichert und gilt für die ganze App,
          bis sie hier getrennt wird.
        </p>
      ) : null}
      {v?.status === "fehler" && v.letzterFehler ? (
        <p className="text-xs text-danger">{v.letzterFehler}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-subtle">
              <th className="py-1 pr-3 font-normal">Objekt</th>
              <th className="py-1 pr-3 font-normal">Letzter Abruf</th>
              <th className="py-1 pr-3 text-right font-normal">
                Zuletzt geholt
              </th>
              <th className="py-1 font-normal">Fehler</th>
            </tr>
          </thead>
          <tbody>
            {(status?.stand ?? []).map((z) => (
              <tr key={z.sfObjekt} className="border-t border-hairline">
                <td className="py-1 pr-3 text-heading">
                  {OBJEKT_NAMEN[z.sfObjekt] ?? z.sfObjekt}
                </td>
                <td className="py-1 pr-3">{zeit(z.letzterAbrufAm)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {z.anzahl ?? "–"}
                </td>
                <td className="py-1 text-danger">{z.letzterFehler ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {zeigeVerbinden ? (
          <Button
            size="sm"
            className="bg-foreground text-background hover:bg-heading"
            disabled={laeuft !== null}
            onClick={() => void verbinden()}
          >
            {laeuft === "verbinden" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {status.zugang === "hinterlegt"
              ? "Neu verbinden"
              : "Salesforce dauerhaft verbinden"}
          </Button>
        ) : null}
        <Button
          size="sm"
          className="bg-foreground text-background hover:bg-heading"
          disabled={laeuft !== null}
          onClick={() => void starten(false)}
        >
          {laeuft === "inkrementell" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Jetzt abrufen
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-foreground text-foreground"
          disabled={laeuft !== null}
          onClick={() => void starten(true)}
        >
          {laeuft === "voll" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Alles neu abrufen
        </Button>
        {status?.zugang === "hinterlegt" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={laeuft !== null}
            onClick={() => void trennen()}
          >
            Trennen
          </Button>
        ) : null}
      </div>
    </article>
  );
}
