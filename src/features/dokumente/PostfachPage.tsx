import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FileQuestion,
  FileText,
  Image,
  Loader2,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function istRechnungEintrag(eintrag: DokumentPosteingangEintrag | null): boolean {
  return eintrag?.dokumentTyp === "rechnung" || Boolean(eintrag?.istRechnung);
}

function ZellText({
  text,
  title,
  className,
}: {
  text: string | null | undefined;
  title?: string;
  className?: string;
}) {
  const wert = text?.trim() || "–";
  const tooltip = title?.trim() || (wert !== "–" ? wert : undefined);
  return (
    <span
      className={cn("block min-w-0 truncate", className)}
      title={tooltip}
    >
      {wert}
    </span>
  );
}

function gesellschaftText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || eintrag.status === "neu") return "–";
  return eintrag.felder?.gesellschaftName?.value?.trim() || "–";
}

function objektText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || eintrag.status === "neu") return "–";
  return eintrag.felder?.objektBezeichnung?.value?.trim() || "–";
}

function ablageBetragText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || eintrag.status === "neu") return "–";

  if (istRechnungEintrag(eintrag)) {
    const betrag = eintrag.felder?.rechnungsbetrag?.value?.trim();
    if (!betrag) return "–";
    const waehrung = eintrag.felder?.waehrung?.value?.trim();
    return waehrung ? `${betrag} ${waehrung}` : betrag;
  }

  if (eintrag.dokumentTyp === "dokument" || eintrag.dokumentTyp === null) {
    const pfad =
      eintrag.ablageOrdnerPfad?.trim() ||
      eintrag.felder?.ordnerPfad?.value?.trim();
    return pfad || "–";
  }

  return "–";
}

function absenderText(nachricht: Zeile["nachricht"]): string {
  return nachricht.absenderName || nachricht.absenderMail || "–";
}

function absenderTitel(nachricht: Zeile["nachricht"]): string | undefined {
  const name = nachricht.absenderName?.trim();
  const mail = nachricht.absenderMail?.trim();
  if (name && mail && name !== mail) return `${name} (${mail})`;
  return name || mail || undefined;
}

function kannPruefen(
  eintrag: DokumentPosteingangEintrag | null,
): eintrag is DokumentPosteingangEintrag {
  if (!eintrag) return false;
  return eintrag.status === "analysiert" || eintrag.status === "fehler";
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
      className: "w-[11%]",
      render: (z) => (
        <ZellText
          text={absenderText(z.nachricht)}
          className="text-foreground"
          title={absenderTitel(z.nachricht)}
        />
      ),
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "w-[19%]",
      render: (z) => (
        <ZellText
          text={z.nachricht.betreff || "(kein Betreff)"}
          className="font-medium text-heading"
        />
      ),
    },
    {
      key: "typ",
      header: "Typ",
      className: "w-[8%]",
      render: (z) => <ZellText text={typLabel(z.eintrag)} className="text-heading" />,
    },
    {
      key: "gesellschaft",
      header: "Gesellschaft",
      className: "w-[12%]",
      render: (z) => (
        <ZellText text={gesellschaftText(z.eintrag)} className="text-foreground" />
      ),
    },
    {
      key: "objekt",
      header: "Objekt",
      className: "w-[12%]",
      render: (z) => (
        <ZellText text={objektText(z.eintrag)} className="text-foreground" />
      ),
    },
    {
      key: "ablageBetrag",
      header: "Ablage / Betrag",
      className: "w-[14%]",
      render: (z) => (
        <ZellText text={ablageBetragText(z.eintrag)} className="text-foreground" />
      ),
    },
    {
      key: "check",
      header: "",
      align: "right",
      className: "w-[4.5rem] px-2",
      render: (z) => {
        const eintrag = z.eintrag;
        const pruefbar = kannPruefen(eintrag);
        const laedtZeile = aktionId === eintrag?.id;
        const istExpose = eintrag?.dokumentTyp === "expose";
        const bereit = istBereit(eintrag);
        const zeigeCheck = !(istExpose && bereit);

        if (!zeigeCheck) {
          return <span className="block h-8" aria-hidden />;
        }

        return (
          <PermissionGate
            berechtigung="aktion.dokumente.pruefordner.pruefen"
            skeletonClassName="w-full"
          >
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full border-foreground text-foreground"
              disabled={!pruefbar || laedtZeile}
              onClick={() => eintrag && pruefen(eintrag)}
            >
              Check
            </Button>
          </PermissionGate>
        );
      },
    },
    {
      key: "aktion",
      header: "",
      align: "right",
      className: "w-[7rem] px-2",
      render: (z) => {
        const eintrag = z.eintrag;
        const bereit = istBereit(eintrag);
        const laedtZeile = aktionId === eintrag?.id;
        const istExpose = eintrag?.dokumentTyp === "expose";

        if (!bereit || !eintrag) {
          return <span className="block h-8" aria-hidden />;
        }

        if (istExpose) {
          return (
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.exposes_verschieben"
              skeletonClassName="w-full"
            >
              <Button
                size="sm"
                className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
                disabled={laedtZeile}
                onClick={() =>
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
          );
        }

        if (istRechnungEintrag(eintrag)) {
          return (
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.buchen"
              skeletonClassName="w-full"
            >
              <Button
                size="sm"
                className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
                disabled={laedtZeile}
                onClick={() => void direktAusfuehren(eintrag)}
              >
                zu DATEV
              </Button>
            </PermissionGate>
          );
        }

        return (
          <PermissionGate
            berechtigung="aktion.dokumente.pruefordner.ablegen"
            skeletonClassName="w-full"
          >
            <Button
              size="sm"
              className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
              disabled={laedtZeile}
              onClick={() => void direktAusfuehren(eintrag)}
            >
              Ablegen
            </Button>
          </PermissionGate>
        );
      },
    },
    {
      key: "menu",
      header: "",
      align: "right",
      className: "w-10 pl-2 pr-3",
      render: (z) => {
        const eintrag = z.eintrag;
        const laedtZeile = aktionId === eintrag?.id;
        const kannWiederholen = Boolean(
          eintrag &&
            (eintrag.status === "analysiert" || eintrag.status === "fehler"),
        );

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-foreground"
                disabled={laedtZeile}
                aria-label="Weitere Aktionen"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {kannWiederholen ? (
                <PermissionGate berechtigung="aktion.dokumente.pruefordner.analyse_wiederholen">
                  <DropdownMenuItem
                    disabled={laedtZeile}
                    onClick={() => eintrag && void analyseWiederholen(eintrag)}
                  >
                    <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                    KI-Neustart
                  </DropdownMenuItem>
                </PermissionGate>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
          festLayout
          isLoading={laedt}
          isEmpty={!laedt && !fehler && zeilen.length === 0}
          emptyTitel="Keine Nachrichten mit Anhang"
          rowKey={(z) => `${z.nachricht.postfach}:${z.nachricht.id}`}
        />
      </PageWrapper>
    </>
  );
}
