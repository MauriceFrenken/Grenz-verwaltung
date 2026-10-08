import { AlertTriangle, FolderInput, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DatenTabelle, type Spalte } from "@/components/board/DatenTabelle";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Knopf } from "@/components/board/Knopf";
import { KpiKarte } from "@/components/board/KpiKarte";
import {
  Abschnitt,
  Karte,
  SeitenKopf,
  Segmente,
} from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";
import { SeitenSkelett } from "@/components/board/Skelett";
import { StatusBadge } from "@/components/board/Status";
import type { Ampel } from "@/components/board/ampel";
import { DOKUMENTTYPEN, type Dokumenttyp } from "@/lib/ai/klassifikation";
import type { BoardDaten } from "@/lib/db/typen";
import { datum, euro, prozent } from "@/lib/format/de";
import { oneDriveAblage } from "@/lib/integrations/microsoft-graph";
import { cn } from "@/lib/utils";
import { useBoardDaten, useGesellschaftsFilter } from "@/modules/shell/daten";
import {
  AUTO_SCHWELLE,
  dateiname,
  messen,
  ordnerFuer,
  ordnerGruppe,
  quoten,
  type AblageVorschlag,
  type Feld,
  type Quote,
} from "./logik/ablage";
import { ABLAGE_ERWARTUNGEN, ABLAGE_MAILS } from "./testset";
import { useAblageVorschlaege } from "./useAblage";

type Reiter = "alle" | "pruefen" | "auto" | "messung";
type Status = { art: "abgelegt"; url: string; korrigiert: boolean };

function konfidenzAmpel(c: number): Ampel {
  return c >= AUTO_SCHWELLE ? "gruen" : c >= 0.7 ? "gelb" : "rot";
}

