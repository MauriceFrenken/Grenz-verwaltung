import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import type { MarktberichtZeile } from "@/lib/marktbericht/server-fn";
import type { PeriodenArt } from "@/lib/marktbericht/typen";

const STATUS: Record<MarktberichtZeile["status"], string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
};

function periodeLabel(schluessel: string): string {
  const [jahr, art] = schluessel.split("-");
  return art === "H1" ? `1. Halbjahr ${jahr}` : `Gesamtjahr ${jahr}`;
}

/** Vorschlag: im zweiten Halbjahr der H1-Bericht, im ersten Halbjahr der Jahresbericht des Vorjahres. */
function vorschlag(): { jahr: number; art: PeriodenArt } {
  const jetzt = new Date();
  return jetzt.getMonth() >= 6
    ? { jahr: jetzt.getFullYear(), art: "H1" }
    : { jahr: jetzt.getFullYear() - 1, art: "GJ" };
}

export function MarktberichtListePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const navigate = useNavigate();
  const [liste, setListe] = useState<MarktberichtZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [jahr, setJahr] = useState(vorschlag().jahr);
  const [art, setArt] = useState<PeriodenArt>(vorschlag().art);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { marktberichteListeFn } =
        await import("@/lib/marktbericht/server-fn");
      setListe(
        await marktberichteListeFn({ data: { supabaseAccessToken: token } }),
      );
      setFehler(null);
    } catch (e) {
      setFehler(
        e instanceof Error
          ? e.message
          : "Berichte konnten nicht geladen werden.",
      );
      setListe([]);
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const anlegen = async () => {
    setBusy(true);
    try {
      const { marktberichtAnlegenFn } =
        await import("@/lib/marktbericht/server-fn");
      const neu = await marktberichtAnlegenFn({
        data: { supabaseAccessToken: token, periode: { jahr, art } },
      });
      toast.success("Bericht angelegt, Kennzahlen eingefroren.");
      void navigate({ to: "/tools/marktbericht/$id", params: { id: neu.id } });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Bericht konnte nicht angelegt werden.",
        {
          duration: 12_000,
        },
      );
    } finally {
      setBusy(false);
    }
  };

  const jahre = Array.from(
    { length: 4 },
    (_, i) => new Date().getFullYear() - 2 + i,
  );

  return (
    <>
      <PageHeader
        titel="Marktbericht Zinshäuser Rheinland"
        beschreibung="Halbjahres- und Jahresbericht im Grenz-&-Co.-Design. Grundlage sind die eigenen Daten (Exposé-Eingang, Ankaufsprofile, Salesforce, Markt-Radar), die Zinsen der Bundesbank und zitierte Kennzahlen großer Häuser."
      />
      <PageWrapper>
        <div className="flex max-w-5xl flex-col gap-6">
          <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold text-heading">
              Neuer Bericht
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Periode
                <select
                  id="mb-art"
                  className="h-9 border border-input bg-background px-2 text-sm text-heading"
                  value={art}
                  onChange={(e) => setArt(e.target.value as PeriodenArt)}
                >
                  <option value="H1">1. Halbjahr (Stichtag 30.06.)</option>
                  <option value="GJ">Gesamtjahr (Stichtag 31.12.)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Jahr
                <select
                  id="mb-jahr"
                  className="h-9 border border-input bg-background px-2 text-sm text-heading"
                  value={jahr}
                  onChange={(e) => setJahr(Number(e.target.value))}
                >
                  {jahre.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void anlegen()} disabled={busy || !token}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Bericht anlegen
              </Button>
            </div>
            <p className="text-xs text-text-subtle">
              Läuft die Periode noch, wird der Bericht als vorläufig mit dem
              heutigen Stichtag erstellt. Die Zahlen lassen sich bis zur
              Freigabe neu berechnen.
            </p>
          </section>

          {fehler ? (
            <p className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">
              {fehler}
            </p>
          ) : null}

          <section className="flex flex-col border border-hairline bg-surface">
            <h2 className="border-b border-hairline px-5 py-3 text-sm font-semibold text-heading">
              Berichte
            </h2>
            {liste === null ? (
              <div className="p-5">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : liste.length === 0 ? (
              <p className="p-5 text-sm text-text-muted">
                Noch kein Bericht. Legen Sie oben den ersten an.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {liste.map((b) => (
                  <li key={b.id}>
                    <Link
                      to="/tools/marktbericht/$id"
                      params={{ id: b.id }}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-surface-muted"
                    >
                      <FileText
                        className="h-4 w-4 shrink-0 text-text-muted"
                        strokeWidth={1.5}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium text-heading">
                          {periodeLabel(b.periode)}
                        </span>
                        <span className="text-xs text-text-muted">
                          Stichtag {formatDate(b.stichtag)} · angelegt{" "}
                          {formatDate(b.createdAt)}
                        </span>
                      </div>
                      <span
                        className={
                          b.status === "freigegeben"
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                            : "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                        }
                      >
                        {STATUS[b.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageWrapper>
    </>
  );
}
