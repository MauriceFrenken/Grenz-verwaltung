import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Inbox, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Knopf } from "@/components/board/Knopf";
import { Abschnitt, Karte } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { StatusBadge } from "@/components/board/Status";
import { useAuth } from "@/hooks/useAuth";
import {
  HINWEIS_ART_LABEL,
  HINWEIS_ZIEL,
  type HinweisArt,
  type HinweisStatus,
  type PostfachHinweis,
} from "@/lib/dokument-postfach/datenwirkung-logik";
import { datum, euro } from "@/lib/format/de";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const POSTFACH_HINWEISE_KEY = ["board", "postfach-hinweise"] as const;

/** Runden à 6 Einträge je Klick auf „Postfach prüfen“ */
const PRUEF_RUNDEN = 5;

type Row = Record<string, unknown>;

const num = (v: unknown) => (v == null ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

function abbilden(r: Row): PostfachHinweis {
  return {
    id: String(r.id),
    posteingangId: str(r.posteingang_id),
    art: r.art as HinweisArt,
    titel: String(r.titel ?? ""),
    beschreibung: str(r.beschreibung),
    aktion: str(r.aktion),
    objektId: str(r.objekt_id),
    gesellschaftId: str(r.gesellschaft_id),
    mieter: str(r.mieter),
    betrag: num(r.betrag),
    betragAlt: num(r.betrag_alt),
    gueltigAb: str(r.gueltig_ab),
    faelligAm: str(r.faellig_am),
    konfidenz: num(r.konfidenz) ?? 0,
    betreff: str(r.betreff),
    absender: str(r.absender),
    anhangName: str(r.anhang_name),
    eingegangenAm: str(r.eingegangen_am),
    status: (r.status as HinweisStatus) ?? "offen",
    erledigtAm: str(r.erledigt_am),
    notiz: str(r.notiz),
  };
}

/** Hinweise aus dem Postfach; null = Tabelle fehlt (Migration nicht eingespielt) */
function usePostfachHinweise(aktiv: boolean) {
  return useQuery({
    queryKey: POSTFACH_HINWEISE_KEY,
    enabled: aktiv,
    queryFn: async (): Promise<PostfachHinweis[] | null> => {
      const { data, error } = await supabase
        .from("postfach_datenhinweise")
        .select("*")
        .order("eingegangen_am", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return null;
        throw new Error(error.message);
      }
      return (data ?? []).map(abbilden);
    },
  });
}

const FILTER: Array<{ id: HinweisStatus; label: string }> = [
  { id: "offen", label: "Offen" },
  { id: "erledigt", label: "Erledigt" },
  { id: "ignoriert", label: "Ignoriert" },
];

export function PostfachHinweise({
  aktiv,
  objektName,
  gesellschaftName,
}: {
  /** false im Demo-Modus */
  aktiv: boolean;
  objektName: (id: string) => string | undefined;
  gesellschaftName: (id: string) => string;
}) {
  const { session, benutzer } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = usePostfachHinweise(aktiv);
  const [filter, setFilter] = useState<HinweisStatus>("offen");
  const [prueft, setPrueft] = useState(false);

  const statusSetzen = async (h: PostfachHinweis, status: HinweisStatus) => {
    const { error: e } = await supabase
      .from("postfach_datenhinweise")
      .update({
        status,
        erledigt_am: status === "offen" ? null : new Date().toISOString(),
        erledigt_von: status === "offen" ? null : (benutzer?.id ?? null),
      })
      .eq("id", h.id);
    if (e) {
      toast.error(e.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: POSTFACH_HINWEISE_KEY });
    toast.success(
      status === "erledigt"
        ? "Als erledigt markiert"
        : status === "ignoriert"
          ? "Ignoriert"
          : "Wieder offen",
    );
  };

  const pruefen = async () => {
    const token = session?.access_token;
    if (!token || prueft) return;
    setPrueft(true);
    let geprueft = 0;
    let neu = 0;
    let offen = 0;
    try {
      const { postfachDatenwirkungPruefenFn } =
        await import("@/lib/dokument-postfach/server-fn");
      for (let runde = 0; runde < PRUEF_RUNDEN; runde++) {
        const e = await postfachDatenwirkungPruefenFn({
          data: { supabaseAccessToken: token },
        });
        geprueft += e.geprueft;
        neu += e.neueHinweise;
        offen = e.offen;
        if (e.offen === 0 || e.geprueft === 0) break;
      }
      await queryClient.invalidateQueries({ queryKey: POSTFACH_HINWEISE_KEY });
      toast.success(
        `${geprueft} Mails geprüft, ${neu} neue Hinweise${offen ? `, ${offen} noch offen (laufen im nächsten Postfach-Lauf mit)` : ""}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPrueft(false);
    }
  };

  const liste = (data ?? []).filter((h) => h.status === filter);
  const anzahl = (s: HinweisStatus) =>
    (data ?? []).filter((h) => h.status === s).length;

  return (
    <Abschnitt
      titel="Aus dem Postfach"
      beschreibung="Post und E-Mails, die Zahlen im Board verändern: Mieterhöhungen, Kündigungen, Bescheide, Mahnungen, Darlehen, Kaufverträge. Die KI prüft jede analysierte Mail nach dem Postfach-Lauf."
      aktionen={
        aktiv && data !== null ? (
          <Knopf
            groesse="sm"
            onClick={pruefen}
            disabled={prueft || !session?.access_token}
          >
            <RefreshCw className={cn(prueft && "animate-spin")} />
            {prueft ? "Prüft …" : "Postfach jetzt prüfen"}
          </Knopf>
        ) : null
      }
    >
      {!aktiv ? (
        <Karte>
          <Leerzustand
            kompakt
            icon={Inbox}
            titel="Musterdaten"
            text="Im Demo-Modus gibt es kein Postfach."
          />
        </Karte>
      ) : error ? (
        <Karte>
          <Leerzustand
            kompakt
            icon={Inbox}
            titel="Hinweise konnten nicht geladen werden"
            text={(error as Error).message}
          />
        </Karte>
      ) : isLoading ? (
        <Karte className="h-24 animate-pulse">{null}</Karte>
      ) : data === null ? (
        <Karte>
          <Leerzustand
            kompakt
            icon={Inbox}
            titel="Noch nicht eingerichtet"
            text="Die Tabelle postfach_datenhinweise fehlt in der Datenbank (Migration 20261015130000)."
          />
        </Karte>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5">
            {FILTER.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-7 cursor-pointer rounded-md border px-2.5 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "border-input bg-surface text-heading shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                    : "border-hairline bg-surface-muted text-text-muted hover:text-foreground",
                )}
              >
                {f.label} · {anzahl(f.id)}
              </button>
            ))}
          </div>
          {liste.length === 0 ? (
            <Karte>
              <Leerzustand
                kompakt
                icon={CheckCircle2}
                titel={
                  filter === "offen"
                    ? "Keine offenen Hinweise aus dem Postfach"
                    : "Keine Einträge"
                }
              />
            </Karte>
          ) : (
            <Karte className="divide-y divide-hairline">
              {liste.map((h) => (
                <HinweisZeile
                  key={h.id}
                  h={h}
                  objekt={h.objektId ? objektName(h.objektId) : undefined}
                  gesellschaft={
                    h.gesellschaftId
                      ? gesellschaftName(h.gesellschaftId)
                      : undefined
                  }
                  onStatus={(s) => statusSetzen(h, s)}
                />
              ))}
            </Karte>
          )}
        </>
      )}
    </Abschnitt>
  );
}

function HinweisZeile({
  h,
  objekt,
  gesellschaft,
  onStatus,
}: {
  h: PostfachHinweis;
  objekt?: string;
  gesellschaft?: string;
  onStatus: (s: HinweisStatus) => void;
}) {
  const werte = [
    h.betrag != null
      ? h.betragAlt != null
        ? `${euro(h.betragAlt)} → ${euro(h.betrag)}`
        : euro(h.betrag)
      : null,
    h.gueltigAb ? `ab ${datum(h.gueltigAb)}` : null,
    h.faelligAm ? `fällig ${datum(h.faelligAm)}` : null,
  ].filter(Boolean);
  const bezug = [objekt ?? gesellschaft, h.mieter].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-heading">{h.titel}</span>
          <StatusBadge ampel={h.art === "zahlungsforderung" ? "gelb" : "grau"}>
            {HINWEIS_ART_LABEL[h.art] ?? h.art}
          </StatusBadge>
          {werte.length ? (
            <span className="text-xs font-medium tabular-nums text-foreground">
              {werte.join(" · ")}
            </span>
          ) : null}
        </div>
        {h.beschreibung ? (
          <p className="mt-0.5 text-sm text-text-muted">{h.beschreibung}</p>
        ) : null}
        {h.aktion ? (
          <p className="mt-1 text-xs text-foreground">
            Nächster Schritt: {h.aktion}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-text-subtle">
          {bezug ? `${bezug} · ` : ""}
          {h.eingegangenAm
            ? `Eingang ${datum(h.eingegangenAm.slice(0, 10))}`
            : ""}
          {h.absender ? ` · ${h.absender}` : ""}
          {h.anhangName ? ` · ${h.anhangName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Knopf asChild groesse="sm" variante="geist">
          <Link to={HINWEIS_ZIEL[h.art]}>
            Öffnen <ArrowRight />
          </Link>
        </Knopf>
        {h.status === "offen" ? (
          <>
            <Knopf groesse="sm" onClick={() => onStatus("erledigt")}>
              Erledigt
            </Knopf>
            <Knopf
              groesse="sm"
              variante="geist"
              onClick={() => onStatus("ignoriert")}
            >
              Ignorieren
            </Knopf>
          </>
        ) : (
          <Knopf
            groesse="sm"
            variante="geist"
            onClick={() => onStatus("offen")}
          >
            Wieder öffnen
          </Knopf>
        )}
      </div>
    </div>
  );
}
