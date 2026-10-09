import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Knopf } from "@/components/board/Knopf";
import {
  BuehnenKennzahl,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { AmpelPunkt } from "@/components/board/Status";
import {
  REVIEW_QUELLEN,
  type ReviewItem,
  type ReviewQuelle,
} from "@/lib/db/typen";
import { datum, prozent, relativTage } from "@/lib/format/de";
import { tageZwischen } from "@/lib/kalender";
import { cn } from "@/lib/utils";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import { pruefFallZiel, QUELLE_LABEL } from "./logik/pruefliste";
import { useLage, usePruefStatus } from "./useLage";

type Filter = "alle" | ReviewQuelle;

export function PrueflisteSeite() {
  const lage = useLage();
  const filter = useGesellschaftsFilter();
  const setzen = usePruefStatus();
  const [quelle, setQuelle] = useState<Filter>("alle");
  const [erledigteZeigen, setErledigteZeigen] = useState(false);

  if (lage.fehler)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Prüfliste nicht verfügbar"
        text={(lage.fehler as Error).message}
      />
    );
  if (lage.laedt || !lage.faelle || !lage.data) return <SeitenSkelett />;

  const daten = lage.data;
  const imFilter = lage.faelle.filter(
    (f) => filter.alle || f.companyId === filter.gesellschaft,
  );
  const offen = imFilter.filter((f) => f.status === "offen");
  const rot = offen.filter((f) => f.severity === "rot");
  const ueberfaellig = offen.filter(
    (f) => f.dueDate && f.dueDate < daten.stichtag,
  );
  const sichtbar = imFilter.filter(
    (f) =>
      (quelle === "alle" || f.source === quelle) &&
      (erledigteZeigen || f.status === "offen"),
  );
  const kurz = (id: string | null) =>
    daten.companies.find((c) => c.id === id)?.shortName ?? "–";

  const umschalten = async (f: ReviewItem) => {
    const neu = f.status === "offen" ? "erledigt" : "offen";
    await setzen(f.id, neu);
    if (neu === "erledigt")
      toast.success("Erledigt", {
        description: f.title,
        action: {
          label: "Rückgängig",
          onClick: () => void setzen(f.id, "offen"),
        },
      });
  };

  return (
    <>
      <SeitenKopf
        titel="Prüfliste"
        unterzeile="Alles, was eine Entscheidung braucht, aus allen Modulen · rot zuerst, dann nach Fälligkeit"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-5">
          <BuehnenKennzahl
            label="Offen"
            wert={String(offen.length)}
            hinweis={`${imFilter.length - offen.length} erledigt`}
            ampel={offen.length > 10 ? "gelb" : "grau"}
          />
          <BuehnenKennzahl
            label="Rot"
            wert={String(rot.length)}
            hinweis="sofort handeln"
            ampel={rot.length ? "rot" : "gruen"}
          />
          <BuehnenKennzahl
            label="Überfällig"
            wert={String(ueberfaellig.length)}
            hinweis="Fälligkeit vor heute"
            ampel={ueberfaellig.length ? "gelb" : "gruen"}
          />
          {(["darlehen", "immobilien"] as const).map((q) => (
            <BuehnenKennzahl
              key={q}
              label={QUELLE_LABEL[q]}
              wert={String(offen.filter((f) => f.source === q).length)}
              hinweis="offene Fälle"
            />
          ))}
        </div>
      </SeitenKopf>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmente
          label="Quelle"
          wert={quelle}
          onChange={setQuelle}
          optionen={[
            { wert: "alle", label: `Alle (${offen.length})` },
            ...REVIEW_QUELLEN.map((q) => ({
              wert: q,
              label: `${QUELLE_LABEL[q]} (${offen.filter((f) => f.source === q).length})`,
            })),
          ]}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={erledigteZeigen}
            onChange={(e) => setErledigteZeigen(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          Erledigte anzeigen
        </label>
      </div>

      {sichtbar.length === 0 ? (
        <Leerzustand
          icon={CheckCircle2}
          titel="Nichts offen"
          text="Für diese Auswahl gibt es keine offenen Prüffälle."
        />
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface schatten-karte">
          {sichtbar.map((f) => {
            const ziel = pruefFallZiel(f, daten);
            const tage = f.dueDate
              ? tageZwischen(daten.stichtag, f.dueDate)
              : null;
            return (
              <li
                key={f.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  f.status === "erledigt" && "opacity-55",
                )}
              >
                <AmpelPunkt
                  ampel={f.status === "erledigt" ? "grau" : f.severity}
                  className="mt-1.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={cn(
                        "font-medium text-heading",
                        f.status === "erledigt" && "line-through",
                      )}
                    >
                      {f.title}
                    </span>
                    <span className="text-xs text-text-subtle">
                      {QUELLE_LABEL[f.source]} · {kurz(f.companyId)}
                      {f.confidence !== null
                        ? ` · KI ${prozent(f.confidence, 0)}`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-text-muted">{f.detail}</p>
                </div>
                <div className="hidden w-28 shrink-0 text-right text-xs tabular-nums sm:block">
                  {f.dueDate ? (
                    <>
                      <div>{datum(f.dueDate)}</div>
                      <div
                        className={cn(
                          "text-text-muted",
                          tage !== null &&
                            tage < 0 &&
                            f.status === "offen" &&
                            "text-bad",
                        )}
                      >
                        {relativTage(tage ?? 0)}
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Knopf variante="geist" groesse="icon-sm" asChild>
                    <Link
                      to={ziel.to}
                      search={ziel.search as never}
                      aria-label="Im Modul öffnen"
                      title="Im Modul öffnen"
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Knopf>
                  <Knopf
                    variante="geist"
                    groesse="icon-sm"
                    onClick={() => void umschalten(f)}
                    aria-label={
                      f.status === "offen"
                        ? "Als erledigt markieren"
                        : "Wieder öffnen"
                    }
                    title={
                      f.status === "offen"
                        ? "Als erledigt markieren"
                        : "Wieder öffnen"
                    }
                  >
                    {f.status === "offen" ? (
                      <Check className="size-4" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                  </Knopf>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
