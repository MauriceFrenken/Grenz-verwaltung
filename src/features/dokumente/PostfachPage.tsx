import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FileQuestion,
  FileText,
  Image,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { hatAnalyseWerte } from "@/lib/dokument-postfach/client";
import type { DokumentPosteingangEintrag } from "@/lib/dokument-postfach/typen";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";
import type { GraphAnhangArt } from "@/lib/microsoft/graph";
import { cn } from "@/lib/utils";

const MAX_ANALYSE_RUNDEN = 50;

type Zeile = {
  nachricht: DokumentPosteingangNachricht;
  eintrag: DokumentPosteingangEintrag | null;
};

function AnhangIcon({
  art,
  dateiname,
}: {
  art: GraphAnhangArt;
  dateiname?: string | null;
}) {
  const Icon =
    art === "pdf" || art === "office" || art === "datei"
      ? FileText
      : art === "bild"
        ? Image
        : FileQuestion;
  const label =
    art === "pdf"
      ? "PDF"
      : art === "office"
        ? "Office"
        : art === "bild"
          ? "Bild"
          : art === "datei"
            ? dateiname?.trim() || "Datei"
            : "Kein Anhang";
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </span>
  );
}

function typLabel(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || eintrag.status === "neu") return "–";
  if (eintrag.dokumentTyp === "rechnung") return "Rechnung";
  if (eintrag.dokumentTyp === "expose") return "Exposé";
  if (eintrag.dokumentTyp === "dokument") return "Dokument";
  if (eintrag.istRechnung) return "Rechnung";
  if (eintrag.status === "analysiert") return "Dokument";
  return "–";
}

function AnalyseStatus({ zeile }: { zeile: Zeile }) {
  const { eintrag } = zeile;

  if (!eintrag || eintrag.status === "neu") {
    return (
      <span className="inline-flex items-center gap-2 text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
        KI-Analyse
      </span>
    );
  }
  if (eintrag.status === "fehler") {
    return (
      <span className="text-destructive" title={eintrag.analyseFehler ?? undefined}>
        Analyse fehlgeschlagen
      </span>
    );
  }
  if (eintrag.status === "abgelegt") {
    return <span className="text-text-muted">Abgelegt</span>;
  }
  if (eintrag.status === "gebucht") {
    return <span className="text-text-muted">Gebucht</span>;
  }
  return <span className="font-medium text-heading">{typLabel(eintrag)}</span>;
}

function istBereit(eintrag: DokumentPosteingangEintrag | null): eintrag is DokumentPosteingangEintrag {
  if (!eintrag || eintrag.status !== "analysiert") return false;
  if (eintrag.dokumentTyp === "expose") return true;
  return hatAnalyseWerte(eintrag.felder);
}

