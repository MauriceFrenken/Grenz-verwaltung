import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ExternalLink,
  GripVertical,
  Hand,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EuroTooltip,
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "@/features/kennzahlen/bausteine";
import {
  VIZ,
  euroKurz,
  monatLabel,
  prozent,
  zelle,
  zelleRechts,
} from "@/features/kennzahlen/hilfen";
import { MandateBereichReiter } from "@/features/mandate/MandateBereichReiter";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatEuro } from "@/lib/format";
import {
  RUHT_AB_TAGEN,
  STANDARD_PROVISION_PROZENT,
  STUFEN,
  prognose,
  stufe as stufeInfo,
  stufeAendern,
  type PipelineDeal,
  type PipelineDto,
  type StufeId,
} from "@/lib/pipeline/berechnen";
import { hatSchriftlichenMaklervertrag } from "@/lib/mandate/maklervertrag";
import { SALESFORCE_LIGHTNING_URL } from "@/lib/salesforce/config";
import { cn } from "@/lib/utils";

/** Für das Diagramm werden die Stufen zu drei Abschnitten zusammengefasst. */
const ABSCHNITTE: Array<{ id: string; label: string; stufen: StufeId[] }> = [
  {
    id: "abschluss",
    label: "Verhandlung & Notar",
    stufen: ["verhandlung", "notar"],
  },
  {
    id: "vermarktung",
    label: "Interessent & Besichtigung",
    stufen: ["interessent", "besichtigung"],
  },
  {
    id: "akquise",
    label: "Erstkontakt bis Beauftragt",
    stufen: ["erstkontakt", "einwertung", "beauftragt"],
  },
];

const prognoseConfig = {
  ist: { label: "Bezahlt (Ist)", color: VIZ[3] },
  abschluss: { label: ABSCHNITTE[0].label, color: VIZ[0] },
  vermarktung: { label: ABSCHNITTE[1].label, color: VIZ[2] },
  akquise: { label: ABSCHNITTE[2].label, color: VIZ[1] },
} satisfies ChartConfig;

const labels = Object.fromEntries(
  Object.entries(prognoseConfig).map(([k, v]) => [k, v.label]),
);

function sfLink(typ: "Opportunity" | "Mandate__c", id: string): string {
  return `${SALESFORCE_LIGHTNING_URL}/lightning/r/${typ}/${id}/view`;
}

