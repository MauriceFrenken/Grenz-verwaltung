import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Building2,
  FileText,
  Flag,
  Loader2,
  MoreVertical,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { hatAnalyseWerte } from "@/lib/dokument-postfach/client";
import {
  istAnalyseOffen,
  type DokumentPosteingangEintrag,
  type DokumentPosteingangSyncErgebnis,
} from "@/lib/dokument-postfach/typen";
import {
  GRAPH_GC_MS,
  GRAPH_STALE_MS,
  graphKeys,
  holeDokumentPosteingang,
} from "@/lib/graph-cache";
import { cn } from "@/lib/utils";
import { istTamAusFeldern } from "@/lib/trade-any-machine";

const MAX_ANALYSE_RUNDEN = 500;
/** Pro Server-Runde: bis zu 6 Mails, davon 3 parallel. */
const ANALYSEN_PRO_RUNDE = 6;

type DokumentTypAnzeige = "rechnung" | "expose" | "dokument" | "unbekannt";

function dokumentTypAnzeige(
  eintrag: DokumentPosteingangEintrag | null,
): DokumentTypAnzeige {
  if (!eintrag || istAnalyseOffen(eintrag.status)) return "unbekannt";
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

function TypIcon({
  eintrag,
  analyseLaeuft,
}: {
  eintrag: DokumentPosteingangEintrag;
  analyseLaeuft: boolean;
}) {
  const typ = dokumentTypAnzeige(eintrag);
  const label = typLabel(eintrag);

  if (istAnalyseOffen(eintrag.status)) {
    if (analyseLaeuft || eintrag.status === "in_analyse") {
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
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
        title="Noch nicht analysiert"
        aria-label="Noch nicht analysiert"
      >
        –
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

function formatEingangsdatum(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "–";
  }
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

  // Immer vom Pfadende her kürzen — letzter Ordner bleibt lesbar.
  const mitEllipsis = (segmente: string[]) => {
    if (segmente.length === 0) return "–";
    if (segmente.length === teile.length) return segmente.join("/");
    return `…/${segmente.join("/")}`;
  };

  const gsName = gesellschaftName?.trim();
  if (!gsName) {
    return teile.length <= 3 ? teile.join("/") : mitEllipsis(teile.slice(-3));
  }

  const gsIdx = findePfadSegmentIndex(teile, gsName);
  if (gsIdx < 0) {
    return teile.length <= 3 ? teile.join("/") : mitEllipsis(teile.slice(-3));
  }

  let restStart = gsIdx + 1;
  const objName = objektName?.trim();
  if (objName) {
    const objIdx = findePfadSegmentIndex(teile, objName, restStart);
    if (objIdx >= 0) restStart = objIdx + 1;
  }

  const rest = teile.slice(restStart);
  if (rest.length === 0) {
    // Nur Gesellschaft/Objekt — letzten relevanten Ordner zeigen
    return mitEllipsis(teile.slice(Math.max(0, teile.length - 2)));
  }
  // Nach Objekt: Unterordner ab dem Ende; bei sehr langen Resten die letzten 3
  if (rest.length <= 3) return mitEllipsis(rest);
  return mitEllipsis(rest.slice(-3));
}

function istRechnungEintrag(eintrag: DokumentPosteingangEintrag | null): boolean {
  return eintrag?.dokumentTyp === "rechnung" || Boolean(eintrag?.istRechnung);
}

/** Erkannte Rechnungen laufen über Rechnungsfreigabe-Kanban, nicht im Postfach. */
function istPostfachEintrag(eintrag: DokumentPosteingangEintrag): boolean {
  return !istRechnungEintrag(eintrag);
}

function ZellText({
  text,
  title,
  className,
  /** Bei langen Pfaden das Ende sichtbar halten (letzter Ordner). */
  truncateFrom = "end",
}: {
  text: string | null | undefined;
  title?: string;
  className?: string;
  truncateFrom?: "end" | "start";
}) {
  const wert = text?.trim() || "–";
  const tooltip = title?.trim() || (wert !== "–" ? wert : undefined);

  if (truncateFrom === "start") {
    return (
      <span
        className={cn(
          "block min-w-0 overflow-hidden whitespace-nowrap text-left [direction:rtl]",
          className,
        )}
        title={tooltip}
      >
        <span className="[direction:ltr] [unicode-bidi:plaintext]">{wert}</span>
      </span>
    );
  }

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
  if (!eintrag || istAnalyseOffen(eintrag.status)) return "–";
  return eintrag.felder?.gesellschaftName?.value?.trim() || "–";
}

function objektText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || istAnalyseOffen(eintrag.status)) return "–";
  return eintrag.felder?.objektBezeichnung?.value?.trim() || "–";
}

function ablagePfad(eintrag: DokumentPosteingangEintrag | null): string | null {
  if (!eintrag || istAnalyseOffen(eintrag.status)) return null;
  if (eintrag.dokumentTyp === "expose") return null;
  return (
    eintrag.ablageOrdnerPfad?.trim() ||
    eintrag.felder?.ordnerPfad?.value?.trim() ||
    null
  );
}

function ablagePfadText(eintrag: DokumentPosteingangEintrag | null): string {
  if (!eintrag || istAnalyseOffen(eintrag.status)) return "–";

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

function istBereit(eintrag: DokumentPosteingangEintrag | null): eintrag is DokumentPosteingangEintrag {
  if (!eintrag || eintrag.status !== "analysiert") return false;
  if (eintrag.dokumentTyp === "expose") return true;
  if (istTamAusFeldern(eintrag.felder)) return true;
  return hatAnalyseWerte(eintrag.felder);
}

/** Server-Updates ohne Graph-Kategorien — Flag aus der Liste behalten. */
function mitErhaltenemAblegenFlag(
  bisher: DokumentPosteingangEintrag,
  neu: DokumentPosteingangEintrag,
): DokumentPosteingangEintrag {
  return {
    ...neu,
    hatAblegenKategorie: bisher.hatAblegenKategorie || neu.hatAblegenKategorie,
  };
}

export function PostfachPage() {
  const { session, benutzer } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = session?.access_token ?? "";
  const userId = benutzer?.id ?? "";
  const queryKey = graphKeys.dokumentPosteingang(userId);

  const [analyseLaeuft, setAnalyseLaeuft] = useState(false);
  const [ablegenLaeuft, setAblegenLaeuft] = useState(false);
  const [aktionId, setAktionId] = useState<string | null>(null);
  const analyseAbbruchRef = useRef(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      holeDokumentPosteingang(token, (snap) => {
        queryClient.setQueryData(queryKey, snap);
      }),
    enabled: Boolean(token && userId),
    staleTime: GRAPH_STALE_MS,
    gcTime: GRAPH_GC_MS,
  });

  const eintraege = data?.eintraege ?? [];
  const offen = data?.offen ?? 0;
  const laedt = isLoading && !data;
  const fehler =
    error instanceof Error
      ? error.message
      : error
        ? "Postfach konnte nicht geladen werden."
        : null;

  const setCache = useCallback(
    (
      updater: (
        prev: DokumentPosteingangSyncErgebnis,
      ) => DokumentPosteingangSyncErgebnis,
    ) => {
      queryClient.setQueryData<DokumentPosteingangSyncErgebnis>(
        queryKey,
        (prev) =>
          updater(
            prev ?? {
              postfaecher: [],
              nachrichten: [],
              eintraege: [],
              offen: 0,
            },
          ),
      );
    },
    [queryClient, queryKey],
  );

  const setEintraege = useCallback(
    (
      next:
        | DokumentPosteingangEintrag[]
        | ((prev: DokumentPosteingangEintrag[]) => DokumentPosteingangEintrag[]),
    ) => {
      setCache((prev) => ({
        ...prev,
        eintraege: typeof next === "function" ? next(prev.eintraege) : next,
      }));
    },
    [setCache],
  );

  const setOffen = useCallback(
    (next: number | ((prev: number) => number)) => {
      setCache((prev) => ({
        ...prev,
        offen: typeof next === "function" ? next(prev.offen) : next,
      }));
    },
    [setCache],
  );

  const postfachZeilen = useMemo(
    () => eintraege.filter(istPostfachEintrag),
    [eintraege],
  );

  // Analyse abbrechen, wenn die Seite verlassen wird.
  useEffect(() => {
    return () => {
      analyseAbbruchRef.current = true;
    };
  }, []);

  const starteAnalyse = useCallback(async () => {
    if (!token || analyseLaeuft || ablegenLaeuft) return;

    analyseAbbruchRef.current = false;
    setAnalyseLaeuft(true);

    try {
      const { dokumentPosteingangSyncFn } = await import(
        "@/lib/dokument-postfach/server-fn"
      );

      let nochOffen = offen;
      for (let runde = 0; runde < MAX_ANALYSE_RUNDEN; runde++) {
        if (analyseAbbruchRef.current) return;
        if (runde > 0 && nochOffen <= 0) break;

        const weiter = await dokumentPosteingangSyncFn({
          data: {
            supabaseAccessToken: token,
            maxAnalysen: ANALYSEN_PRO_RUNDE,
          },
        });
        if (analyseAbbruchRef.current) return;

        if (weiter.eintraege.length > 0) {
          const aktualisiert = new Map(weiter.eintraege.map((e) => [e.id, e]));
          setEintraege((prev) =>
            prev.map((e) => {
              const neu = aktualisiert.get(e.id);
              return neu ? mitErhaltenemAblegenFlag(e, neu) : e;
            }),
          );
        }
        nochOffen = weiter.offen;
        setOffen(nochOffen);
        // Nichts geclaimt (Race/Cron) oder Warteschlange leer → Stopp.
        if (weiter.eintraege.length === 0 || nochOffen <= 0) break;
      }
    } catch (e) {
      if (analyseAbbruchRef.current) return;
      toast.error(
        e instanceof Error ? e.message : "KI-Analyse fehlgeschlagen.",
        { duration: 12_000 },
      );
    } finally {
      if (!analyseAbbruchRef.current) setAnalyseLaeuft(false);
    }
  }, [token, analyseLaeuft, ablegenLaeuft, offen, setEintraege, setOffen]);

  const starteKategorieAblegen = useCallback(async () => {
    if (!token || analyseLaeuft || ablegenLaeuft) return;

    setAblegenLaeuft(true);
    try {
      const { dokumentPosteingangKategorieAblegenFn } = await import(
        "@/lib/dokument-postfach/server-fn"
      );
      const ergebnis = await dokumentPosteingangKategorieAblegenFn({
        data: { supabaseAccessToken: token },
      });
      await refetch();

      if (ergebnis.verarbeitet === 0 && ergebnis.fehlgeschlagen === 0) {
        toast.message("Keine Mails mit Kategorie Ablegen.");
      } else if (ergebnis.fehlgeschlagen > 0) {
        toast.error(
          `${ergebnis.verarbeitet} abgelegt, ${ergebnis.fehlgeschlagen} fehlgeschlagen.`,
          { duration: 12_000 },
        );
      } else {
        toast.success(`${ergebnis.verarbeitet} abgelegt.`);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Ablegen fehlgeschlagen.",
        { duration: 12_000 },
      );
    } finally {
      setAblegenLaeuft(false);
    }
  }, [token, analyseLaeuft, ablegenLaeuft, refetch]);

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
      const warNeu = istAnalyseOffen(eintrag.status);
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangAnalyseWiederholenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const aktualisiert = await dokumentPosteingangAnalyseWiederholenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        setEintraege((prev) =>
          prev.map((e) =>
            e.id === aktualisiert.id
              ? mitErhaltenemAblegenFlag(e, aktualisiert)
              : e,
          ),
        );
        if (warNeu && !istAnalyseOffen(aktualisiert.status)) {
          setOffen((n) => Math.max(0, n - 1));
        }
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
            : warNeu
              ? "KI-Analyse fehlgeschlagen."
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

        if (ergebnis.mailVerschoben) {
          setEintraege((prev) =>
            prev.filter(
              (e) =>
                !(
                  e.postfach === ergebnis.postfach &&
                  e.graphNachrichtId === ergebnis.graphNachrichtId
                ),
            ),
          );
          const ordnerHinweis = ergebnis.mailOrdner
            ? ` · Postfach → ${ergebnis.mailOrdner}`
            : "";
          if (ergebnis.aktion === "gebucht") {
            toast.success(`Zu DATEV: ${ergebnis.ordnerPfad}${ordnerHinweis}`);
          } else if (ergebnis.aktion === "tam") {
            toast.success(`Zu TAM: ${ergebnis.ordnerPfad}${ordnerHinweis}`);
          } else {
            toast.success(`Abgelegt: ${ergebnis.ordnerPfad}${ordnerHinweis}`);
          }
          return;
        }

        const status =
          ergebnis.aktion === "gebucht" ? ("gebucht" as const) : ("abgelegt" as const);
        setEintraege((prev) =>
          prev.map((e) =>
            e.id === eintrag.id
              ? {
                  ...e,
                  status,
                  abgelegtAm: new Date().toISOString(),
                  ablageOrdnerPfad: ergebnis.ordnerPfad,
                }
              : e,
          ),
        );
        if (ergebnis.aktion === "gebucht") {
          toast.success(`Zu DATEV: ${ergebnis.ordnerPfad}`);
        } else if (ergebnis.aktion === "tam") {
          toast.success(`Zu TAM: ${ergebnis.ordnerPfad}`);
        } else {
          toast.success(`Abgelegt: ${ergebnis.ordnerPfad}`);
        }
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
        const ergebnis = await dokumentPosteingangZuTamFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });

        if (ergebnis.mailVerschoben) {
          setEintraege((prev) =>
            prev.filter(
              (e) =>
                !(
                  e.postfach === ergebnis.postfach &&
                  e.graphNachrichtId === ergebnis.graphNachrichtId
                ),
            ),
          );
          toast.success(
            `Zu TAM: ${ergebnis.ordnerPfad}${
              ergebnis.mailOrdner ? ` · Postfach → ${ergebnis.mailOrdner}` : ""
            }`,
          );
        } else {
          setEintraege((prev) =>
            prev.map((e) =>
              e.id === eintrag.id
                ? {
                    ...e,
                    status: "abgelegt" as const,
                    abgelegtAm: new Date().toISOString(),
                    ablageOrdnerPfad: ergebnis.ordnerPfad,
                  }
                : e,
            ),
          );
          toast.success(`Zu TAM: ${ergebnis.ordnerPfad}`);
        }
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

  const archivieren = useCallback(
    async (eintrag: DokumentPosteingangEintrag) => {
      setAktionId(eintrag.id);
      try {
        const { dokumentPosteingangArchivierenFn } = await import(
          "@/lib/dokument-postfach/server-fn"
        );
        const ergebnis = await dokumentPosteingangArchivierenFn({
          data: { supabaseAccessToken: token, eintragId: eintrag.id },
        });
        let entferntNeu = 0;
        setEintraege((prev) => {
          entferntNeu = prev.filter(
            (e) =>
              e.postfach === ergebnis.postfach &&
              e.graphNachrichtId === ergebnis.graphNachrichtId &&
              istAnalyseOffen(e.status),
          ).length;
          return prev.filter(
            (e) =>
              !(
                e.postfach === ergebnis.postfach &&
                e.graphNachrichtId === ergebnis.graphNachrichtId
              ),
          );
        });
        if (entferntNeu > 0) {
          setOffen((n) => Math.max(0, n - entferntNeu));
        }
        toast.success("Archiviert.");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Archivieren fehlgeschlagen.",
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
      header: "Typ",
      className: "w-12 min-w-[3rem] px-2",
      render: (e) => <TypIcon eintrag={e} analyseLaeuft={analyseLaeuft} />,
    },
    {
      key: "ablegen",
      header: "",
      className: "w-10 min-w-[2.5rem] px-1",
      render: (e) =>
        e.hatAblegenKategorie ? (
          <span
            className="flex h-8 w-8 items-center justify-center text-amber-500"
            title="Ablegen"
            aria-label="Ablegen"
          >
            <Flag className="h-4 w-4 fill-current" strokeWidth={1.5} aria-hidden />
          </span>
        ) : (
          <span className="block h-8 w-8" aria-hidden />
        ),
    },
    {
      key: "datei",
      header: "Dateiname",
      className: "min-w-[10rem] max-w-[14rem]",
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
      key: "ablage",
      header: "Ablage",
      className: "min-w-[12rem] max-w-[18rem]",
      render: (e) => {
        const text = ablagePfadText(e);
        const vollerPfad = ablagePfad(e);
        return (
          <ZellText
            text={text}
            className="text-foreground"
            truncateFrom="start"
            title={vollerPfad ?? undefined}
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
      key: "datum",
      header: "Datum",
      className: "w-[9.5rem] min-w-[9.5rem] whitespace-nowrap",
      render: (e) => (
        <span className="text-sm text-foreground">
          {formatEingangsdatum(e.eingegangenAm)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-[7.5rem] min-w-[7.5rem] px-2",
      render: (e) => (
        <span title={e.status === "fehler" ? e.analyseFehler || undefined : undefined}>
          <StatusBadge
            status={e.status}
            label={STATUS_LABEL[e.status] ?? e.status}
          />
        </span>
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
        const laedtZeile = aktionId === eintrag?.id;

        return (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full border-foreground text-foreground"
            disabled={!eintrag || laedtZeile}
            onClick={() => eintrag && pruefen(eintrag)}
          >
            Check
          </Button>
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
          );
        }

        if (istTam) {
          return (
            <Button
              size="sm"
              className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
              disabled={laedtZeile}
              onClick={() => void zuTam(eintrag)}
            >
              zu TAM
            </Button>
          );
        }

        if (istRechnungEintrag(eintrag)) {
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full border-foreground text-foreground"
              disabled={laedtZeile}
              onClick={() =>
                void navigate({ to: "/dokumente/rechnungsfreigabe" })
              }
            >
              Freigabe
            </Button>
          );
        }

        if (!ablagePfad(eintrag)) {
          return <span className="block h-8" aria-hidden />;
        }

        return (
          <Button
            size="sm"
            className="h-8 w-full bg-primary text-primary-foreground hover:bg-heading"
            disabled={laedtZeile}
            onClick={() => void direktAusfuehren(eintrag)}
          >
            Ablegen
          </Button>
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
        const menueGesperrt = laedtZeile || analyseLaeuft || ablegenLaeuft;
        const kannAnalysieren = Boolean(
          eintrag && eintrag.status === "neu",
        );
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
                disabled={menueGesperrt}
                aria-label="Weitere Aktionen"
                onClick={(ev) => ev.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
              {kannAnalysieren ? (
                <DropdownMenuItem
                  disabled={menueGesperrt}
                  onClick={() => eintrag && void analyseWiederholen(eintrag)}
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                  KI-Analyse
                </DropdownMenuItem>
              ) : null}
              {kannWiederholen ? (
                <DropdownMenuItem
                  disabled={menueGesperrt}
                  onClick={() => eintrag && void analyseWiederholen(eintrag)}
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                  KI-Neustart
                </DropdownMenuItem>
              ) : null}
              {eintrag ? (
                <DropdownMenuItem
                  disabled={menueGesperrt}
                  onClick={() => void archivieren(eintrag)}
                >
                  <Archive className="h-4 w-4" strokeWidth={1.5} />
                  Archiv
                </DropdownMenuItem>
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
          analyseLaeuft || ablegenLaeuft ? (
            <span className="inline-flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
              {ablegenLaeuft ? "Ablegen läuft" : "KI-Analyse läuft"}
            </span>
          ) : undefined
        }
        aktionen={
          <>
            <Button
              type="button"
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              disabled={laedt || analyseLaeuft || ablegenLaeuft || !token || offen <= 0}
              onClick={() => void starteAnalyse()}
            >
              {analyseLaeuft ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : null}
              KI-Analyse
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-foreground text-foreground"
              disabled={laedt || analyseLaeuft || ablegenLaeuft || !token}
              onClick={() => void starteKategorieAblegen()}
            >
              {ablegenLaeuft ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : null}
              Ablegen
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-foreground text-foreground"
              disabled={(laedt || isFetching) || analyseLaeuft || ablegenLaeuft || !token}
              onClick={() => void refetch()}
              aria-label="Aktualisieren"
            >
              <RefreshCw
                className={cn("h-4 w-4", (laedt || isFetching) && "animate-spin")}
                strokeWidth={1.5}
              />
            </Button>
          </>
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
          zeilen={postfachZeilen}
          scrollX
          isLoading={laedt}
          isEmpty={!laedt && !fehler && postfachZeilen.length === 0}
          emptyTitel="Keine Anhänge im Postfach"
          rowKey={(e) => e.id}
        />
      </PageWrapper>
    </>
  );
}