function KonfidenzBalken({ wert }: { wert: number }) {
  const a = konfidenzAmpel(wert);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            "h-full rounded-full",
            a === "gruen" ? "bg-ok" : a === "gelb" ? "bg-warn" : "bg-bad",
          )}
          style={{ width: `${Math.round(wert * 100)}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-text-muted">
        {prozent(wert, 0)}
      </span>
    </div>
  );
}

export function AblageSeite() {
  const { data, isLoading, error } = useBoardDaten();
  const vorschlaege = useAblageVorschlaege(data);
  const filter = useGesellschaftsFilter();
  const [reiter, setReiter] = useState<Reiter>("alle");
  const [offen, setOffen] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});

  const kurz = useMemo(() => {
    const m = new Map(data?.companies.map((c) => [c.id, c.shortName]) ?? []);
    return (id: string | null) => (id ? (m.get(id) ?? null) : null);
  }, [data]);

  const fehler = error ?? vorschlaege.error;
  if (fehler)
    return (
      <Leerzustand
        icon={AlertTriangle}
        titel="Ablage v2 nicht verfügbar"
        text={(fehler as Error).message}
      />
    );
  if (isLoading || !data || !vorschlaege.data) return <SeitenSkelett />;

  const alle = vorschlaege.data.filter(
    (v) => filter.alle || v.gesellschaftId.wert === filter.gesellschaft,
  );
  const zuPruefen = alle.filter((v) => v.pruefen && !status[v.mail.id]);
  const automatisch = alle.filter((v) => !v.pruefen);
  const messung = messen(vorschlaege.data, ABLAGE_ERWARTUNGEN, kurz);
  const gesamt = quoten(messung, () => "alle")[0];
  const zeilen =
    reiter === "pruefen" ? zuPruefen : reiter === "auto" ? automatisch : alle;
  const offenerVorschlag = vorschlaege.data.find((v) => v.mail.id === offen);

  const spalten: Spalte<AblageVorschlag>[] = [
    {
      id: "empfangen",
      kopf: "Eingang",
      zelle: (v) => (
        <span className="tabular-nums text-text-muted">
          {datum(v.mail.empfangen.slice(0, 10))}
        </span>
      ),
      sortierWert: (v) => v.mail.empfangen,
      breite: "w-28",
    },
    {
      id: "betreff",
      kopf: "Mail",
      zelle: (v) => (
        <div className="min-w-0 max-w-[340px]">
          <div className="truncate font-medium">{v.mail.betreff}</div>
          <div className="truncate text-xs text-text-muted">
            {v.mail.absender}
          </div>
        </div>
      ),
      sortierWert: (v) => v.mail.betreff,
    },
    {
      id: "vorschlag",
      kopf: "Vorschlag",
      zelle: (v) => (
        <div className="min-w-0 max-w-[360px]">
          <div className="truncate">
            {kurz(v.gesellschaftId.wert) ?? "–"} · {v.dokumenttyp.wert ?? "–"}
            {v.bezugId.wert ? ` · ${v.bezugId.wert}` : ""}
          </div>
          <div
            className="truncate text-xs text-text-muted"
            title={`${v.ordner}/${v.dateiname}`}
          >
            {v.ordner}
          </div>
        </div>
      ),
      sortierWert: (v) => v.ordner,
      optional: true,
    },
    {
      id: "konfidenz",
      kopf: "Konfidenz",
      zelle: (v) => <KonfidenzBalken wert={v.konfidenz} />,
      sortierWert: (v) => v.konfidenz,
    },
    {
      id: "status",
      kopf: "Status",
      zelle: (v) => {
        const s = status[v.mail.id];
        if (s)
          return (
            <StatusBadge ampel="gruen">
              {s.korrigiert ? "korrigiert abgelegt" : "abgelegt"}
            </StatusBadge>
          );
        return v.pruefen ? (
          <StatusBadge ampel="gelb">prüfen</StatusBadge>
        ) : (
          <StatusBadge ampel="akzent">automatisch</StatusBadge>
        );
      },
      sortierWert: (v) => (status[v.mail.id] ? 2 : v.pruefen ? 0 : 1),
    },
  ];

  const ablegen = async (
    v: AblageVorschlag,
    gesellschaftId: string | null,
    ordner: string,
    name: string,
    korrigiert: boolean,
  ) => {
    const firma = data.companies.find((c) => c.id === gesellschaftId);
    if (!firma) {
      toast.error("Bitte zuerst eine Gesellschaft wählen.");
      return;
    }
    try {
      const url = await oneDriveAblage().ablegen(
        v.mail,
        `${firma.oneDriveFolder}/${ordner}`,
        name,
      );
      setStatus((s) => ({
        ...s,
        [v.mail.id]: { art: "abgelegt", url, korrigiert },
      }));
      toast.success("Abgelegt (Demo)", {
        description: `${firma.shortName}/${ordner}/${name}`,
      });
      setOffen(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <SeitenKopf
        titel="Ablage v2"
        unterzeile="Regeln, dann KI mit Konfidenz je Feld · unter 90 % entscheidet ein Mensch · läuft parallel zur bestehenden Gelb-Ablage"
      />

      <div className="mb-6 flex items-start gap-2 border border-hairline bg-accent-soft px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          Testbetrieb mit {ABLAGE_MAILS.length} fiktiven Mails und simulierter
          KI. Es wird nichts in OneDrive geschrieben; die produktive Ablage
          bleibt unverändert.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiKarte
          label="Eingang"
          wert={String(alle.length)}
          hinweis="Mails mit Anhang"
        />
        <KpiKarte
          label="Automatisch"
          wert={String(automatisch.length)}
          hinweis={`${prozent(alle.length ? automatisch.length / alle.length : 0, 0)} Dunkelverarbeitung`}
          ampel="gruen"
        />
        <KpiKarte
          label="Prüfliste"
          wert={String(zuPruefen.length)}
          hinweis="Konfidenz unter 90 %"
          ampel={zuPruefen.length ? "gelb" : "gruen"}
        />
        <KpiKarte
          label="Trefferquote Testset"
          wert={prozent(gesamt.quote, 0)}
          hinweis={`${gesamt.treffer} von ${gesamt.anzahl} richtig vorgeschlagen`}
          ampel={gesamt.quote >= 0.9 ? "gruen" : "gelb"}
        />
        <KpiKarte
          label="Fehlablagen"
          wert={String(gesamt.fehlablagen)}
          hinweis="falsch und ohne Prüfung abgelegt"
          ampel={gesamt.fehlablagen ? "rot" : "gruen"}
        />
      </div>

      <div className="mb-4">
        <Segmente
          label="Ansicht"
          wert={reiter}
          onChange={setReiter}
          optionen={[
            { wert: "alle", label: `Alle (${alle.length})` },
            { wert: "pruefen", label: `Prüfliste (${zuPruefen.length})` },
            { wert: "auto", label: `Automatisch (${automatisch.length})` },
            { wert: "messung", label: "Messung" },
          ]}
        />
      </div>

      {reiter === "messung" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <QuotenTabelle
            titel="Trefferquote je Gesellschaft"
            quoten={quoten(
              messung,
              (e) => e.erwartet.gesellschaft ?? "(keine)",
            )}
          />
          <QuotenTabelle
            titel="Trefferquote je Ordner"
            quoten={quoten(messung, (e) => ordnerGruppe(e.erwartet.ordner))}
          />
          <p className="text-xs text-text-muted xl:col-span-2">
            Treffer heißt: Gesellschaft und Ordner stimmen mit der fachlichen
            Erwartung im Testset überein. Neu messen mit{" "}
            <code className="rounded bg-surface-muted px-1">
              npm run ablage:messen
            </code>{" "}
            (Bericht in docs/testdaten/ablage-v2-messbericht.md).
          </p>
        </div>
      ) : (
        <DatenTabelle
          label="Eingangs-Mails"
          zeilen={zeilen}
          spalten={spalten}
          schluessel={(v) => v.mail.id}
          onZeileKlick={(v) => setOffen(v.mail.id)}
          aktiveZeile={offen ?? undefined}
          startSortierung={{ id: "status", richtung: "auf" }}
          suchText={(v) =>
            `${v.mail.betreff} ${v.mail.absender} ${v.mail.text} ${v.ordner}`
          }
          leer={
            <Leerzustand
              icon={FolderInput}
              titel="Nichts zu prüfen"
              text="Alle Vorschläge sind abgelegt."
            />
          }
        />
      )}

      <VorschlagDetail
        key={offenerVorschlag?.mail.id}
        v={offenerVorschlag}
        daten={data}
        erledigt={
          offenerVorschlag ? Boolean(status[offenerVorschlag.mail.id]) : false
        }
        onSchliessen={() => setOffen(null)}
        onAblegen={ablegen}
      />
    </>
  );
}

function QuotenTabelle({
  titel,
  quoten: q,
}: {
  titel: string;
  quoten: Quote[];
}) {
  return (
    <Abschnitt titel={titel} className="mb-0">
      <Karte className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted shadow-[inset_0_-1px_0_var(--hairline)]">
              <th className="h-9 px-4 text-left font-medium">Gruppe</th>
              <th className="px-3 text-right font-medium">Mails</th>
              <th className="px-3 text-right font-medium">Treffer</th>
              <th className="px-3 text-right font-medium">Automatisch</th>
              <th className="px-4 text-right font-medium">Fehlablagen</th>
            </tr>
          </thead>
          <tbody>
            {q.map((z) => (
              <tr
                key={z.gruppe}
                className="border-t border-hairline first:border-t-0"
              >
                <td className="h-9 px-4">{z.gruppe}</td>
                <td className="px-3 text-right">{z.anzahl}</td>
                <td
                  className={cn("px-3 text-right", z.quote < 1 && "text-warn")}
                >
                  {prozent(z.quote, 0)}
                </td>
                <td className="px-3 text-right">{z.automatisch}</td>
                <td
                  className={cn(
                    "px-4 text-right",
                    z.fehlablagen > 0 && "font-medium text-bad",
                  )}
                >
                  {z.fehlablagen}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </Abschnitt>
  );
}

const QUELLE_LABEL = {
  regel: "Regel",
  ki: "KI",
  "regel+ki": "Regel + KI",
  keine: "–",
} as const;

function FeldZeile<T>({
  label,
  feld,
  anzeige,
}: {
  label: string;
  feld: Feld<T>;
  anzeige?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {anzeige ?? (feld.wert === null ? "–" : String(feld.wert))}
      </span>
      <span className="shrink-0 text-xs text-text-subtle">
        {QUELLE_LABEL[feld.quelle]}
      </span>
      <KonfidenzBalken wert={feld.konfidenz} />
    </div>
  );
}

function VorschlagDetail({
  v,
  daten,
  erledigt,
  onSchliessen,
  onAblegen,
}: {
  v: AblageVorschlag | undefined;
  daten: BoardDaten;
  erledigt: boolean;
  onSchliessen: () => void;
  onAblegen: (
    v: AblageVorschlag,
    gesellschaftId: string | null,
    ordner: string,
    name: string,
    korrigiert: boolean,
  ) => void;
}) {
  const [firma, setFirma] = useState(v?.gesellschaftId.wert ?? "");
  const [typ, setTyp] = useState<Dokumenttyp | "">(v?.dokumenttyp.wert ?? "");
  const [bezug, setBezug] = useState(v?.bezugId.wert ?? "");
  if (!v)
    return (
      <DetailPanel offen={false} onSchliessen={onSchliessen} titel="">
        {null}
      </DetailPanel>
    );

  const korrigiert =
    firma !== (v.gesellschaftId.wert ?? "") ||
    typ !== (v.dokumenttyp.wert ?? "") ||
    bezug !== (v.bezugId.wert ?? "");
  const ordner = korrigiert
    ? ordnerFuer(typ || null, bezug || null, v.datum.wert)
    : v.ordner;
  const kuerzel =
    daten.companies.find((c) => c.id === firma)?.shortName ?? null;
  const name = korrigiert
    ? dateiname(v.datum.wert, typ || null, bezug || kuerzel, v.kurzbeschreibung)
    : v.dateiname;
  const firmaObj = daten.companies.find((c) => c.id === firma);
  const bezugOptionen = [
    ...daten.properties
      .filter((p) => !firma || p.companyId === firma)
      .map((p) => ({ id: p.id, label: `${p.id} ${p.name}` })),
    ...daten.loans
      .filter(
        (l) =>
          !firma ||
          l.borrowerCompanyId === firma ||
          l.lenderCompanyId === firma,
      )
      .map((l) => ({ id: l.id, label: `${l.id} ${l.purpose}` })),
  ];
  const auswahl =
    "mt-1 h-8 w-full cursor-pointer border border-hairline bg-surface px-2 text-sm text-foreground outline-none";

  return (
    <DetailPanel
      offen
      onSchliessen={onSchliessen}
      breite="lg"
      titel={v.mail.betreff}
      unterzeile={`${v.mail.absender} · ${datum(v.mail.empfangen.slice(0, 10))}`}
      kopfzeile={
        erledigt ? (
          <StatusBadge ampel="gruen">abgelegt</StatusBadge>
        ) : (
          <StatusBadge ampel={konfidenzAmpel(v.konfidenz)}>
            {prozent(v.konfidenz, 0)} Konfidenz
          </StatusBadge>
        )
      }
    >
      <PanelAbschnitt titel="Mail">
        <div className=" border border-hairline bg-surface-muted/50 p-3 text-sm leading-relaxed">
          {v.mail.text}
        </div>
        {v.mail.anhang ? (
          <p className="mt-2 text-xs text-text-muted">
            Anhang: {v.mail.anhang}
          </p>
        ) : null}
      </PanelAbschnitt>

      <PanelAbschnitt titel="Erkannte Felder">
        <div className="divide-y divide-hairline">
          <FeldZeile
            label="Gesellschaft"
            feld={v.gesellschaftId}
            anzeige={
              daten.companies.find((c) => c.id === v.gesellschaftId.wert)?.name
            }
          />
          <FeldZeile label="Dokumenttyp" feld={v.dokumenttyp} />
          <FeldZeile label="Bezug" feld={v.bezugId} />
          <FeldZeile
            label="Datum"
            feld={v.datum}
            anzeige={v.datum.wert ? datum(v.datum.wert) : undefined}
          />
          <FeldZeile
            label="Betrag"
            feld={v.betrag}
            anzeige={v.betrag.wert !== null ? euro(v.betrag.wert) : undefined}
          />
        </div>
        {v.unsicher.length ? (
          <p className="mt-2 text-xs text-warn">
            Unter {prozent(AUTO_SCHWELLE, 0)}: {v.unsicher.join(", ")}. Bitte
            prüfen oder korrigieren.
          </p>
        ) : null}
      </PanelAbschnitt>

      <PanelAbschnitt titel={korrigiert ? "Ablage (korrigiert)" : "Ablage"}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-text-muted">
            Gesellschaft
            <select
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className={auswahl}
              disabled={erledigt}
            >
              <option value="">– wählen –</option>
              {daten.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-muted">
            Dokumenttyp
            <select
              value={typ}
              onChange={(e) => setTyp(e.target.value as Dokumenttyp)}
              className={auswahl}
              disabled={erledigt}
            >
              {DOKUMENTTYPEN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-muted">
            Bezug
            <select
              value={bezug}
              onChange={(e) => setBezug(e.target.value)}
              className={auswahl}
              disabled={erledigt}
            >
              <option value="">ohne Bezug</option>
              {bezugOptionen.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 space-y-1 border border-hairline p-3 text-sm">
          <div className="text-xs text-text-muted">Zielordner</div>
          <div className="break-all">
            {firmaObj ? (
              <span className="text-text-muted">{firmaObj.shortName}/</span>
            ) : null}
            {ordner}
          </div>
          <div className="pt-2 text-xs text-text-muted">Dateiname</div>
          <div className="break-all font-medium">{name}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <Knopf
            variante="primaer"
            disabled={erledigt || !firma}
            onClick={() =>
              onAblegen(v, firma || null, ordner, name, korrigiert)
            }
          >
            {korrigiert ? "Korrigiert ablegen" : "Vorschlag übernehmen"}
          </Knopf>
          <Knopf variante="geist" onClick={onSchliessen}>
            Später
          </Knopf>
        </div>
      </PanelAbschnitt>
    </DetailPanel>
  );
}