function monatLang(monat: string): string {
  return new Date(`${monat}-01T00:00:00`).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

const KAUFPREIS_QUELLE: Record<string, string> = {
  beurkundet: "beurkundeter Kaufpreis",
  deal: "Betrag am Interessenten-Deal",
  exposepreis: "Exposépreis",
  preisvorstellung: "Preisvorstellung Eigentümer",
};

export function PipelineSeite() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [dto, setDto] = useState<PipelineDto | null>(null);
  const [ansicht, setAnsicht] = useState<"board" | "liste">("board");
  const [ohneRuhende, setOhneRuhende] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { pipelineLadenFn } = await import("@/lib/pipeline/server-fn");
        setDto(await pipelineLadenFn({ data: { supabaseAccessToken: token } }));
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Pipeline konnte nicht geladen werden.",
        );
      }
    })();
  }, [token]);

  const verschieben = async (d: PipelineDeal, ziel: StufeId) => {
    if (!dto || d.stufe === ziel) return;
    const vorher = dto;
    setDto(stufeAendern(dto, d.id, ziel));
    try {
      const { pipelineStufeSetzenFn } =
        await import("@/lib/pipeline/server-fn");
      await pipelineStufeSetzenFn({
        data: {
          supabaseAccessToken: token,
          karteId: d.id,
          autoStufe: d.autoStufe,
          stufe: ziel,
        },
      });
      toast.success(
        ziel === d.autoStufe
          ? `${d.objekt}: wieder Stufe aus Salesforce`
          : `${d.objekt} → ${stufeInfo(ziel).label}`,
      );
    } catch (e) {
      setDto(vorher);
      toast.error(
        e instanceof Error ? e.message : "Verschieben fehlgeschlagen.",
      );
    }
  };

  const deals = useMemo(
    () => (dto?.deals ?? []).filter((d) => !ohneRuhende || !d.ruht),
    [dto, ohneRuhende],
  );

  const monate = useMemo(
    () => (dto ? prognose(dto, { ohneRuhende }) : []),
    [dto, ohneRuhende],
  );

  const diagramm = useMemo(
    () =>
      monate.map((m) => ({
        monat: m.monat,
        ist: m.ist || null,
        ...Object.fromEntries(
          ABSCHNITTE.map((a) => [
            a.id,
            a.stufen.reduce((s, id) => s + m.stufen[id], 0) || null,
          ]),
        ),
      })),
    [monate],
  );

  if (!dto) {
    return (
      <>
        <PageHeader
          titel="Mandate & Pipeline"
          reiter={<MandateBereichReiter aktiv="pipeline" />}
        />
        <PageWrapper>
          <Loader2 className="h-4 w-4 animate-spin" />
        </PageWrapper>
      </>
    );
  }

  const heuteMonat = dto.heute.slice(0, 7);
  const jahr = dto.heute.slice(0, 4);
  const gewichtet = deals.reduce(
    (s, d) => s + (d.provision ?? 0) * d.wahrscheinlichkeit,
    0,
  );
  const ungewichtet = deals.reduce((s, d) => s + (d.provision ?? 0), 0);
  // Gesichert ist nur, was ein schriftlicher Maklervertrag abdeckt (ohne bereits gewonnene).
  const mitVertrag = deals.filter(
    (d) => hatSchriftlichenMaklervertrag(d.art) && d.stufe !== "notar",
  );
  const provisionVertrag = mitVertrag.reduce(
    (s, d) => s + (d.provision ?? 0),
    0,
  );
  const zukunft = monate.filter((m) => m.monat >= heuteMonat);
  const naechste3 = zukunft.slice(0, 3).reduce((s, m) => s + m.gewichtet, 0);
  const restjahr = zukunft
    .filter((m) => m.monat.startsWith(jahr))
    .reduce((s, m) => s + m.gewichtet, 0);
  const istJahr = dto.abschluesse
    .filter((a) => a.datum.startsWith(jahr))
    .reduce((s, a) => s + a.provision, 0);
  const ohnePreis = deals.filter((d) => d.provision == null).length;
  const ruhend = (dto.deals ?? []).filter((d) => d.ruht).length;

  return (
    <>
      <PageHeader
        titel="Mandate & Pipeline"
        reiter={<MandateBereichReiter aktiv="pipeline" />}
        beschreibung="Alle laufenden Objekte vom Erstkontakt bis zum Notartermin, mit erwarteter Provision je Monat. Daten aus Salesforce (Mandate und Interessenten-Deals)."
      />
      <PageWrapper>
        <KachelReihe>
          <Kachel
            titel="Provision mit Maklervertrag"
            wert={euroKurz(provisionVertrag)}
            unterzeile={`${mitVertrag.length} ${mitVertrag.length === 1 ? "Objekt" : "Objekte"} mit schriftlichem Maklervertrag, netto, ungewichtet`}
            nebenwert={`Ganze Pipeline: gewichtet ${euroKurz(gewichtet)}, ungewichtet ${euroKurz(ungewichtet)} (${deals.length} Objekte inkl. lose Beauftragung und Off-Market)`}
          />
          <Kachel
            titel="Erwartet nächste 3 Monate"
            wert={euroKurz(naechste3)}
            unterzeile={`${monatLabel(heuteMonat, true)} bis ${monatLabel(zukunft[2]?.monat ?? heuteMonat, true)}, gewichtet`}
          />
          <Kachel
            titel={`Erwartet bis Ende ${jahr}`}
            wert={euroKurz(restjahr)}
            unterzeile="gewichtet nach Stufe"
          />
          <Kachel
            titel={`Bezahlt ${jahr}`}
            wert={euroKurz(istJahr)}
            unterzeile={`${dto.abschluesse.filter((a) => a.datum.startsWith(jahr)).length} Abschlüsse (Invoice Paid)`}
            ton={istJahr > 0 ? "gut" : undefined}
          />
        </KachelReihe>

        <Karte
          titel="Provisionsprognose je Monat"
          hinweis="Links bezahlte Provisionen, rechts die erwartete Provision im Monat des Notartermins, gewichtet mit der Wahrscheinlichkeit der Stufe. Termin aus dem Salesforce-Schlusstermin, sonst geschätzt aus der Stufe."
        >
          <ChartContainer config={prognoseConfig} className="h-72 w-full">
            <BarChart data={diagramm} margin={{ top: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="monat"
                tickLine={false}
                axisLine={false}
                tickFormatter={(m: string) => monatLabel(m, true)}
              />
              <YAxis
                tickFormatter={euroKurz}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <ChartTooltip
                content={<EuroTooltip labels={labels} />}
                labelFormatter={(m: string) => monatLang(m)}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="ist" stackId="p" fill="var(--color-ist)" />
              {[...ABSCHNITTE].reverse().map((a, i) => (
                <Bar
                  key={a.id}
                  dataKey={a.id}
                  stackId="p"
                  fill={`var(--color-${a.id})`}
                  radius={i === ABSCHNITTE.length - 1 ? [1, 1, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </Karte>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={ansicht === "board" ? "default" : "outline"}
            onClick={() => setAnsicht("board")}
          >
            Stufen
          </Button>
          <Button
            size="sm"
            variant={ansicht === "liste" ? "default" : "outline"}
            onClick={() => setAnsicht("liste")}
          >
            Nach Notartermin
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm text-text-muted">
            <Checkbox
              checked={ohneRuhende}
              onCheckedChange={(v) => setOhneRuhende(v === true)}
            />
            Ruhende ausblenden ({ruhend}, ohne Aktivität seit {RUHT_AB_TAGEN}{" "}
            Tagen)
          </label>
        </div>

        {deals.length === 0 ? (
          <p className="text-sm text-text-muted">
            Keine laufenden Objekte. Falls das nicht stimmt: Einstellungen ›
            Integrationen › Salesforce-Sync ausführen.
          </p>
        ) : ansicht === "board" ? (
          <Board
            deals={deals}
            verschiebbar={dto.manuellMoeglich === true}
            onVerschieben={verschieben}
          />
        ) : (
          <Liste deals={deals} />
        )}
        {ohnePreis > 0 ? (
          <p className="text-xs text-text-muted">
            {ohnePreis} Objekte ohne Preis in Salesforce fließen nicht in die
            Prognose ein. Fehlt am Mandat der Provisionssatz, rechnet die
            Pipeline mit {STANDARD_PROVISION_PROZENT} %.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Karte
            titel="Bezahlte Provisionen"
            hinweis="Interessenten-Deals mit Phase „Invoice Paid“, Datum = Schlusstermin."
          >
            <Tabelle
              kopf={[
                { titel: "Deal" },
                { titel: "Datum" },
                { titel: "Kaufpreis", rechts: true },
                { titel: "Provision", rechts: true },
              ]}
              leer={dto.abschluesse.length ? null : "Noch keine Abschlüsse."}
            >
              {dto.abschluesse.map((a) => (
                <tr key={a.sfId}>
                  <td className={cn(zelle, "max-w-72 truncate")} title={a.name}>
                    <a
                      href={sfLink("Opportunity", a.sfId)}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {a.objekt ?? a.name}
                    </a>
                  </td>
                  <td className={zelle}>{formatDate(a.datum)}</td>
                  <td className={zelleRechts}>{euroKurz(a.kaufpreis ?? 0)}</td>
                  <td className={zelleRechts}>{formatEuro(a.provision)}</td>
                </tr>
              ))}
            </Tabelle>
          </Karte>
          <Karte
            titel="Stufen und Gewichtung"
            hinweis="Je Objekt zählt der am weitesten fortgeschrittene offene Interessent, sonst die Phase des Mandats."
          >
            <Tabelle
              kopf={[
                { titel: "Stufe" },
                { titel: "Bedeutung" },
                { titel: "Wahrscheinlichkeit", rechts: true },
                { titel: "Notar in", rechts: true },
              ]}
            >
              {STUFEN.map((s) => (
                <tr key={s.id}>
                  <td className={zelle}>{s.label}</td>
                  <td
                    className={cn(zelle, "whitespace-normal text-text-muted")}
                  >
                    {s.beschreibung}
                  </td>
                  <td className={zelleRechts}>
                    {prozent(s.wahrscheinlichkeit * 100)}
                  </td>
                  <td className={zelleRechts}>ca. {s.restMonate} Mon.</td>
                </tr>
              ))}
            </Tabelle>
          </Karte>
        </div>

        {dto.datenhinweise.length ? (
          <Karte
            titel="Datenpflege in Salesforce"
            hinweis="Diese Mandate fehlen in der Pipeline oder stehen falsch, bis sie in Salesforce korrigiert sind."
          >
            <ul className="flex flex-col gap-1 text-sm">
              {dto.datenhinweise.map((h) => (
                <li key={h.sfId} className="flex gap-2">
                  <a
                    href={sfLink("Mandate__c", h.sfId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-heading hover:underline"
                  >
                    {h.name}
                  </a>
                  <span className="text-text-muted">{h.text}</span>
                </li>
              ))}
            </ul>
          </Karte>
        ) : null}
      </PageWrapper>
    </>
  );
}

function Board({
  deals,
  verschiebbar,
  onVerschieben,
}: {
  deals: PipelineDeal[];
  verschiebbar: boolean;
  onVerschieben: (d: PipelineDeal, ziel: StufeId) => void;
}) {
  const [gezogen, setGezogen] = useState<PipelineDeal | null>(null);
  const [ueber, setUeber] = useState<StufeId | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted">
        {verschiebbar
          ? "Karten lassen sich per Drag & Drop in eine andere Stufe ziehen. Das gilt nur in der App und ist als „manuell“ markiert; ändert Salesforce später die Stufe, gilt wieder Salesforce."
          : "Verschieben ist noch nicht eingerichtet (Datenbank-Migration pipeline_stufen fehlt). Die Stufen kommen automatisch aus Salesforce."}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STUFEN.map((s) => {
          const liste = deals.filter((d) => d.stufe === s.id);
          const summe = liste.reduce(
            (x, d) => x + (d.provision ?? 0) * d.wahrscheinlichkeit,
            0,
          );
          return (
            <section
              key={s.id}
              className={cn(
                "flex w-64 shrink-0 flex-col gap-2 border border-hairline bg-surface-muted p-2 transition-colors",
                ueber === s.id &&
                  gezogen?.stufe !== s.id &&
                  "border-[var(--gc-hellblau)] bg-[var(--gc-hellblau)]/10",
              )}
              onDragOver={(e) => {
                if (!gezogen) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setUeber(s.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setUeber(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (gezogen) onVerschieben(gezogen, s.id);
                setGezogen(null);
                setUeber(null);
              }}
            >
              <header className="px-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-heading">
                    {s.label}
                  </h3>
                  <span className="text-xs tabular-nums text-text-muted">
                    {liste.length}
                  </span>
                </div>
                <p className="text-xs tabular-nums text-text-muted">
                  {euroKurz(summe)} gewichtet ·{" "}
                  {prozent(s.wahrscheinlichkeit * 100)}
                </p>
              </header>
              {liste.map((d) => (
                <DealKarte
                  key={d.id}
                  d={d}
                  verschiebbar={verschiebbar}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", d.id);
                    setGezogen(d);
                  }}
                  onDragEnd={() => {
                    setGezogen(null);
                    setUeber(null);
                  }}
                  onZuruecksetzen={() => onVerschieben(d, d.autoStufe)}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ObjektTitel({ d }: { d: PipelineDeal }) {
  return d.mandatSfId ? (
    <Link
      to="/mandate/$sfId"
      params={{ sfId: d.mandatSfId }}
      draggable={false}
      className="font-medium text-heading hover:underline"
    >
      {d.objekt}
    </Link>
  ) : (
    <a
      href={sfLink("Opportunity", d.id)}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      className="font-medium text-heading hover:underline"
    >
      {d.objekt}
    </a>
  );
}

function ProvisionText({ d }: { d: PipelineDeal }) {
  if (d.provisionsfrei) return <>provisionsfrei</>;
  if (d.provision == null)
    return <span className="text-warn">Preis fehlt</span>;
  return <>{formatEuro(d.provision)}</>;
}

function DealKarte({
  d,
  verschiebbar,
  onDragStart,
  onDragEnd,
  onZuruecksetzen,
}: {
  d: PipelineDeal;
  verschiebbar: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onZuruecksetzen: () => void;
}) {
  return (
    <article
      draggable={verschiebbar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col gap-1 border border-hairline bg-surface p-2 text-sm",
        verschiebbar && "cursor-grab active:cursor-grabbing",
        d.ruht && "opacity-70",
        d.manuell && "border-l-[3px] border-l-[var(--gc-hellblau)]",
      )}
    >
      <div className="flex items-start gap-1">
        {verschiebbar ? (
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-subtle" />
        ) : null}
        <ObjektTitel d={d} />
      </div>
      {d.manuell ? (
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span
            className="flex items-center gap-1"
            title={`Von Hand verschoben${d.manuell.gesetztVon ? ` von ${d.manuell.gesetztVon}` : ""} am ${formatDate(d.manuell.gesetztAm)}`}
          >
            <Hand className="h-3 w-3" />
            manuell · Salesforce: {stufeInfo(d.autoStufe).label}
          </span>
          <button
            type="button"
            onClick={onZuruecksetzen}
            className="flex items-center gap-0.5 hover:text-heading"
            title="Stufe wieder aus Salesforce übernehmen"
          >
            <RotateCcw className="h-3 w-3" />
            zurück
          </button>
        </div>
      ) : null}
      <span className="text-xs text-text-muted">
        {[d.ort, d.mandat, d.art].filter(Boolean).join(" · ")}
      </span>
      {d.interessent ? (
        <a
          href={sfLink("Opportunity", d.interessent.sfId)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs hover:underline"
          title={`Phase in Salesforce: ${d.interessent.phase ?? "ohne Phase"}`}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {d.interessent.name.replace(/^Opp\.\s*/, "")}
          </span>
          {d.weitereInteressenten ? (
            <span className="shrink-0 text-text-muted">
              +{d.weitereInteressenten}
            </span>
          ) : null}
        </a>
      ) : null}
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span
          title={
            d.kaufpreis != null
              ? `${formatEuro(d.kaufpreis)} (${KAUFPREIS_QUELLE[d.kaufpreisQuelle ?? ""] ?? ""}) × ${d.provisionProzent} %`
              : undefined
          }
        >
          <ProvisionText d={d} />
        </span>
        <span
          className="text-xs text-text-muted"
          title={
            d.notarQuelle === "salesforce"
              ? "Schlusstermin aus Salesforce"
              : "Geschätzt aus der Stufe"
          }
        >
          {d.notarQuelle === "geschaetzt" ? "ca. " : ""}
          {monatLabel(d.notarMonat, true)}
        </span>
      </div>
      {d.hinweise.length ? (
        <ul className="flex flex-col gap-0.5 text-xs text-warn">
          {d.hinweise.map((h) => (
            <li key={h} className="flex gap-1">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function Liste({ deals }: { deals: PipelineDeal[] }) {
  const sortiert = [...deals].sort(
    (a, b) =>
      a.notarMonat.localeCompare(b.notarMonat) ||
      (b.provision ?? 0) - (a.provision ?? 0),
  );
  return (
    <div className="border border-hairline bg-surface p-2">
      <Tabelle
        kopf={[
          { titel: "Notartermin" },
          { titel: "Objekt" },
          { titel: "Stufe" },
          { titel: "Interessent" },
          { titel: "Kaufpreis", rechts: true },
          { titel: "Provision", rechts: true },
          { titel: "Gewichtet", rechts: true },
          { titel: "Letzte Aktivität" },
        ]}
      >
        {sortiert.map((d) => (
          <tr key={d.id} className={cn(d.ruht && "opacity-70")}>
            <td className={zelle}>
              {d.notarQuelle === "geschaetzt" ? "ca. " : ""}
              {monatLabel(d.notarMonat, true)}
            </td>
            <td className={zelle}>
              <ObjektTitel d={d} />
              {d.ort ? (
                <span className="text-text-muted">, {d.ort}</span>
              ) : null}
              {d.hinweise.length ? (
                <AlertTriangle
                  className="ml-1 inline h-3 w-3 text-warn"
                  aria-label={d.hinweise.join(" · ")}
                >
                  <title>{d.hinweise.join(" · ")}</title>
                </AlertTriangle>
              ) : null}
            </td>
            <td className={zelle} title={`Salesforce: ${d.sfPhase}`}>
              {STUFEN.find((s) => s.id === d.stufe)?.label}
              {d.manuell ? (
                <span className="text-text-muted"> (manuell)</span>
              ) : null}
            </td>
            <td className={cn(zelle, "max-w-56 truncate")}>
              {d.interessent
                ? d.interessent.name.replace(/^Opp\.\s*/, "")
                : "–"}
            </td>
            <td className={zelleRechts}>
              {d.kaufpreis != null ? euroKurz(d.kaufpreis) : "–"}
            </td>
            <td className={zelleRechts}>
              <ProvisionText d={d} />
            </td>
            <td className={zelleRechts}>
              {d.provision != null
                ? formatEuro(Math.round(d.provision * d.wahrscheinlichkeit))
                : "–"}
            </td>
            <td className={zelle}>
              {d.letzteAktivitaet ? formatDate(d.letzteAktivitaet) : "keine"}
            </td>
          </tr>
        ))}
      </Tabelle>
    </div>
  );
}
