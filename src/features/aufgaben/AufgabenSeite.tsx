import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  CheckCheck,
  Columns3,
  Compass,
  Loader2,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import {
  faelligStand,
  heuteIso,
  nachPosition,
  passtZuFilter,
  positionZwischen,
  ruecksprachen as ruecksprachenAus,
  tageBisFaellig,
  themenStaende,
  type ThemenStand,
} from "@/lib/aufgaben/logik";
import {
  FILTER_LEER,
  THEMENFELDER,
  themenfeldLabel,
  type Aufgabe,
  type AufgabeFelder,
  type Board,
  type Filter,
  type Spalte,
  type Themenfeld,
} from "@/lib/aufgaben/typen";
import { cn } from "@/lib/utils";

import { AufgabeDialog } from "./AufgabeDialog";
import { AufgabeKarte, FELD } from "./bausteine";
import {
  RueckspracheDialog,
  type RueckspracheEingabe,
} from "./RueckspracheDialog";
import { WiedervorlagenSpalte } from "./WiedervorlagenSpalte";

function meldung(e: unknown, standard: string): string {
  return e instanceof Error ? e.message : standard;
}

const fn = () => import("@/lib/aufgaben/server-fn");

type Ziel = { spalteId: string; index: number };

/** Board nach Status (Spalten) oder nach strategischem Themenfeld. */
type Ansicht = "status" | "themen";
const ANSICHT_SCHLUESSEL = "aufgaben.ansicht";

function gespeicherteAnsicht(): Ansicht {
  try {
    return window.localStorage.getItem(ANSICHT_SCHLUESSEL) === "themen"
      ? "themen"
      : "status";
  } catch {
    return "status";
  }
}

const THEMEN_SPALTEN: Themenfeld[] = [...THEMENFELDER.map((t) => t.wert), ""];

