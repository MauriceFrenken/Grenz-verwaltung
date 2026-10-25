import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";

import { MandatReiter } from "./MandatReiter";
import {
  mandatBeschreibung,
  mandatTitel,
  useMandatDetail,
} from "./useMandatDetail";

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  versendet: "Versendet",
};

/** Reiter „Eigentümer-Report“: Vermarktungsberichte anlegen und öffnen. */
export function MandatReportsPage({ sfId }: { sfId: string }) {
  const { token, detail, von, setVon, bis, setBis } = useMandatDetail(sfId);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const reportAnlegen = async () => {
    setBusy(true);
    try {
      const { reportAnlegenFn } = await import("@/lib/mandate/server-fn");
      const { id } = await reportAnlegenFn({
        data: { supabaseAccessToken: token, sfId, von, bis },
      });
      toast.success("Bericht angelegt. Zahlen sind auf heute eingefroren.");
      await navigate({ to: "/mandate/$sfId/report/$id", params: { sfId, id } });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Bericht konnte nicht angelegt werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        titel={mandatTitel(detail)}
        beschreibung={mandatBeschreibung(detail)}
        reiter={<MandatReiter sfId={sfId} aktiv="reports" />}
      />
      <PageWrapper>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-subtle">
            Zeitraum von
            <Input
              type="date"
              value={von}
              onChange={(e) => setVon(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-subtle">
            bis
            <Input
              type="date"
              value={bis}
              onChange={(e) => setBis(e.target.value)}
            />
          </label>
          <Button
            onClick={() => void reportAnlegen()}
            disabled={busy || !detail}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus2 className="h-4 w-4" />
            )}
            Vermarktungsbericht anlegen
          </Button>
        </div>

        <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-heading">
            Vermarktungsberichte
          </h2>
          {!detail ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : detail.reports.length ? (
            <table className="w-full text-sm">
              <tbody>
                {detail.reports.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="py-2 pr-3">
                      <Link
                        to="/mandate/$sfId/report/$id"
                        params={{ sfId, id: r.id }}
                        className="font-medium text-heading hover:underline"
                      >
                        {formatDate(r.zeitraumVon)} bis{" "}
                        {formatDate(r.zeitraumBis)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {STATUS_TEXT[r.status] ?? r.status}
                    </td>
                    <td className="py-2 text-text-subtle">
                      angelegt {formatDate(r.createdAt)}
                      {r.versendetAm
                        ? `, versendet ${formatDate(r.versendetAm)} an ${r.versendetAn}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-text-muted">
              Noch kein Bericht. Zeitraum wählen und „Vermarktungsbericht
              anlegen“.
            </p>
          )}
        </section>
      </PageWrapper>
    </>
  );
}
