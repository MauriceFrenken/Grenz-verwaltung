import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, FileText, Loader2, MoreVertical, Receipt, RefreshCw } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { istTamAusFeldern } from "@/lib/trade-any-machine";

const MAX_ANALYSE_RUNDEN = 50;

type DokumentTypAnzeige = "rechnung" | "expose" | "dokument" | "unbekannt";

function dokumentTypAnzeige(
  eintrag: DokumentPosteingangEintrag | null,
): DokumentTypAnzeige {
  if (!eintrag || eintrag.status === "neu") return "unbekannt";
  if (eintrag.dokumentTyp === "rechnung" || eintrag.istRechnung) return "rechnung";
  if (eintrag.dokumentTyp === "expose") return "expose";
  if (eintrag.dokumentTyp === "dokument") return "dokument";
  if (eintrag.status === "analysiert") return "dokument";
  return "unbekannt";
}

function typLabel(eintrag: DokumentPosteingangEintrag | null): string {
  const typ = dokumentTypAnzeige(eintrag);
  if (typ === "rechnung") return "Rechnung";
  if (typ === "expose") return "Exposé";
  if (typ === "dokument") return "Dokument";
  return "–";
}

function TypIcon({ eintrag }: { eintrag: DokumentPosteingangEintrag }) {
  const typ = dokumentTypAnzeige(eintrag);
  const label = typLabel(eintrag);

  if (eintrag.status === "neu") {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
        title="Analyse läuft"
        aria-label="Analyse läuft"
      >
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden />
      </span>
    );
  }

  const Icon =
    typ === "rechnung" ? Receipt : typ === "expose" ? Building2 : typ === "dokument" ? FileText : null;

  if (!Icon) {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
        aria-hidden
      >
        –
      </span>
    );
  }

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

function normalisierePfadSegment(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findePfadSegmentIndex(
  teile: string[],
  suchtext: string,
  abIndex = 0,
): number {
  const norm = normalisierePfadSegment(suchtext);
  if (!norm) return -1;

  for (let i = abIndex; i < teile.length; i++) {
    const segment = normalisierePfadSegment(teile[i]);
    if (!segment) continue;
    if (segment === norm || segment.includes(norm) || norm.includes(segment)) {
      return i;
    }
  }
  return -1;
}

function ablagePfadKurz(
  pfad: string,
  gesellschaftName: string | null | undefined,
  objektName: string | null | undefined,
): string {
  const teile = pfad
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
  if (teile.length === 0) return pfad;

  const gsName = gesellschaftName?.trim();
  if (!gsName) return pfad;

  const gsIdx = findePfadSegmentIndex(teile, gsName);
  if (gsIdx < 0) return pfad;

  const prefix = gsIdx > 0 ? ".." : "";
  let restStart = gsIdx + 1;
  const objName = objektName?.trim();

  if (!objName) {
    const rest = teile.slice(restStart).join("/");
    if (prefix && rest) return `${prefix}/.../${rest}`;
    if (prefix) return `${prefix}/...`;
    if (rest) return `.../${rest}`;
    return "...";
  }

  const objIdx = findePfadSegmentIndex(teile, objName, restStart);
  if (objIdx >= 0) {
    restStart = objIdx + 1;
  }

  const rest = teile.slice(restStart).join("/");
  if (!rest) return prefix || "–";
  return prefix ? `${prefix}/${rest}` : rest;
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

function ablagePfad(eintrag: DokumentPosteingangEintrag | null): string | null {
  if (!eintrag || eintrag.status === "neu") return null;
  if (eintrag.dokumentTyp !== "dokument" && eintrag.dokumentTyp !== null) {
    return null;
  }
  return (
    eintrag.ablageOrdnerPfad?.trim() ||
    eintrag.felder?.ordnerPfad?.value?.trim() ||
    null
  );
}

function ablageBetragText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || eintrag.status === "neu") return "–";

  if (istRechnungEintrag(eintrag)) {
    const betrag = eintrag.felder?.rechnungsbetrag?.value?.trim();
    if (!betrag) return "–";
    const waehrung = eintrag.felder?.waehrung?.value?.trim();
    return waehrung ? `${betrag} ${waehrung}` : betrag;
  }

  const pfad = ablagePfad(eintrag);
  if (!pfad) return "–";

  const gs = gesellschaftText(eintrag);
  const obj = objektText(eintrag);
  const gsName = gs !== "–" ? gs : null;
  const objName = obj !== "–" ? obj : null;

  return ablagePfadKurz(pfad, gsName, objName);
}

function absenderText(eintrag: DokumentPosteingangEintrag): string {
  return eintrag.absenderName || eintrag.absenderMail || "–";
}

