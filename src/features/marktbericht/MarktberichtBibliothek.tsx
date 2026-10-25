import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type {
  DokumentStatus,
  MarktberichtDokument,
  MarktberichtQuelle,
} from "@/lib/marktbericht/quellen";
import type { Bibliothek } from "@/lib/marktbericht/quellen-server-fn";

const STATUS: Record<DokumentStatus, { text: string; klasse: string }> = {
  neu: { text: "Wartet", klasse: "bg-surface-muted text-text-muted" },
  ausgelesen: { text: "Ausgelesen", klasse: "bg-ok-soft text-ok" },
  gesperrt: { text: "Nur mit Anmeldung", klasse: "bg-warn-soft text-warn" },
  fehler: { text: "Fehler", klasse: "bg-red-50 text-red-900" },
  ohne_werte: {
    text: "Ohne passende Werte",
    klasse: "bg-surface-muted text-text-muted",
  },
};

function laufText(r: {
  neueDokumente: number;
  ausgelesen: number;
  gesperrt: number;
  fehler: number;
}): string {
  const teile = [
    `${r.neueDokumente} neue Berichte gefunden`,
    `${r.ausgelesen} ausgelesen`,
  ];
  if (r.gesperrt) teile.push(`${r.gesperrt} nur mit Anmeldung`);
  if (r.fehler) teile.push(`${r.fehler} Fehler`);
  return teile.join(", ");
}

