import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Plus,
  Printer,
  RotateCcw,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Countdown } from "@/components/board/Auktion";
import { Knopf } from "@/components/board/Knopf";
import { BuehnenKennzahl, Karte, SeitenKopf } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt } from "@/components/board/Status";
import type { Beschluss } from "@/lib/db/typen";
import { datum, datumLang } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { useNachschlagen } from "@/modules/shell/daten";
import {
  beschlussLage,
  erledigtQuote,
  rundenDatum,
  type TopPunkt,
} from "./logik/runde";
import { useBeschlussAktionen, useRunde } from "./useRunde";

const FELD =
  "mt-1 h-9 w-full border border-hairline bg-surface px-2.5 text-sm text-foreground outline-none focus:border-heading";

export function RundeSeite() {
  const { lage, eingabe, punkte, beschluesse, fehler, laedt } = useRunde();
  const [vorschlag, setVorschlag] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const nach = useNachschlagen(lage.data);

  if (fehler)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Wochenrunde nicht verfügbar"
        text={(fehler as Error).message}
      />
    );
  if (laedt || !punkte || !eingabe || !beschluesse || !lage.data)
    return <SeitenSkelett />;

  const stichtag = eingabe.stichtag;
  const am = rundenDatum(stichtag);
  const bl = beschlussLage(eingabe.beschluesse, stichtag);
  const rot = punkte.filter((p) => p.ampel === "rot").length;

  const uebernehmen = (text: string) => {
    setVorschlag({ text, nonce: Date.now() });
    document
      .getElementById("beschluss-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <SeitenKopf
        titel="Wochenrunde"
        unterzeile={`${datumLang(am)} · 30 Minuten · Geschäftsführung. Tagesordnung aus den aktuellen Daten, Beschlüsse mit Verantwortlichem und Termin.`}
        aktionen={
          <>
            <Knopf onClick={() => window.print()}>
              <Printer /> Drucken
            </Knopf>
            <Knopf
              variante="primaer"
              onClick={() => uebernehmen("")}
              aria-controls="beschluss-form"
            >
              <Plus /> Beschluss erfassen
            </Knopf>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <BuehnenKennzahl
            label="Nächste Runde"
            wert={
              <Countdown
                ziel={am}
                stichtag={stichtag}
                className="text-stage-foreground"
              />
            }
            hinweis={datum(am)}
          />
          <BuehnenKennzahl
            label="Rote Punkte"
            wert={`${rot} / ${punkte.length}`}
            hinweis="Tagesordnung"
            ampel={rot ? "rot" : "gruen"}
          />
          <BuehnenKennzahl
            label="Offene Beschlüsse"
            wert={String(bl.offen.length)}
            hinweis={`${bl.ueberfaellig.length} über dem Termin`}
            ampel={
              bl.ueberfaellig.length
                ? "rot"
                : bl.offen.length
                  ? "gelb"
                  : "gruen"
            }
          />
          <BuehnenKennzahl
            label="Erledigt"
            wert={erledigtQuote(eingabe.beschluesse)}
            hinweis={`${bl.erledigtNeu.length} seit letzter Woche`}
          />
        </div>
      </SeitenKopf>

      {beschluesse.tabelleFehlt ? (
        <p className="mb-6 border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          Beschlüsse können noch nicht gespeichert werden: Die
          Datenbank-Erweiterung <code>20261009070000_board_wochenrunde</code>{" "}
          fehlt. Die Tagesordnung funktioniert trotzdem.
        </p>
      ) : null}

      <div className="hidden print:block">
        <p className="mb-4 text-sm">
          Teilnehmer: ____________________________________________ · Protokoll:
          ____________________
        </p>
      </div>

      <ol className="mb-12 space-y-3">
        {punkte.map((p) => (
          <TopKarte
            key={p.id}
            punkt={p}
            stichtag={stichtag}
            onVorschlag={uebernehmen}
          />
        ))}
      </ol>

      <section id="beschluesse" className="mb-10 scroll-mt-28">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-heading">
              Beschlüsse
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Offene Beschlüsse erscheinen in jeder Runde wieder, bis sie
              erledigt sind.
            </p>
          </div>
        </div>
        <div className="grid gap-4 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <BeschlussListe
            beschluesse={eingabe.beschluesse}
            stichtag={stichtag}
            gesellschaft={nach.gesellschaftKurz}
          />
          <BeschlussFormular
            key={vorschlag?.nonce ?? 0}
            vorgabe={vorschlag?.text ?? ""}
            runde={am}
            gesellschaften={lage.data.companies.map((c) => ({
              id: c.id,
              name: c.name,
            }))}
            gesperrt={beschluesse.tabelleFehlt}
          />
        </div>
      </section>
    </>
  );
}

function TopKarte({
  punkt: p,
  stichtag,
  onVorschlag,
}: {
  punkt: TopPunkt;
  stichtag: string;
  onVorschlag: (text: string) => void;
}) {
  const extern = p.href.startsWith("/");
  return (
    <li className="break-inside-avoid">
      <Karte className="relative grid gap-4 p-5 md:grid-cols-[72px_minmax(0,1fr)_160px]">
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            p.ampel === "rot"
              ? "bg-bad"
              : p.ampel === "gelb"
                ? "bg-warn"
                : p.ampel === "gruen"
                  ? "bg-ok"
                  : "bg-hairline",
          )}
          aria-hidden
        />
        <div className="ziffern text-[40px] font-semibold leading-none tracking-[-0.04em] text-brand-text">
          {String(p.nr).padStart(2, "0")}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AmpelPunkt ampel={p.ampel} />
            <h3 className="text-[16px] font-semibold text-heading">
              {p.titel}
            </h3>
            {extern ? (
              <Link
                to={p.href}
                className="nicht-drucken ml-1 text-text-subtle hover:text-brand-text"
                aria-label={`${p.titel} öffnen`}
              >
                <ArrowUpRight className="size-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-foreground">{p.aussage}</p>
          {p.zeilen.length ? (
            <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
              {p.zeilen.map((z, i) => (
                <li
                  key={`${p.id}-${i}`}
                  className="flex items-center gap-3 py-1.5 text-[13px]"
                >
                  {z.ampel ? <AmpelPunkt ampel={z.ampel} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {z.text}
                    </span>
                    {z.detail ? (
                      <span className="block truncate text-xs text-text-muted">
                        {z.detail}
                      </span>
                    ) : null}
                  </span>
                  {z.rechts ? (
                    <span className="ziffern shrink-0 text-xs text-text-muted">
                      {z.rechts}
                    </span>
                  ) : null}
                  {z.datum ? (
                    <Countdown
                      ziel={z.datum}
                      stichtag={stichtag}
                      className="w-[92px] shrink-0 text-right text-xs font-semibold"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {p.vorschlag ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-[0.08em] text-brand-text">
                Vorschlag
              </span>
              <span className="text-foreground">{p.vorschlag}</span>
              <button
                type="button"
                onClick={() => onVorschlag(p.vorschlag!)}
                className="nicht-drucken ml-auto inline-flex items-center gap-1 border border-hairline px-2 py-1 text-xs hover:border-heading"
              >
                <Plus className="size-3.5" /> als Beschluss
              </button>
            </div>
          ) : null}
        </div>
        <div className="text-left md:text-right">
          <div className="ziffern text-[30px] font-semibold leading-none tracking-[-0.03em] text-heading">
            {p.zahl}
          </div>
          <div className="mt-1 text-xs text-text-muted">{p.zahlLabel}</div>
        </div>
      </Karte>
    </li>
  );
}

function BeschlussListe({
  beschluesse,
  stichtag,
  gesellschaft,
}: {
  beschluesse: Beschluss[];
  stichtag: string;
  gesellschaft: (id: string | null) => string;
}) {
  const { status } = useBeschlussAktionen();
  const sortiert = [...beschluesse].sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === "offen" ? -1 : 1) ||
      (a.faelligAm ?? "9999").localeCompare(b.faelligAm ?? "9999"),
  );
  if (!sortiert.length)
    return (
      <Karte className="p-8 text-center text-sm text-text-muted">
        Noch keine Beschlüsse. Übernimm einen Vorschlag aus der Tagesordnung
        oder erfasse einen eigenen.
      </Karte>
    );
  const umschalten = async (b: Beschluss) => {
    try {
      await status(b.id, b.status === "offen" ? "erledigt" : "offen", stichtag);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Karte>
      <ul className="divide-y divide-hairline">
        {sortiert.map((b) => {
          const erledigt = b.status === "erledigt";
          const ueber =
            !erledigt && b.faelligAm != null && b.faelligAm < stichtag;
          return (
            <li key={b.id} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => umschalten(b)}
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors",
                  erledigt
                    ? "border-ok bg-ok text-white"
                    : "border-input hover:border-heading",
                )}
                aria-label={
                  erledigt
                    ? `${b.id} wieder öffnen`
                    : `${b.id} als erledigt markieren`
                }
              >
                {erledigt ? <Check className="size-3.5" /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-sm",
                    erledigt
                      ? "text-text-muted line-through decoration-text-subtle"
                      : "text-heading",
                  )}
                >
                  {b.text}
                </div>
                <div className="ziffern mt-0.5 flex flex-wrap gap-x-2 text-xs text-text-muted">
                  <span>{b.id}</span>
                  <span>Runde {datum(b.rundeAm)}</span>
                  {b.verantwortlich ? <span>{b.verantwortlich}</span> : null}
                  {b.companyId ? (
                    <span>{gesellschaft(b.companyId)}</span>
                  ) : null}
                  {b.bezugId ? <span>{b.bezugId}</span> : null}
                  {erledigt && b.erledigtAm ? (
                    <span>erledigt {datum(b.erledigtAm)}</span>
                  ) : null}
                </div>
              </div>
              {!erledigt && b.faelligAm ? (
                <Countdown
                  ziel={b.faelligAm}
                  stichtag={stichtag}
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    ueber ? "text-bad" : "",
                  )}
                />
              ) : erledigt ? (
                <button
                  type="button"
                  onClick={() => umschalten(b)}
                  className="nicht-drucken shrink-0 text-text-subtle hover:text-heading"
                  aria-label={`${b.id} wieder öffnen`}
                  title="wieder öffnen"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Karte>
  );
}

function BeschlussFormular({
  vorgabe,
  runde,
  gesellschaften,
  gesperrt,
}: {
  vorgabe: string;
  runde: string;
  gesellschaften: Array<{ id: string; name: string }>;
  gesperrt: boolean;
}) {
  const { anlegen } = useBeschlussAktionen();
  const [text, setText] = useState(vorgabe);
  const [wer, setWer] = useState("");
  const [bis, setBis] = useState("");
  const [gesellschaft, setGesellschaft] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) {
      toast.error("Bitte den Beschluss in einem Satz beschreiben.");
      return;
    }
    setLaeuft(true);
    try {
      const id = await anlegen({
        rundeAm: runde,
        text: text.trim(),
        verantwortlich: wer.trim() || null,
        faelligAm: bis || null,
        bezugTyp: gesellschaft ? "gesellschaft" : null,
        bezugId: gesellschaft || null,
        companyId: gesellschaft || null,
      });
      toast.success(`Beschluss ${id} gespeichert`);
      setText("");
      setWer("");
      setBis("");
      setGesellschaft("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Karte className="nicht-drucken self-start p-4">
      <form id="beschluss-form" onSubmit={absenden} className="space-y-3">
        <h3 className="text-sm font-semibold text-heading">Neuer Beschluss</h3>
        <label className="block text-xs text-text-muted">
          Beschluss
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus={Boolean(vorgabe)}
            className={cn(FELD, "h-auto py-2")}
            placeholder="Was wird getan?"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-text-muted">
            Verantwortlich
            <input
              value={wer}
              onChange={(e) => setWer(e.target.value)}
              className={FELD}
              placeholder="Name"
            />
          </label>
          <label className="block text-xs text-text-muted">
            Termin
            <input
              type="date"
              value={bis}
              onChange={(e) => setBis(e.target.value)}
              className={FELD}
            />
          </label>
        </div>
        <label className="block text-xs text-text-muted">
          Gesellschaft (optional)
          <select
            value={gesellschaft}
            onChange={(e) => setGesellschaft(e.target.value)}
            className={FELD}
          >
            <option value="">Gruppe</option>
            {gesellschaften.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <Knopf
          type="submit"
          variante="primaer"
          className="w-full"
          disabled={laeuft || gesperrt}
        >
          {laeuft ? "Speichert…" : `Für die Runde am ${datum(runde)} speichern`}
        </Knopf>
      </form>
    </Karte>
  );
}