function absenderTitel(eintrag: DokumentPosteingangEintrag): string | undefined {
  const name = eintrag.absenderName?.trim();
  const mail = eintrag.absenderMail?.trim();
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
  if (istTamAusFeldern(eintrag.felder)) return true;
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

  const [eintraege, setEintraege] = useState<DokumentPosteingangEintrag[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aktionId, setAktionId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEintraege([]);
      setFehler(null);
      setLaedt(false);
      return;
    }

    let cancelled = false;
    setLaedt(true);
    setFehler(null);

    void (async () => {
      try {
        const { dokumentPosteingangSyncFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );

        const erst = await dokumentPosteingangSyncFn({
          data: { supabaseAccessToken: token, maxAnalysen: 0 },
        });
        if (cancelled) return;
        setEintraege(erst.eintraege);
        setLaedt(false);

        let offen = erst.offen;
        for (let runde = 0; offen > 0 && runde < MAX_ANALYSE_RUNDEN; runde++) {
          setAnalyseLaeuft(true);
          const weiter = await dokumentPosteingangSyncFn({
            data: { supabaseAccessToken: token, maxAnalysen: 1 },
          });
          if (cancelled) return;
          if (weiter.eintraege.length > 0) {
            const aktualisiert = new Map(
              weiter.eintraege.map((e) => [e.id, e]),
            );
            setEintraege((prev) =>
              prev.map((e) => aktualisiert.get(e.id) ?? e),
            );
          }
          offen = weiter.offen;
        }
      } catch (e) {
        if (cancelled) return;
        setEintraege([]);
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
        setEintraege((prev) =>
          prev.map((e) => (e.id === aktualisiert.id ? aktualisiert : e)),
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
        setEintraege((prev) =>
          prev.map((e) =>
            e.id === eintrag.id
              ? {
                  ...e,
                  status: "abgelegt" as const,
                  abgelegtAm: new Date().toISOString(),
                }
              : e,
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

  const zuTam = useCallback(
    async (eintrag: DokumentPosteingangEintrag) => {
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangZuTamFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        await dokumentPosteingangZuTamFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        toast.info("Zu TAM wird in einem späteren Schritt implementiert.");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Weiterleitung fehlgeschlagen.",
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
        setEintraege((prev) =>
          prev.filter(
            (e) =>
              !(
                e.postfach === postfach &&
                e.graphNachrichtId === nachrichtId
              ),
          ),
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

  const spalten: Column<DokumentPosteingangEintrag>[] = [
    {
      key: "typ",
      header: "",
      className: "w-12 min-w-[3rem] px-2",
      render: (e) => <TypIcon eintrag={e} />,
    },
    {
      key: "datei",
      header: "Dateiname",
      className: "min-w-[14rem] max-w-[20rem]",
      render: (e) => (
        <ZellText
          text={e.anhangName || "–"}
          className="font-medium text-heading"
        />
      ),
    },
    {
      key: "gesellschaft",
      header: "Gesellschaft",
      className: "min-w-[11rem] max-w-[16rem]",
      render: (e) => (
        <ZellText text={gesellschaftText(e)} className="text-foreground" />
      ),
    },
    {
      key: "objekt",
      header: "Objekt",
      className: "min-w-[11rem] max-w-[16rem]",
      render: (e) => (
        <ZellText text={objektText(e)} className="text-foreground" />
      ),
    },
    {
      key: "ablageBetrag",
      header: "Betrag / Ablage",
      className: "min-w-[12rem] max-w-[18rem]",
      render: (e) => {
        const text = ablageBetragText(e);
        const vollerPfad = ablagePfad(e);
        return (
          <ZellText
            text={text}
            className="text-foreground"
            title={vollerPfad && text !== vollerPfad ? vollerPfad : undefined}
          />
        );
      },
    },
    {
      key: "betreff",
      header: "Betreff",
      className: "min-w-[12rem] max-w-[18rem]",
      render: (e) => (
        <ZellText
          text={e.betreff || "(kein Betreff)"}
          className="text-foreground"
        />
      ),
    },
    {
      key: "absender",
      header: "Absender",
      className: "min-w-[11rem] max-w-[16rem]",
      render: (e) => (
        <ZellText
          text={absenderText(e)}
          className="text-foreground"
          title={absenderTitel(e)}
        />
      ),
    },
    {
      key: "check",
      header: "",
      align: "right",
      sticky: "right",
      stickyBreitePx: 88,
      className: "w-[5.5rem] min-w-[5.5rem] px-2",
      render: (eintrag) => {
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
      sticky: "right",
      stickyBreitePx: 120,
      className: "w-[7.5rem] min-w-[7.5rem] px-2",
      render: (eintrag) => {
        const bereit = istBereit(eintrag);
        const laedtZeile = aktionId === eintrag?.id;
        const istExpose = eintrag?.dokumentTyp === "expose";
        const istTam = Boolean(eintrag && istTamAusFeldern(eintrag.felder));

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
                    eintrag.graphNachrichtId,
                    eintrag.postfach,
                  )
                }
              >
                Zu Exposés
              </Button>
            </PermissionGate>
          );
        }

        if (istTam) {
          return (
            <PermissionGate
              berechtigung="aktion.dokumente.pruefordner.zu_tam"
              skeletonClassName="w-full"
            >
              <Button
                size="sm"
                className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
                disabled={laedtZeile}
                onClick={() => void zuTam(eintrag)}
              >
                zu TAM
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

        if (!ablagePfad(eintrag)) {
          return <span className="block h-8" aria-hidden />;
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
      sticky: "right",
      stickyBreitePx: 48,
      className: "w-12 min-w-[3rem] pl-2 pr-3",
      render: (eintrag) => {
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
                onClick={(ev) => ev.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
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
          zeilen={eintraege}
          scrollX
          isLoading={laedt}
          isEmpty={!laedt && !fehler && eintraege.length === 0}
          emptyTitel="Keine Anhänge im Postfach"
          rowKey={(e) => e.id}
        />
      </PageWrapper>
    </>
  );
}