function DokumentZeile({
  d,
  onErneut,
}: {
  d: MarktberichtDokument;
  onErneut: () => void;
}) {
  const belegt = d.kennzahlen.filter((k) => k.geprueft).length;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-1 text-sm text-heading hover:underline"
        >
          <span className="truncate">{d.titel}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${STATUS[d.status].klasse}`}
        >
          {STATUS[d.status].text}
        </span>
        {(d.status === "fehler" || d.status === "gesperrt") && (
          <button
            type="button"
            className="text-xs text-text-muted underline"
            onClick={onErneut}
          >
            erneut versuchen
          </button>
        )}
      </div>
      <span className="text-xs text-text-muted">
        {d.art === "pdf" ? "PDF" : "Webseite"}
        {d.stichtag ? ` · Stand ${formatDate(d.stichtag)}` : ""}
        {d.status === "ausgelesen"
          ? ` · ${d.kennzahlen.length} Kennzahlen, ${belegt} im Originaltext belegt`
          : ""}
        {d.fehler && d.status !== "ausgelesen" ? ` · ${d.fehler}` : ""}
      </span>
    </li>
  );
}

function QuelleZeile({
  q,
  dokumente,
  token,
  onNeu,
}: {
  q: MarktberichtQuelle;
  dokumente: MarktberichtDokument[];
  token: string;
  onNeu: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const ausfuehren = async (name: string, f: () => Promise<void>) => {
    setBusy(name);
    try {
      await f();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen.", {
        duration: 12_000,
      });
    } finally {
      setBusy(null);
      onNeu();
    }
  };

  const suchen = () =>
    ausfuehren("suchen", async () => {
      toast.info(`${q.name}: Suche läuft. Das kann einige Minuten dauern.`);
      const { marktberichtQuelleSuchenFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      const r = await marktberichtQuelleSuchenFn({
        data: { supabaseAccessToken: token, quelleId: q.id },
      });
      toast.success(`${q.name}: ${laufText(r)}.`);
    });

  const aktivSetzen = (aktiv: boolean) =>
    ausfuehren("aktiv", async () => {
      const { marktberichtQuelleSpeichernFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      await marktberichtQuelleSpeichernFn({
        data: { supabaseAccessToken: token, id: q.id, aktiv },
      });
    });

  const hinzufuegen = () =>
    ausfuehren("link", async () => {
      const { marktberichtDokumentHinzufuegenFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      const r = await marktberichtDokumentHinzufuegenFn({
        data: { supabaseAccessToken: token, quelleId: q.id, url: link },
      });
      setLink("");
      toast.success(`Bericht übernommen: ${laufText(r)}.`);
    });

  const erneut = (id: string) =>
    ausfuehren("erneut", async () => {
      const { marktberichtDokumentErneutFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      await marktberichtDokumentErneutFn({
        data: { supabaseAccessToken: token, id },
      });
      toast.success("Wird beim nächsten Lauf erneut ausgelesen.");
    });

  const ausgelesen = dokumente.filter((d) => d.status === "ausgelesen");
  const juengster = ausgelesen.find((d) => d.stichtag)?.stichtag;

  return (
    <li className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOffen((o) => !o)}
          aria-expanded={offen}
        >
          {offen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
          )}
          <span className="flex min-w-0 flex-col">
            <span
              className={`font-medium ${q.aktiv ? "text-heading" : "text-text-muted line-through"}`}
            >
              {q.name}
            </span>
            <span className="text-xs text-text-muted">
              {ausgelesen.length} von {dokumente.length} Berichten ausgelesen
              {juengster ? ` · jüngster Stand ${formatDate(juengster)}` : ""}
              {q.zuletztGesucht
                ? ` · gesucht ${formatDate(q.zuletztGesucht)}`
                : " · noch nicht gesucht"}
            </span>
            {q.letzterFehler ? (
              <span className="text-xs text-red-900">{q.letzterFehler}</span>
            ) : null}
          </span>
        </button>
        <label className="flex items-center gap-1 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={q.aktiv}
            disabled={!!busy}
            onChange={(e) => void aktivSetzen(e.target.checked)}
          />
          automatisch
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => void suchen()}
        >
          {busy === "suchen" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Jetzt suchen
        </Button>
      </div>
      {offen ? (
        <div className="flex flex-col gap-2 border-t border-hairline bg-surface-muted/40 px-5 py-3 pl-11">
          <p className="text-xs text-text-subtle">
            Suchauftrag: {q.suchauftrag}
          </p>
          {dokumente.length ? (
            <ul className="divide-y divide-hairline">
              {dokumente.map((d) => (
                <DokumentZeile
                  key={d.id}
                  d={d}
                  onErneut={() => void erneut(d.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Noch keine Berichte.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-8 max-w-md text-sm"
              placeholder="Link zu einem Bericht dieses Hauses (https://…)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || !link.trim()}
              onClick={() => void hinzufuegen()}
            >
              {busy === "link" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Hinzufügen und auslesen
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Bibliothek der Marktberichte anderer Häuser: Quellen, gefundene Berichte, Status. */
export function MarktberichtBibliothek({ token }: { token: string }) {
  const [daten, setDaten] = useState<Bibliothek | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [auftrag, setAuftrag] = useState("");
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { marktberichtBibliothekFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      setDaten(
        await marktberichtBibliothekFn({
          data: { supabaseAccessToken: token },
        }),
      );
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Bibliothek nicht ladbar.");
    }
  }, [token]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const quelleAnlegen = async () => {
    setBusy(true);
    try {
      const { marktberichtQuelleSpeichernFn } =
        await import("@/lib/marktbericht/quellen-server-fn");
      await marktberichtQuelleSpeichernFn({
        data: { supabaseAccessToken: token, name, suchauftrag: auftrag },
      });
      setName("");
      setAuftrag("");
      toast.success("Quelle angelegt. Sie wird beim nächsten Lauf durchsucht.");
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const doks = daten?.dokumente ?? [];
  const belegt = doks.reduce(
    (n, d) => n + d.kennzahlen.filter((k) => k.geprueft).length,
    0,
  );

  return (
    <section className="flex flex-col border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-heading">
            Bibliothek: Marktberichte anderer Häuser
          </h2>
          <p className="text-xs text-text-muted">
            Jede Quelle wird einmal pro Woche automatisch nach neuen Berichten
            durchsucht. Gefundene Berichte werden ausgelesen; Werte, deren Zitat
            samt Zahl im Originaltext steht, fließen als belegt in den
            Grenz-Bericht. Ab 1. August und 1. Februar entsteht der Entwurf der
            Periode automatisch.
            {daten
              ? ` Bisher ${doks.filter((d) => d.status === "ausgelesen").length} Berichte, ${belegt} belegte Kennzahlen.`
              : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void laden()}>
          <RefreshCw className="h-4 w-4" /> Aktualisieren
        </Button>
      </div>
      {fehler ? (
        <p className="m-5 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">
          {fehler}
        </p>
      ) : daten === null ? (
        <div className="p-5">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {daten.quellen.map((q) => (
            <QuelleZeile
              key={q.id}
              q={q}
              dokumente={doks.filter((d) => d.quelleId === q.id)}
              token={token}
              onNeu={() => void laden()}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-hairline px-5 py-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Weiteres Haus
          <Input
            className="h-8 w-56 text-sm"
            placeholder="z. B. Dr. Lübke & Kelber"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-text-muted">
          Welche Berichte, welche Website
          <Input
            className="h-8 text-sm"
            placeholder="z. B. Wohnungsmarktstudie NRW, Investmentmarkt Köln; luebke-kelber.de"
            value={auftrag}
            onChange={(e) => setAuftrag(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !name.trim() || !auftrag.trim()}
          onClick={() => void quelleAnlegen()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Quelle hinzufügen
        </Button>
      </div>
    </section>
  );
}
