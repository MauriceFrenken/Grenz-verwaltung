import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatEuro } from "@/lib/format";
import {
  SOLL_STUNDEN_34C,
  abwesenheitAm,
  arbeitstage,
  schulungsstatus,
  urlaubskonto,
} from "@/lib/personal/berechnen";
import {
  SCHULUNGSARTEN,
  VERTRAGSARTEN,
  type Mitarbeiter,
} from "@/lib/personal/typen";

import { EintragDialog, artLabel } from "./AbwesenheitenTab";
import { AkteDialog } from "./AkteDialog";
import { AmpelMarke, Kasten, heuteIso, tageText } from "./bausteine";
import { Checkliste } from "./ChecklistenTab";
import { LeistungTab } from "./LeistungTab";
import { NeuDialog } from "./SchulungenTab";
import { usePersonal, type PersonalKontext } from "./usePersonal";

export type ProfilReiter =
  | "persoenlich"
  | "vertrag"
  | "abwesenheiten"
  | "schulungen"
  | "onboarding"
  | "leistung";
export const PROFIL_REITER: ProfilReiter[] = [
  "persoenlich",
  "vertrag",
  "abwesenheiten",
  "schulungen",
  "onboarding",
  "leistung",
];

function Angaben({ zeilen }: { zeilen: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {zeilen.map(([l, w]) => (
        <div key={l} className="flex flex-col gap-0.5">
          <dt className="text-xs text-text-subtle">{l}</dt>
          <dd className="text-heading">{w || "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Abwesenheiten({ k, m }: { k: PersonalKontext; m: Mitarbeiter }) {
  const { daten, ausfuehren } = k;
  const [neu, setNeu] = useState(false);
  const konto = urlaubskonto(
    m,
    daten.abwesenheiten,
    daten.jahreswerte,
    daten.jahr,
  );
  const eintraege = daten.abwesenheiten
    .filter((a) => a.mitarbeiterId === m.id)
    .sort((a, b) => b.von.localeCompare(a.von));
  const darf = daten.verwalten || m.id === daten.ichId;
  return (
    <div className="flex flex-col gap-4">
      <Kasten titel={`Urlaubskonto ${daten.jahr}`}>
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          {(
            [
              ["Anspruch", konto.anspruch],
              [`Rest aus ${daten.jahr - 1}`, konto.uebertrag],
              ["genommen/geplant", konto.genehmigt],
              ["beantragt", konto.beantragt],
              ["verfügbar", konto.rest],
            ] as Array<[string, number]>
          ).map(([l, w]) => (
            <div key={l}>
              <div className="text-xl font-light tabular-nums text-heading">
                {w.toLocaleString("de-DE")}
              </div>
              <div className="text-xs text-text-muted">{l}</div>
            </div>
          ))}
        </div>
      </Kasten>
      <Kasten
        titel="Abwesenheiten"
        aktion={
          darf ? (
            <Button size="sm" onClick={() => setNeu(true)}>
              <Plus className="size-4" />
              {daten.verwalten
                ? "Abwesenheit eintragen"
                : "Urlaub beantragen / melden"}
            </Button>
          ) : null
        }
      >
        {eintraege.length === 0 ? (
          <p className="text-sm text-text-muted">Keine Einträge.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th className="py-2 pr-3 font-medium">Art</th>
                <th className="py-2 pr-3 font-medium">Zeitraum</th>
                <th className="py-2 pr-3 text-right font-medium">
                  Arbeitstage
                </th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {eintraege.map((a) => (
                <tr key={a.id} className="border-t border-hairline">
                  <td className="py-2 pr-3">
                    {artLabel(a)}
                    {a.notiz ? (
                      <div className="text-xs text-text-subtle">{a.notiz}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatDate(a.von)}
                    {a.bis !== a.von
                      ? ` bis ${formatDate(a.bis)}`
                      : a.halbtag
                        ? " (halber Tag)"
                        : ""}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {arbeitstage(a.von, a.bis, a.halbtag).toLocaleString(
                      "de-DE",
                    )}
                  </td>
                  <td className="py-2 pr-3">{a.status}</td>
                  <td className="py-2 text-right">
                    {daten.verwalten ||
                    a.status === "beantragt" ||
                    (a.art !== "urlaub" && a.art !== "sonderurlaub") ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Eintrag löschen"
                        onClick={() =>
                          void ausfuehren(
                            { typ: "abwesenheit_loeschen", id: a.id },
                            "Eintrag gelöscht.",
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Kasten>
      {neu ? (
        <EintragDialog
          k={k}
          offen={neu}
          fest={m.id}
          onClose={() => setNeu(false)}
        />
      ) : null}
    </div>
  );
}

function Schulungen({ k, m }: { k: PersonalKontext; m: Mitarbeiter }) {
  const { daten, ausfuehren } = k;
  const [neu, setNeu] = useState(false);
  const st = schulungsstatus(m, daten.schulungen, heuteIso());
  const liste = daten.schulungen.filter((s) => s.mitarbeiterId === m.id);
  return (
    <div className="flex flex-col gap-4">
      <Kasten titel="Pflichtschulungen">
        <div className="flex flex-wrap gap-2">
          <AmpelMarke ampel={st.ampel34c}>
            §34c {formatDate(st.zeitraum.von)}–{formatDate(st.zeitraum.bis)}:{" "}
            {st.ampel34c === "entfaellt"
              ? "keine Pflicht"
              : `${st.stunden34c.toLocaleString("de-DE")} von ${SOLL_STUNDEN_34C} h`}
          </AmpelMarke>
          <AmpelMarke ampel={st.ampelGwg}>
            GwG: {st.letzteGwg ? formatDate(st.letzteGwg) : "fehlt"}
          </AmpelMarke>
          <AmpelMarke ampel={st.ampelDatenschutz}>
            Datenschutz:{" "}
            {st.letzteDatenschutz ? formatDate(st.letzteDatenschutz) : "fehlt"}
          </AmpelMarke>
        </div>
      </Kasten>
      <Kasten
        titel="Nachweise"
        aktion={
          <Button size="sm" onClick={() => setNeu(true)}>
            <Plus className="size-4" /> Schulung erfassen
          </Button>
        }
      >
        {liste.length === 0 ? (
          <p className="text-sm text-text-muted">
            Noch keine Schulungen erfasst.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {liste.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-hairline first:border-t-0"
                >
                  <td className="w-28 py-2 pr-3 tabular-nums">
                    {formatDate(s.datum)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-heading">{s.titel}</div>
                    <div className="text-xs text-text-subtle">
                      {SCHULUNGSARTEN[s.art]}
                      {s.anbieter ? ` · ${s.anbieter}` : ""}
                      {s.stunden
                        ? ` · ${s.stunden.toLocaleString("de-DE")} h`
                        : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {s.nachweisUrl ? (
                      <Button size="icon" variant="ghost" asChild>
                        <a
                          href={s.nachweisUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Nachweis öffnen"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Schulung löschen"
                      onClick={() =>
                        void ausfuehren(
                          { typ: "schulung_loeschen", id: s.id },
                          "Schulung gelöscht.",
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Kasten>
      {neu ? (
        <NeuDialog
          k={k}
          offen={neu}
          fest={m.id}
          onClose={() => setNeu(false)}
        />
      ) : null}
    </div>
  );
}

/** Mitarbeiterprofil nach dem Vorbild von Personio: Kopf mit Status, darunter Reiter. */
export function ProfilPage({
  id,
  reiter,
}: {
  id: string;
  reiter: ProfilReiter;
}) {
  const navigate = useNavigate();
  const [jahr] = useState(new Date().getFullYear());
  const p = usePersonal(jahr);
  const [bearbeiten, setBearbeiten] = useState(false);
  const heute = heuteIso();

  if (p.fehler)
    return (
      <PageWrapper>
        <p className="text-sm text-danger">{p.fehler}</p>
      </PageWrapper>
    );
  if (!p.daten)
    return (
      <PageWrapper>
        <Loader2 className="size-4 animate-spin" />
      </PageWrapper>
    );
  const k = p as PersonalKontext;
  const m = k.daten.mitarbeiter.find((x) => x.id === id);
  if (!m || !m.vollstaendig)
    return (
      <PageWrapper>
        <p className="text-sm text-text-muted">
          {m
            ? "Diese Akte kann nur die Geschäftsführung öffnen."
            : "Mitarbeiter nicht gefunden."}{" "}
          <Link
            to="/personal"
            search={{ tab: "mitarbeiter" }}
            className="text-heading underline"
          >
            Zur Mitarbeiterliste
          </Link>
        </p>
      </PageWrapper>
    );

  const a = abwesenheitAm(m.id, heute, k.daten.abwesenheiten);
  const konto = urlaubskonto(
    m,
    k.daten.abwesenheiten,
    k.daten.jahreswerte,
    k.daten.jahr,
  );
  const jw = k.daten.jahreswerte.find(
    (j) => j.mitarbeiterId === m.id && j.jahr === k.daten.jahr,
  );
  const status =
    m.austrittAm && m.austrittAm < heute
      ? "ausgeschieden"
      : m.eintrittAm && m.eintrittAm > heute
        ? `startet am ${formatDate(m.eintrittAm)}`
        : m.probezeitBis && m.probezeitBis >= heute
          ? `in Probezeit bis ${formatDate(m.probezeitBis)}`
          : "aktiv";
  const sfName =
    k.daten.sfNutzer.find((s) => s.id === m.sfUserId)?.name ?? m.sfUserId;
  const benutzer = k.daten.benutzer.find((b) => b.id === m.profilId);

  return (
    <>
      <PageHeader
        titel={m.name}
        beschreibung={[
          m.position,
          m.vertragsart ? VERTRAGSARTEN[m.vertragsart] : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to="/personal"
              search={{ tab: "mitarbeiter" }}
              className="inline-flex items-center gap-1 hover:text-heading"
            >
              <ArrowLeft className="size-3" /> Mitarbeiter
            </Link>
            <span>Status: {status}</span>
            <span>Heute: {a ? artLabel(a) : "im Büro"}</span>
            <span>Resturlaub: {tageText(konto.rest)}</span>
          </span>
        }
        aktionen={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBearbeiten(true)}
          >
            <Pencil className="size-4" /> Bearbeiten
          </Button>
        }
      />
      <PageWrapper>
        <Tabs
          value={reiter}
          onValueChange={(v) =>
            void navigate({
              to: "/personal/$id",
              params: { id },
              search: { tab: v as ProfilReiter },
              replace: true,
            })
          }
        >
          <TabsList className="flex-wrap">
            <TabsTrigger value="persoenlich">Persönliche Daten</TabsTrigger>
            <TabsTrigger value="vertrag">Vertrag</TabsTrigger>
            <TabsTrigger value="abwesenheiten">Abwesenheiten</TabsTrigger>
            <TabsTrigger value="schulungen">Schulungen</TabsTrigger>
            <TabsTrigger value="onboarding">On- & Offboarding</TabsTrigger>
            <TabsTrigger value="leistung">Leistung</TabsTrigger>
          </TabsList>
          <TabsContent value="persoenlich" className="mt-4">
            <Kasten titel="Persönliche Daten">
              <Angaben
                zeilen={[
                  ["E-Mail", m.email],
                  ["Telefon", m.telefon],
                  [
                    "Geburtstag",
                    m.geburtstag ? formatDate(m.geburtstag) : null,
                  ],
                  ["Notfallkontakt", m.notfallkontakt],
                  [
                    "App-Benutzer",
                    benutzer
                      ? `${benutzer.name} (${benutzer.email})`
                      : m.profilId
                        ? "verknüpft"
                        : "ohne App-Zugang",
                  ],
                  ["Salesforce-Benutzer", sfName ?? "nicht verknüpft"],
                ]}
              />
            </Kasten>
          </TabsContent>
          <TabsContent value="vertrag" className="mt-4">
            <Kasten titel="Vertrag">
              <Angaben
                zeilen={[
                  ["Position", m.position],
                  [
                    "Vertragsart",
                    m.vertragsart ? VERTRAGSARTEN[m.vertragsart] : null,
                  ],
                  ["Wochenstunden", m.wochenstunden?.toLocaleString("de-DE")],
                  [
                    "Urlaubstage pro Jahr",
                    m.urlaubstageJahr?.toLocaleString("de-DE"),
                  ],
                  ["Eintritt", m.eintrittAm ? formatDate(m.eintrittAm) : null],
                  [
                    "Probezeit bis",
                    m.probezeitBis ? formatDate(m.probezeitBis) : null,
                  ],
                  ["Austritt", m.austrittAm ? formatDate(m.austrittAm) : null],
                  [
                    `Provisionsziel ${k.daten.jahr}`,
                    jw?.provisionszielEur
                      ? formatEuro(jw.provisionszielEur)
                      : null,
                  ],
                  [
                    "Weiterbildungspflicht §34c",
                    m.weiterbildungspflichtig ? "ja" : "nein",
                  ],
                  [
                    "Personalakte",
                    m.personalakteUrl ? (
                      <a
                        href={m.personalakteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        OneDrive öffnen <ExternalLink className="size-3" />
                      </a>
                    ) : null,
                  ],
                ]}
              />
              {k.daten.verwalten && m.notizen ? (
                <p className="whitespace-pre-line border-t border-hairline pt-3 text-sm text-text-muted">
                  {m.notizen}
                </p>
              ) : null}
            </Kasten>
          </TabsContent>
          <TabsContent value="abwesenheiten" className="mt-4">
            <Abwesenheiten k={k} m={m} />
          </TabsContent>
          <TabsContent value="schulungen" className="mt-4">
            <Schulungen k={k} m={m} />
          </TabsContent>
          <TabsContent value="onboarding" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Checkliste k={k} m={m} typ="onboarding" />
              <Checkliste k={k} m={m} typ="offboarding" />
            </div>
          </TabsContent>
          <TabsContent value="leistung" className="mt-4">
            {m.sfUserId ? (
              <LeistungTab k={k} nurId={m.id} />
            ) : (
              <p className="text-sm text-text-muted">
                Nicht mit Salesforce verknüpft. Unter „Bearbeiten“ den
                Salesforce-Benutzer wählen.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </PageWrapper>
      <AkteDialog
        k={k}
        offen={bearbeiten}
        mitarbeiter={m}
        onClose={() => setBearbeiten(false)}
      />
    </>
  );
}