export function PostfachPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const token = session?.access_token ?? "";

  const besuchKey = useRouterState({
    select: (s) =>
      s.location.state.__TSR_key ??
      s.location.state.key ??
      `${s.location.pathname}:${s.location.href}`,
  });

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aktionId, setAktionId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setZeilen([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    const uebernehmen = (
      nachrichten: DokumentPosteingangNachricht[],
      eintraege: DokumentPosteingangEintrag[],
    ) => {
      const nachId = new Map(
        eintraege.map((e) => [`${e.postfach}:${e.graphNachrichtId}`, e]),
      );
      setZeilen(
        nachrichten.map((n) => ({
          nachricht: n,
          eintrag: nachId.get(`${n.postfach}:${n.id}`) ?? null,
        })),
      );
    };

    void (async () => {
      try {
        const { dokumentPosteingangSyncFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );

        const erst = await dokumentPosteingangSyncFn({
          data: { supabaseAccessToken: token, maxAnalysen: 0 },
        });
        if (cancelled) return;
        uebernehmen(erst.nachrichten, erst.eintraege);
        setLaedt(false);

        let offen = erst.offen;
        for (let runde = 0; offen > 0 && runde < MAX_ANALYSE_RUNDEN; runde++) {
          setAnalyseLaeuft(true);
          const weiter = await dokumentPosteingangSyncFn({
            data: { supabaseAccessToken: token, maxAnalysen: 1 },
          });
          if (cancelled) return;
          if (weiter.eintraege.length > 0) {
            setZeilen((prev) =>
              prev.map((z) => {
                const update = weiter.eintraege.find(
                  (e) =>
                    e.graphNachrichtId === z.nachricht.id &&
                    e.postfach === z.nachricht.postfach,
                );
                return update ? { ...z, eintrag: update } : z;
              }),
            );
          }
          offen = weiter.offen;
        }
      } catch (e) {
        if (cancelled) return;
        setZeilen([]);
        setFehler(
          e instanceof Error ? e.message : "Postfach konnte nicht geladen werden.",
        );
      } finally {
        if (!cancelled) {
          setLaedt(false);
          setAnalyseLaeuft(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, besuchKey, reloadKey]);

  const pruefen = useCallback(
    (eintrag: DokumentPosteingangEintrag) => {
      void navigate({
        to: "/dokumente/pruefung",
        search: { postfach: eintrag.id },
      });
    },
    [navigate],
  );

  const analyseWiederholen = useCallback(
    async (eintrag: DokumentPosteingangEintrag) => {
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangAnalyseWiederholenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const aktualisiert = await dokumentPosteingangAnalyseWiederholenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        setZeilen((prev) =>
          prev.map((z) =>
            z.eintrag?.id === aktualisiert.id
              ? { ...z, eintrag: aktualisiert }
              : z,
          ),
        );
        if (aktualisiert.status === "fehler") {
          toast.error("KI-Analyse fehlgeschlagen.", {
            description: aktualisiert.analyseFehler ?? undefined,
            duration: 12_000,
          });
        } else {
          toast.success("KI-Analyse abgeschlossen.");
        }
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "KI-Analyse konnte nicht wiederholt werden.",
        );
      } finally {
        setAktionId(null);
      }
    },
    [token],
  );

  const direktAusfuehren = useCallback(
    async (eintrag: DokumentPosteingangEintrag) => {
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangSchnellAusfuehrenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const ergebnis = await dokumentPosteingangSchnellAusfuehrenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        if (ergebnis.aktion === "buchen") {
          toast.info("Buchen wird in einem späteren Schritt implementiert.");
          return;
        }
        toast.success(`Abgelegt: ${ergebnis.ordnerPfad}`);
        setZeilen((prev) =>
          prev.map((z) =>
            z.eintrag?.id === eintrag.id
              ? {
                  ...z,
                  eintrag: {
                    ...z.eintrag,
                    status: "abgelegt" as const,
                    abgelegtAm: new Date().toISOString(),
                  },
                }
              : z,
          ),
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Aktion fehlgeschlagen.",
          { duration: 12_000 },
        );
      } finally {
        setAktionId(null);
      }
    },
    [token],
  );

  const zuExposesVerschieben = useCallback(
    async (eintrag: DokumentPosteingangEintrag, nachrichtId: string, postfach: string) => {
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangZuExposesVerschiebenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const { zielPostfach } = await dokumentPosteingangZuExposesVerschiebenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        setZeilen((prev) =>
          prev.filter((z) => `${z.nachricht.postfach}:${z.nachricht.id}` !== `${postfach}:${nachrichtId}`),
        );
        toast.success(`Nach Exposés verschoben (${zielPostfach}).`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Verschieben fehlgeschlagen.",
          { duration: 12_000 },
        );
      } finally {
        setAktionId(null);
      }
    },
    [token],
  );

  const spalten: Column<Zeile>[] = [
    {
      key: "anhang",
      header: "",
      className: "w-10 pr-0",
      render: (z) => (
        <AnhangIcon
          art={z.nachricht.anhangArt}
          dateiname={z.nachricht.primaerAnhang?.name}
        />
      ),
    },
    {
      key: "absender",
      header: "Absender",
      className: "max-w-[10rem]",
      render: (z) => (
        <span className="truncate block" title={z.nachricht.absenderMail ?? undefined}>
          {z.nachricht.absenderName || z.nachricht.absenderMail || "–"}
        </span>
      ),
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "max-w-0 w-full",
      render: (z) => (
        <span className="truncate block font-medium text-heading">
          {z.nachricht.betreff || "(kein Betreff)"}
        </span>
      ),
    },
    {
      key: "typ",
      header: "Typ",
      className: "w-24",
      render: (z) => (
        <span className="text-heading">{typLabel(z.eintrag)}</span>
      ),
    },
    {
      key: "status",
      header: "KI-Status",
      className: "w-36",
      render: (z) => <AnalyseStatus zeile={z} />,
    },
    {
      key: "aktion",
      header: "",
      align: "right",
      className: "w-[1%] whitespace-nowrap",
      render: (z) => {
        const eintrag = z.eintrag;
        const bereit = istBereit(eintrag);
        const laedtZeile = aktionId === eintrag?.id;
        const kannWiederholen = Boolean(
          eintrag &&
          (eintrag.status === "analysiert" || eintrag.status === "fehler"),
        );
        const istExpose = eintrag?.dokumentTyp === "expose";
        const istRechnung =
          eintrag?.dokumentTyp === "rechnung" || Boolean(eintrag?.istRechnung);

        if (istExpose && bereit) {
          return (
            <div className="flex items-center justify-end gap-1.5">
              {kannWiederholen ? (
                <PermissionGate
                  berechtigung="aktion.dokumente.pruefordner.analyse_wiederholen"
                  skeletonClassName="w-8"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 border-foreground text-foreground"
                    disabled={laedtZeile}
                    aria-label="KI-Analyse wiederholen"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (eintrag) void analyseWiederholen(eintrag);
                    }}
                  >
                    {laedtZeile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                  </Button>
                </PermissionGate>
              ) : null}
              <PermissionGate
                berechtigung="aktion.dokumente.pruefordner.exposes_verschieben"
                skeletonClassName="w-24"
              >
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-heading"
                  disabled={laedtZeile}
                  onClick={() =>
                    eintrag &&
                    void zuExposesVerschieben(
                      eintrag,
                      z.nachricht.id,
                      z.nachricht.postfach,
                    )
                  }
                >
                  Zu Exposés
                </Button>
              </PermissionGate>
            </div>
          );
        }

        return (
          <div className="flex items-center justify-end gap-1.5">
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.pruefen"
              skeletonClassName="w-16"
            >
              <Button
                size="sm"
                variant="outline"
                className="border-foreground text-foreground"
                disabled={!bereit || laedtZeile}
                onClick={() => eintrag && pruefen(eintrag)}
              >
                Check
              </Button>
            </PermissionGate>

            {kannWiederholen ? (
              <PermissionGate
                berechtigung="aktion.dokumente.pruefordner.analyse_wiederholen"
                skeletonClassName="w-8"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 border-foreground text-foreground"
                  disabled={laedtZeile}
                  aria-label="KI-Analyse wiederholen"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (eintrag) void analyseWiederholen(eintrag);
                  }}
                >
                  {laedtZeile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </Button>
              </PermissionGate>
            ) : null}

            {bereit ? (
              istRechnung ? (
                <PermissionGate
                  berechtigung="aktion.dokumente.pruefordner.buchen"
                  skeletonClassName="w-16"
                >
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-heading"
                    disabled={laedtZeile}
                    onClick={() => eintrag && void direktAusfuehren(eintrag)}
                  >
                    zu DATEV
                  </Button>
                </PermissionGate>
              ) : (
                <PermissionGate
                  berechtigung="aktion.dokumente.pruefordner.ablegen"
                  skeletonClassName="w-16"
                >
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-heading"
                    disabled={laedtZeile}
                    onClick={() => eintrag && void direktAusfuehren(eintrag)}
                  >
                    Ablegen
                  </Button>
                </PermissionGate>
              )
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        titel="Postfach"
        nebenTitel={
          analyseLaeuft ? (
            <span className="inline-flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
              KI-Analyse läuft
            </span>
          ) : undefined
        }
        aktionen={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-foreground text-foreground"
            disabled={laedt || !token}
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Aktualisieren"
          >
            <RefreshCw
              className={cn("h-4 w-4", laedt && "animate-spin")}
              strokeWidth={1.5}
            />
          </Button>
        }
      />
      <PageWrapper>
        {fehler ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {fehler}
          </p>
        ) : null}
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={laedt}
          isEmpty={!laedt && !fehler && zeilen.length === 0}
          emptyTitel="Keine Nachrichten mit Anhang"
          rowKey={(z) => `${z.nachricht.postfach}:${z.nachricht.id}`}
        />
      </PageWrapper>
    </>
  );
}