export function AufgabenSeite() {
  const { session, benutzer } = useAuth();
  const token = session?.access_token ?? "";
  const [board, setBoard] = useState<Board | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(FILTER_LEER);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [rsOffen, setRsOffen] = useState(false);
  const [ziehId, setZiehId] = useState<string | null>(null);
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [zielThema, setZielThema] = useState<Themenfeld | null>(null);
  const [ansicht, setAnsichtState] = useState<Ansicht>("status");
  const heute = heuteIso();

  useEffect(() => setAnsichtState(gespeicherteAnsicht()), []);
  const setAnsicht = (a: Ansicht) => {
    setAnsichtState(a);
    try {
      window.localStorage.setItem(ANSICHT_SCHLUESSEL, a);
    } catch {
      // Nur Bequemlichkeit.
    }
  };

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { aufgabenBoardFn } = await fn();
      setBoard(await aufgabenBoardFn({ data: { supabaseAccessToken: token } }));
      setFehler(null);
    } catch (e) {
      setFehler(meldung(e, "Das Aufgabenboard konnte nicht geladen werden."));
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Änderungen aus Trello (und von Kollegen) regelmäßig nachladen, solange die Seite sichtbar ist.
  useEffect(() => {
    if (!board?.trello.verbunden) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && !ziehId && !offenId)
        void laden();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [board?.trello.verbunden, laden, ziehId, offenId]);

  const [abgleich, setAbgleich] = useState(false);
  const trelloAbgleichen = async () => {
    setAbgleich(true);
    try {
      const { trelloAbgleichFn } = await fn();
      const e = await trelloAbgleichFn({
        data: { supabaseAccessToken: token },
      });
      const summe = e.nachTrello + e.ausTrello + e.neuInTrello + e.neuInApp;
      toast.success(
        summe === 0
          ? "App und Trello sind identisch."
          : `Abgeglichen: ${e.neuInTrello + e.nachTrello} nach Trello, ${e.neuInApp + e.ausTrello} aus Trello.`,
      );
      await laden();
    } catch (e) {
      toast.error(meldung(e, "Der Trello-Abgleich ist fehlgeschlagen."));
    } finally {
      setAbgleich(false);
    }
  };

  const spalten = useMemo(() => nachPosition(board?.spalten ?? []), [board]);
  const spalteVon = useMemo(
    () => new Map(spalten.map((s) => [s.id, s])),
    [spalten],
  );
  const personVon = useMemo(
    () => new Map((board?.personen ?? []).map((p) => [p.id, p])),
    [board],
  );
  const rsListe = useMemo(
    () => ruecksprachenAus(board?.aufgaben ?? []),
    [board],
  );

  const staende = useMemo(
    () => themenStaende(board?.aufgaben ?? [], spalteVon, heute),
    [board, spalteVon, heute],
  );

  const kennzahlen = useMemo(() => {
    const offen = (board?.aufgaben ?? []).filter(
      (a) => !spalteVon.get(a.spalteId)?.erledigt,
    );
    return {
      offen: offen.length,
      ueberfaellig: offen.filter(
        (a) =>
          faelligStand(a, spalteVon.get(a.spalteId), heute) === "ueberfaellig",
      ).length,
      woche: offen.filter((a) => {
        if (!a.faelligAm) return false;
        const t = tageBisFaellig(a.faelligAm, heute);
        return t >= 0 && t <= 7;
      }).length,
    };
  }, [board, spalteVon, heute]);

  // --- Board-Zustand lokal ändern (optimistisch) ---------------------------

  const aufgabeErsetzen = (a: Aufgabe) =>
    setBoard((b) =>
      b
        ? { ...b, aufgaben: b.aufgaben.map((x) => (x.id === a.id ? a : x)) }
        : b,
    );
  const spalteErsetzen = (s: Spalte) =>
    setBoard((b) =>
      b
        ? {
            ...b,
            spalten: b.spalten.some((x) => x.id === s.id)
              ? b.spalten.map((x) => (x.id === s.id ? s : x))
              : [...b.spalten, s],
          }
        : b,
    );

  const verschieben = async (
    id: string,
    spalteId: string,
    position: number,
  ) => {
    const alt = board?.aufgaben.find((a) => a.id === id);
    if (!alt) return;
    aufgabeErsetzen({ ...alt, spalteId, position });
    try {
      const { aufgabeVerschiebenFn } = await fn();
      aufgabeErsetzen(
        await aufgabeVerschiebenFn({
          data: { supabaseAccessToken: token, id, spalteId, position },
        }),
      );
    } catch (e) {
      aufgabeErsetzen(alt);
      toast.error(meldung(e, "Die Aufgabe konnte nicht verschoben werden."));
    }
  };

  /** Ans Ende einer anderen Spalte (Auswahl im Dialog). */
  const inSpalte = async (id: string, spalteId: string) => {
    const andere = nachPosition(
      (board?.aufgaben ?? []).filter(
        (a) => a.spalteId === spalteId && a.id !== id,
      ),
    );
    await verschieben(id, spalteId, positionZwischen(andere, andere.length));
  };

  const anlegen = async (
    spalteId: string,
    titel: string,
    themenfeld: Themenfeld = filter.themenfeld ?? "",
  ) => {
    try {
      const { aufgabeAnlegenFn } = await fn();
      const neu = await aufgabeAnlegenFn({
        data: {
          supabaseAccessToken: token,
          spalteId,
          felder: { titel, prioritaet: "normal", themenfeld, checkliste: [] },
        },
      });
      setBoard((b) => (b ? { ...b, aufgaben: [...b.aufgaben, neu] } : b));
    } catch (e) {
      toast.error(meldung(e, "Die Aufgabe konnte nicht angelegt werden."));
      throw e;
    }
  };

  const speichern = async (id: string, felder: AufgabeFelder) => {
    try {
      const { aufgabeSpeichernFn } = await fn();
      aufgabeErsetzen(
        await aufgabeSpeichernFn({
          data: { supabaseAccessToken: token, id, felder },
        }),
      );
      toast.success("Aufgabe gespeichert.");
    } catch (e) {
      toast.error(meldung(e, "Die Aufgabe konnte nicht gespeichert werden."));
      throw e;
    }
  };

  /** Ansicht nach Themenfeld: Karte in ein anderes Themenfeld ziehen. */
  const themaSetzen = async (id: string, themenfeld: Themenfeld) => {
    const alt = board?.aufgaben.find((a) => a.id === id);
    if (!alt || alt.themenfeld === themenfeld) return;
    aufgabeErsetzen({ ...alt, themenfeld });
    try {
      const { aufgabeSpeichernFn } = await fn();
      aufgabeErsetzen(
        await aufgabeSpeichernFn({
          data: {
            supabaseAccessToken: token,
            id,
            felder: {
              titel: alt.titel,
              beschreibung: alt.beschreibung,
              verantwortlichId: alt.verantwortlichId,
              faelligAm: alt.faelligAm,
              prioritaet: alt.prioritaet,
              themenfeld,
              ruecksprache: alt.ruecksprache,
              ruecksprachAm: alt.ruecksprachAm,
              mandatSfId: alt.mandatSfId,
              checkliste: alt.checkliste,
            },
          },
        }),
      );
    } catch (e) {
      aufgabeErsetzen(alt);
      toast.error(meldung(e, "Das Themenfeld konnte nicht gesetzt werden."));
    }
  };

  const loeschen = async (id: string) => {
    try {
      const { aufgabeLoeschenFn } = await fn();
      await aufgabeLoeschenFn({ data: { supabaseAccessToken: token, id } });
      setBoard((b) =>
        b ? { ...b, aufgaben: b.aufgaben.filter((a) => a.id !== id) } : b,
      );
      toast.success("Aufgabe gelöscht.");
    } catch (e) {
      toast.error(meldung(e, "Die Aufgabe konnte nicht gelöscht werden."));
      throw e;
    }
  };

  const ruecksprache = async (eingabe: RueckspracheEingabe) => {
    try {
      const { ruecksprachErfassenFn } = await fn();
      const neu = await ruecksprachErfassenFn({
        data: { supabaseAccessToken: token, ...eingabe },
      });
      setBoard((b) => (b ? { ...b, aufgaben: [...b.aufgaben, ...neu] } : b));
      toast.success(
        neu.length === 1
          ? "1 Aufgabe angelegt."
          : `${neu.length} Aufgaben angelegt.`,
      );
    } catch (e) {
      toast.error(meldung(e, "Die Aufgaben konnten nicht angelegt werden."));
      throw e;
    }
  };

  const spalteSpeichern = async (s: Partial<Spalte> & { titel: string }) => {
    try {
      const { spalteSpeichernFn } = await fn();
      spalteErsetzen(
        await spalteSpeichernFn({
          data: {
            supabaseAccessToken: token,
            id: s.id ?? null,
            titel: s.titel,
            erledigt: s.erledigt ?? false,
            ...(s.position === undefined ? {} : { position: s.position }),
          },
        }),
      );
    } catch (e) {
      toast.error(meldung(e, "Die Spalte konnte nicht gespeichert werden."));
    }
  };

  const spalteRuecken = (s: Spalte, richtung: -1 | 1) => {
    const andere = spalten.filter((x) => x.id !== s.id);
    const index = spalten.findIndex((x) => x.id === s.id) + richtung;
    void spalteSpeichern({ ...s, position: positionZwischen(andere, index) });
  };

  const spalteLoeschen = async (s: Spalte) => {
    try {
      const { spalteLoeschenFn } = await fn();
      await spalteLoeschenFn({
        data: { supabaseAccessToken: token, id: s.id },
      });
      setBoard((b) =>
        b ? { ...b, spalten: b.spalten.filter((x) => x.id !== s.id) } : b,
      );
    } catch (e) {
      toast.error(meldung(e, "Die Spalte konnte nicht gelöscht werden."));
    }
  };

  const archivieren = async (s: Spalte) => {
    try {
      const { spalteArchivierenFn } = await fn();
      const { anzahl } = await spalteArchivierenFn({
        data: { supabaseAccessToken: token, spalteId: s.id },
      });
      setBoard((b) =>
        b
          ? { ...b, aufgaben: b.aufgaben.filter((a) => a.spalteId !== s.id) }
          : b,
      );
      toast.success(`${anzahl} Karten archiviert.`);
    } catch (e) {
      toast.error(meldung(e, "Die Karten konnten nicht archiviert werden."));
    }
  };

  // --- Drag & Drop -----------------------------------------------------------

  const sichtbar = (spalteId: string) =>
    nachPosition(
      (board?.aufgaben ?? []).filter(
        (a) =>
          a.spalteId === spalteId &&
          passtZuFilter(a, spalteVon.get(spalteId), filter, heute),
      ),
    );

  const ueberListe = (e: React.DragEvent<HTMLDivElement>, spalteId: string) => {
    if (!ziehId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const karten = [
      ...e.currentTarget.querySelectorAll<HTMLElement>("[data-aufgabe]"),
    ].filter((k) => k.dataset.aufgabe !== ziehId);
    let index = karten.length;
    for (let i = 0; i < karten.length; i++) {
      const r = karten[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    if (ziel?.spalteId !== spalteId || ziel.index !== index)
      setZiel({ spalteId, index });
  };

  const ablegen = (e: React.DragEvent, spalteId: string) => {
    e.preventDefault();
    const id = ziehId;
    const z = ziel;
    setZiehId(null);
    setZiel(null);
    if (!id || !z || z.spalteId !== spalteId) return;
    const andere = sichtbar(spalteId).filter((a) => a.id !== id);
    const alt = board?.aufgaben.find((a) => a.id === id);
    const position = positionZwischen(andere, z.index);
    if (alt && alt.spalteId === spalteId && alt.position === position) return;
    // Gleicher Platz wie vorher: nichts speichern.
    const vorher = andere[z.index - 1];
    const nachher = andere[z.index];
    if (
      alt &&
      alt.spalteId === spalteId &&
      (!vorher || vorher.position < alt.position) &&
      (!nachher || nachher.position > alt.position)
    ) {
      return;
    }
    void verschieben(id, spalteId, position);
  };

  /** Ansicht nach Themenfeld: offene Karten, dringendste zuerst. */
  const imThema = (t: Themenfeld) =>
    (board?.aufgaben ?? [])
      .filter((a) => {
        const spalte = spalteVon.get(a.spalteId);
        return (
          a.themenfeld === t &&
          !spalte?.erledigt &&
          passtZuFilter(a, spalte, filter, heute)
        );
      })
      .sort(
        (x, y) =>
          (x.faelligAm ?? "9999").localeCompare(y.faelligAm ?? "9999") ||
          Number(y.prioritaet === "hoch") - Number(x.prioritaet === "hoch") ||
          x.position - y.position,
      );
  const ersteOffeneSpalte =
    spalten.find((s) => !s.erledigt)?.id ?? spalten[0]?.id;

  const karteZeigen = (a: Aufgabe, nachThema: boolean) => {
    const s = spalteVon.get(a.spalteId);
    return (
      <AufgabeKarte
        key={a.id}
        aufgabe={a}
        spalte={s}
        person={
          a.verantwortlichId ? personVon.get(a.verantwortlichId) : undefined
        }
        heute={heute}
        ziehend={ziehId === a.id}
        mitThemenfeld={!nachThema && board?.themenfelder}
        mitStatus={nachThema}
        onOeffnen={() => setOffenId(a.id)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", a.id);
          setZiehId(a.id);
        }}
        onDragEnd={() => {
          setZiehId(null);
          setZiel(null);
          setZielThema(null);
        }}
      />
    );
  };

  const offen = board?.aufgaben.find((a) => a.id === offenId) ?? null;
  const filterAktiv =
    filter.suche ||
    filter.person ||
    filter.ruecksprache ||
    filter.themenfeld !== null ||
    filter.nurUeberfaellig;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        titel="Aufgaben"
        beschreibung="Die in Rücksprachen festgelegten Aufgaben, ausgerichtet an den strategischen Themenfeldern von Grenz & Co. Karten per Drag & Drop verschieben."
        aktionen={
          <div className="flex gap-2">
            {board?.trello.verbunden && (
              <>
                {board.trello.boardUrl && (
                  <Button variant="outline" asChild>
                    <a
                      href={board.trello.boardUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Trello
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void trelloAbgleichen()}
                  disabled={abgleich}
                  title="Mit Trello abgleichen"
                >
                  <RefreshCw
                    className={cn("size-4", abgleich && "animate-spin")}
                  />
                  Abgleichen
                </Button>
              </>
            )}
            <div className="flex border border-input" role="group">
              <Button
                variant={ansicht === "status" ? "default" : "ghost"}
                className="border-0"
                onClick={() => setAnsicht("status")}
                title="Board nach Status"
              >
                <Columns3 className="size-4" />
                Status
              </Button>
              <Button
                variant={ansicht === "themen" ? "default" : "ghost"}
                className="border-0"
                onClick={() => setAnsicht("themen")}
                disabled={!board?.themenfelder}
                title="Offene Aufgaben nach Themenfeld"
              >
                <Compass className="size-4" />
                Themenfelder
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => void spalteSpeichern({ titel: "Neue Spalte" })}
              disabled={!board || ansicht === "themen"}
            >
              <Plus className="size-4" />
              Spalte
            </Button>
            <Button
              onClick={() => setRsOffen(true)}
              disabled={!board || spalten.length === 0}
            >
              <MessagesSquare className="size-4" />
              Rücksprache erfassen
            </Button>
          </div>
        }
        meta={
          board && (
            <div className="flex flex-wrap gap-6 text-sm text-text-muted">
              <span>
                <span className="text-lg font-light tabular-nums text-heading">
                  {kennzahlen.offen}
                </span>{" "}
                offen
              </span>
              <span>
                <span
                  className={cn(
                    "text-lg font-light tabular-nums",
                    kennzahlen.ueberfaellig ? "text-bad" : "text-heading",
                  )}
                >
                  {kennzahlen.ueberfaellig}
                </span>{" "}
                überfällig
              </span>
              <span>
                <span className="text-lg font-light tabular-nums text-heading">
                  {kennzahlen.woche}
                </span>{" "}
                fällig in den nächsten 7 Tagen
              </span>
              {board.trello.verbunden && (
                <span className={cn(board.trello.fehler && "text-bad")}>
                  {board.trello.fehler
                    ? `Trello-Abgleich gestört: ${board.trello.fehler}`
                    : board.trello.letzterAbgleich
                      ? `Mit Trello abgeglichen um ${new Date(board.trello.letzterAbgleich).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
                      : "Mit Trello verbunden"}
                </span>
              )}
            </div>
          )
        }
      />

      {board && (
        <div className="hairline-b flex flex-wrap items-center gap-2 border-b border-hairline bg-surface px-8 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              className={cn(FELD, "pl-8")}
              placeholder="Aufgaben durchsuchen"
              value={filter.suche}
              onChange={(e) => setFilter({ ...filter, suche: e.target.value })}
            />
          </div>
          <select
            aria-label="Verantwortlich"
            className={cn(FELD, "w-48")}
            value={filter.person}
            onChange={(e) => setFilter({ ...filter, person: e.target.value })}
          >
            <option value="">Alle Personen</option>
            <option value="ohne">Ohne Zuständigen</option>
            {board.personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Rücksprache"
            className={cn(FELD, "w-52")}
            value={filter.ruecksprache}
            onChange={(e) =>
              setFilter({ ...filter, ruecksprache: e.target.value })
            }
          >
            <option value="">Alle Rücksprachen</option>
            {rsListe.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {board.themenfelder && (
            <select
              aria-label="Themenfeld"
              className={cn(FELD, "w-56")}
              value={filter.themenfeld ?? "alle"}
              onChange={(e) =>
                setFilter({
                  ...filter,
                  themenfeld:
                    e.target.value === "alle"
                      ? null
                      : (e.target.value as Themenfeld),
                })
              }
            >
              <option value="alle">Alle Themenfelder</option>
              {THEMENFELDER.map((t) => (
                <option key={t.wert} value={t.wert}>
                  {t.label}
                </option>
              ))}
              <option value="">Ohne Themenfeld</option>
            </select>
          )}
          {benutzer && (
            <Button
              variant={filter.person === benutzer.id ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilter({
                  ...filter,
                  person: filter.person === benutzer.id ? "" : benutzer.id,
                })
              }
            >
              Meine Aufgaben
            </Button>
          )}
          <Button
            variant={filter.nurUeberfaellig ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setFilter({ ...filter, nurUeberfaellig: !filter.nurUeberfaellig })
            }
          >
            Überfällig
          </Button>
          {filterAktiv && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter(FILTER_LEER)}
            >
              <X className="size-4" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      )}

      {board && !board.themenfelder && (
        <div className="mx-8 mt-4 border border-[var(--warn)] bg-warn-soft p-3 text-sm text-warn">
          Themenfelder sind vorbereitet, werden aber erst gespeichert, wenn die
          Datenbank-Migration 20261028120000_aufgaben_themenfeld eingespielt
          ist. Das Board funktioniert bis dahin wie bisher.
        </div>
      )}
      {board && board.themenfelder && (
        <StrategieLeiste
          staende={staende}
          aktiv={filter.themenfeld}
          onWaehlen={(t) =>
            setFilter({
              ...filter,
              themenfeld: filter.themenfeld === t ? null : t,
            })
          }
        />
      )}

      {fehler && (
        <div className="mx-8 mt-6 border border-[var(--bad)] bg-bad-soft p-4 text-sm text-bad">
          {fehler}
        </div>
      )}
      {!board && !fehler && (
        <div className="flex items-center gap-2 px-8 py-6 text-sm text-text-muted">
          <Loader2 className="size-4 animate-spin" />
          Board wird geladen …
        </div>
      )}

      {board && ansicht === "themen" && board.themenfelder && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto bg-[var(--gc-grau-zart)] px-8 py-6">
          {THEMEN_SPALTEN.filter(
            (t) =>
              (filter.themenfeld === null || filter.themenfeld === t) &&
              (t !== "" || imThema("").length > 0),
          ).map((t) => (
            <ThemaAnsicht
              key={t || "ohne"}
              themenfeld={t}
              karten={imThema(t)}
              stand={staende.find((x) => x.themenfeld === t)}
              ziel={zielThema === t}
              renderKarte={(a) => karteZeigen(a, true)}
              onDragOver={(e) => {
                if (!ziehId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (zielThema !== t) setZielThema(t);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = ziehId;
                setZiehId(null);
                setZielThema(null);
                if (id) void themaSetzen(id, t);
              }}
              onAnlegen={
                ersteOffeneSpalte
                  ? (titel) => anlegen(ersteOffeneSpalte, titel, t)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {board && (ansicht === "status" || !board.themenfelder) && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto bg-[var(--gc-grau-zart)] px-8 py-6">
          {spalten.map((s, i) => (
            <SpalteAnsicht
              key={s.id}
              spalte={s}
              karten={sichtbar(s.id)}
              gesamt={board.aufgaben.filter((a) => a.spalteId === s.id).length}
              erste={i === 0}
              letzte={i === spalten.length - 1}
              ziehId={ziehId}
              zielIndex={ziel?.spalteId === s.id ? ziel.index : null}
              renderKarte={(a) => karteZeigen(a, false)}
              onDragOver={(e) => ueberListe(e, s.id)}
              onDrop={(e) => ablegen(e, s.id)}
              onAnlegen={(titel) => anlegen(s.id, titel)}
              onUmbenennen={(titel) => void spalteSpeichern({ ...s, titel })}
              onErledigt={() =>
                void spalteSpeichern({ ...s, erledigt: !s.erledigt })
              }
              onRuecken={(r) => spalteRuecken(s, r)}
              onArchivieren={() => void archivieren(s)}
              onLoeschen={() => void spalteLoeschen(s)}
            />
          ))}
          <WiedervorlagenSpalte filter={filter} personen={board.personen} />
        </div>
      )}

      {board && offen && (
        <AufgabeDialog
          key={offen.id}
          aufgabe={offen}
          spalten={spalten}
          personen={board.personen}
          mandate={board.mandate}
          ruecksprachen={rsListe}
          themenfelder={board.themenfelder}
          onSchliessen={() => setOffenId(null)}
          onSpeichern={speichern}
          onVerschieben={inSpalte}
          onLoeschen={loeschen}
        />
      )}
      {board && (
        <RueckspracheDialog
          offen={rsOffen}
          spalten={spalten}
          personen={board.personen}
          mandate={board.mandate}
          ruecksprachen={rsListe}
          themenfelder={board.themenfelder}
          vorgabeThemenfeld={filter.themenfeld ?? ""}
          onSchliessen={() => setRsOffen(false)}
          onErfassen={ruecksprache}
        />
      )}
    </div>
  );
}

function SpalteAnsicht({
  spalte,
  karten,
  gesamt,
  erste,
  letzte,
  ziehId,
  zielIndex,
  renderKarte,
  onDragOver,
  onDrop,
  onAnlegen,
  onUmbenennen,
  onErledigt,
  onRuecken,
  onArchivieren,
  onLoeschen,
}: {
  spalte: Spalte;
  karten: Aufgabe[];
  gesamt: number;
  erste: boolean;
  letzte: boolean;
  ziehId: string | null;
  zielIndex: number | null;
  renderKarte: (a: Aufgabe) => React.ReactNode;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onAnlegen: (titel: string) => Promise<void>;
  onUmbenennen: (titel: string) => void;
  onErledigt: () => void;
  onRuecken: (r: -1 | 1) => void;
  onArchivieren: () => void;
  onLoeschen: () => void;
}) {
  const [umbenennen, setUmbenennen] = useState(false);
  const [titel, setTitel] = useState(spalte.titel);

  const ohneGezogene = karten.filter((k) => k.id !== ziehId);
  const platzhalter = <div className="h-1 shrink-0 bg-brand" aria-hidden />;

  return (
    <section className="flex max-h-full w-72 shrink-0 flex-col border border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        {umbenennen ? (
          <input
            autoFocus
            className={cn(FELD, "h-8")}
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            onBlur={() => {
              setUmbenennen(false);
              if (titel.trim() && titel.trim() !== spalte.titel)
                onUmbenennen(titel.trim());
              else setTitel(spalte.titel);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitel(spalte.titel);
                setUmbenennen(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs font-medium uppercase tracking-wider text-heading"
            onDoubleClick={() => setUmbenennen(true)}
            title="Doppelklick zum Umbenennen"
          >
            {spalte.titel}
          </button>
        )}
        {spalte.erledigt && (
          <CheckCheck
            className="size-4 shrink-0 text-ok"
            aria-label="Erledigt-Spalte"
          />
        )}
        <span className="shrink-0 bg-surface-muted px-1.5 text-xs tabular-nums text-text-muted">
          {karten.length === gesamt ? gesamt : `${karten.length}/${gesamt}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Spalte bearbeiten"
              className="text-text-muted hover:text-heading"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setUmbenennen(true)}>
              <Pencil className="size-4" />
              Umbenennen
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onErledigt}>
              <CheckCheck className="size-4" />
              {spalte.erledigt
                ? "Nicht mehr als erledigt zählen"
                : "Karten hier gelten als erledigt"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={erste} onSelect={() => onRuecken(-1)}>
              <ArrowLeft className="size-4" />
              Nach links
            </DropdownMenuItem>
            <DropdownMenuItem disabled={letzte} onSelect={() => onRuecken(1)}>
              <ArrowRight className="size-4" />
              Nach rechts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={gesamt === 0} onSelect={onArchivieren}>
              <Archive className="size-4" />
              Alle Karten archivieren
            </DropdownMenuItem>
            <DropdownMenuItem disabled={gesamt > 0} onSelect={onLoeschen}>
              <Trash2 className="size-4" />
              Spalte löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div
        className={cn(
          "flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2",
          zielIndex !== null && "bg-[var(--gc-hellblau-zart)]",
        )}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Die gezogene Karte bleibt halbtransparent an ihrem Platz; der Index zählt ohne sie. */}
        {karten.map((a) => {
          const i = ohneGezogene.indexOf(a);
          return (
            <div key={a.id} className="contents">
              {i >= 0 && zielIndex === i && platzhalter}
              {renderKarte(a)}
            </div>
          );
        })}
        {zielIndex === ohneGezogene.length && platzhalter}
      </div>

      <NeueAufgabe onAnlegen={onAnlegen} />
    </section>
  );
}

function NeueAufgabe({
  onAnlegen,
}: {
  onAnlegen: (titel: string) => Promise<void>;
}) {
  const [neu, setNeu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anlegen = async () => {
    const t = (neu ?? "").trim();
    if (!t) {
      setNeu(null);
      return;
    }
    setBusy(true);
    try {
      await onAnlegen(t);
      setNeu("");
    } catch {
      // Meldung kommt aus onAnlegen.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-hairline p-2">
      {neu === null ? (
        <button
          type="button"
          className="flex w-full items-center gap-1 px-1 py-1 text-left text-sm text-text-muted hover:text-heading"
          onClick={() => setNeu("")}
        >
          <Plus className="size-4" />
          Aufgabe hinzufügen
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            rows={2}
            className="w-full resize-none border border-input bg-background p-2 text-sm text-heading focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Titel der Aufgabe"
            value={neu}
            disabled={busy}
            onChange={(e) => setNeu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void anlegen();
              }
              if (e.key === "Escape") setNeu(null);
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void anlegen()}
              disabled={busy || !neu.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Hinzufügen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNeu(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kacheln je Themenfeld: wo steht die Strategie? Klick filtert das Board. */
function StrategieLeiste({
  staende,
  aktiv,
  onWaehlen,
}: {
  staende: ThemenStand[];
  aktiv: Themenfeld | null;
  onWaehlen: (t: Themenfeld) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-hairline bg-surface px-8 py-3">
      {staende.map((s) => {
        const an = aktiv === s.themenfeld;
        return (
          <button
            key={s.themenfeld || "ohne"}
            type="button"
            onClick={() => onWaehlen(s.themenfeld)}
            title={themenfeldLabel(s.themenfeld)}
            className={cn(
              "flex min-w-36 shrink-0 flex-col gap-1 border px-3 py-2 text-left transition",
              an
                ? "border-brand bg-brand text-white"
                : "border-hairline bg-elevated hover:border-[var(--gc-navy-hell)]",
            )}
          >
            <span
              className={cn(
                "truncate text-[10px] font-medium uppercase tracking-wider",
                an ? "text-white/80" : "text-text-muted",
              )}
            >
              {themenfeldLabel(s.themenfeld)}
            </span>
            <span className="flex items-baseline gap-1">
              <span
                className={cn(
                  "text-xl font-light tabular-nums",
                  !an && "text-heading",
                )}
              >
                {s.offen}
              </span>
              <span className={cn("text-xs", !an && "text-text-muted")}>
                offen
              </span>
            </span>
            <span
              className={cn(
                "flex gap-2 text-[11px]",
                an ? "text-white/80" : "text-text-muted",
              )}
            >
              {s.ueberfaellig > 0 && (
                <span className={cn(!an && "text-bad")}>
                  {s.ueberfaellig} überfällig
                </span>
              )}
              <span>{s.erledigt30} erledigt (30 T.)</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Spalte der Ansicht nach Themenfeld. Ablegen ändert das Themenfeld, nicht den Status. */
function ThemaAnsicht({
  themenfeld,
  karten,
  stand,
  ziel,
  renderKarte,
  onDragOver,
  onDrop,
  onAnlegen,
}: {
  themenfeld: Themenfeld;
  karten: Aufgabe[];
  stand: ThemenStand | undefined;
  ziel: boolean;
  renderKarte: (a: Aufgabe) => React.ReactNode;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onAnlegen?: (titel: string) => Promise<void>;
}) {
  return (
    <section className="flex max-h-full w-72 shrink-0 flex-col border border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-heading">
          {themenfeldLabel(themenfeld)}
        </h2>
        {!!stand?.ueberfaellig && (
          <span className="shrink-0 bg-bad-soft px-1.5 text-xs tabular-nums text-bad">
            {stand.ueberfaellig}
          </span>
        )}
        <span className="shrink-0 bg-surface-muted px-1.5 text-xs tabular-nums text-text-muted">
          {karten.length}
        </span>
      </header>
      <div
        className={cn(
          "flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2",
          ziel && "bg-[var(--gc-hellblau-zart)]",
        )}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {karten.map(renderKarte)}
        {karten.length === 0 && (
          <span className="px-1 py-2 text-xs text-text-muted">
            Keine offenen Aufgaben.
          </span>
        )}
      </div>
      {onAnlegen && <NeueAufgabe onAnlegen={onAnlegen} />}
    </section>
  );
}
