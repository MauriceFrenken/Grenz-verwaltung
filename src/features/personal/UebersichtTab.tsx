import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  abwesenheitAm,
  arbeitstage,
  istArbeitstag,
  schulungsstatus,
  tageZwischen,
  urlaubskonto,
} from "@/lib/personal/berechnen";
import { loeschfaellig } from "@/lib/personal/recruiting";

import { EintragDialog, artLabel } from "./AbwesenheitenTab";
import { Kasten, aktiveMitarbeiter, heuteIso, tageText } from "./bausteine";
import { Anstehend } from "./TeamTab";
import type { PersonalKontext } from "./usePersonal";
import type { RecruitingKontext } from "./useRecruiting";

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Startseite des Personalbereichs nach dem Vorbild der Personio-Startseite:
 * Kennzahlen, „Zu erledigen“ (Anträge, neue Bewerbungen, fällige Schulungen, offene Checklisten),
 * wer abwesend ist und was ansteht.
 */
export function UebersichtTab({
  k,
  r,
}: {
  k: PersonalKontext;
  /** Nur für Personalverantwortliche. */
  r: RecruitingKontext | null;
}) {
  const { daten, ausfuehren } = k;
  const heute = heuteIso();
  const [antrag, setAntrag] = useState(false);
  const aktiv = aktiveMitarbeiter(daten.mitarbeiter, heute);
  const name = (id: string) =>
    daten.mitarbeiter.find((m) => m.id === id)?.name ?? "–";
  const ich = daten.mitarbeiter.find((m) => m.id === daten.ichId) ?? null;

  const antraege = daten.abwesenheiten.filter(
    (a) =>
      a.status === "beantragt" &&
      (daten.verwalten || a.mitarbeiterId === daten.ichId),
  );
  const schulungenFaellig = aktiv
    .filter((m) => m.vollstaendig)
    .map((m) => ({ m, st: schulungsstatus(m, daten.schulungen, heute) }))
    .filter(
      ({ st }) =>
        st.ampel34c === "kritisch" ||
        st.ampelGwg !== "ok" ||
        st.ampelDatenschutz !== "ok",
    );
  const checklisten = daten.mitarbeiter
    .map((m) => {
      const punkte = daten.checkpunkte.filter((p) => p.mitarbeiterId === m.id);
      return {
        m,
        offen: punkte.filter((p) => !p.erledigtAm).length,
        gesamt: punkte.length,
      };
    })
    .filter((c) => c.gesamt > 0 && c.offen > 0);

  const bewerber = r?.daten?.bewerber ?? [];
  const neueBewerbungen = bewerber.filter((b) => b.phase === "eingang").length;
  const loeschungen = bewerber.filter((b) => loeschfaellig(b, heute)).length;
  const recruiting = [
    neueBewerbungen
      ? `${neueBewerbungen} ${neueBewerbungen === 1 ? "neue Bewerbung" : "neue Bewerbungen"} sichten`
      : null,
    loeschungen
      ? `${loeschungen} Bewerberdaten mit abgelaufener Löschfrist`
      : null,
  ].filter((x): x is string => Boolean(x));

  const woche = tageZwischen(heute, plusTage(heute, 13)).filter(istArbeitstag);
  const weg = aktiv
    .map((m) => {
      const tage = woche
        .map((t) => ({ t, a: abwesenheitAm(m.id, t, daten.abwesenheiten) }))
        .filter((x) => x.a && x.a.art !== "homeoffice");
      return { m, erste: tage[0] ?? null, anzahl: tage.length };
    })
    .filter((x) => x.erste)
    .sort((a, b) => a.erste!.t.localeCompare(b.erste!.t));
  const heuteWeg = weg.filter((x) => x.erste!.t === heute).length;

  const konto = ich
    ? urlaubskonto(ich, daten.abwesenheiten, daten.jahreswerte, daten.jahr)
    : null;

  const kacheln = [
    { wert: aktiv.length, text: "Mitarbeiter" },
    { wert: heuteWeg, text: "heute abwesend" },
    {
      wert: antraege.length,
      text: daten.verwalten ? "offene Anträge" : "eigene offene Anträge",
    },
    { wert: schulungenFaellig.length, text: "mit fälligen Schulungen" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kacheln.map((z) => (
          <div key={z.text} className="border border-hairline bg-surface p-4">
            <div className="text-2xl font-light tabular-nums text-heading">
              {z.wert}
            </div>
            <div className="text-xs text-text-muted">{z.text}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Kasten
            titel="Zu erledigen"
            aktion={
              daten.ichId || daten.verwalten ? (
                <Button size="sm" onClick={() => setAntrag(true)}>
                  <Plus className="size-4" />
                  {daten.verwalten
                    ? "Abwesenheit eintragen"
                    : "Urlaub beantragen"}
                </Button>
              ) : null
            }
          >
            {antraege.length === 0 &&
            recruiting.length === 0 &&
            schulungenFaellig.length === 0 &&
            checklisten.length === 0 ? (
              <p className="text-sm text-text-muted">Alles erledigt.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--hairline)] text-sm">
                {antraege.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span>
                      <span className="label-caps mr-2 text-text-subtle">
                        Antrag
                      </span>
                      <span className="font-medium text-heading">
                        {name(a.mitarbeiterId)}
                      </span>{" "}
                      · {artLabel(a)} {formatDate(a.von)} bis{" "}
                      {formatDate(a.bis)} ·{" "}
                      {tageText(arbeitstage(a.von, a.bis, a.halbtag))}
                    </span>
                    {daten.verwalten ? (
                      <span className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void ausfuehren(
                              {
                                typ: "abwesenheit_entscheiden",
                                id: a.id,
                                status: "abgelehnt",
                              },
                              "Abgelehnt.",
                            )
                          }
                        >
                          Ablehnen
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            void ausfuehren(
                              {
                                typ: "abwesenheit_entscheiden",
                                id: a.id,
                                status: "genehmigt",
                              },
                              "Genehmigt.",
                            )
                          }
                        >
                          Genehmigen
                        </Button>
                      </span>
                    ) : (
                      <span className="text-xs text-text-subtle">
                        wartet auf Freigabe
                      </span>
                    )}
                  </li>
                ))}
                {recruiting.map((t) => (
                  <li
                    key={t}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span>
                      <span className="label-caps mr-2 text-text-subtle">
                        Recruiting
                      </span>
                      {t}
                    </span>
                    <Link
                      to="/personal"
                      search={{ tab: "recruiting" }}
                      className="text-xs text-heading underline"
                    >
                      Öffnen
                    </Link>
                  </li>
                ))}
                {schulungenFaellig.map(({ m, st }) => (
                  <li
                    key={`s-${m.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span>
                      <span className="label-caps mr-2 text-text-subtle">
                        Schulung
                      </span>
                      <span className="font-medium text-heading">{m.name}</span>{" "}
                      ·{" "}
                      {[
                        st.ampel34c === "kritisch"
                          ? `§34c: ${st.stunden34c} von 20 Stunden bis ${formatDate(st.zeitraum.bis)}`
                          : null,
                        st.ampelGwg !== "ok" ? "GwG-Unterweisung fällig" : null,
                        st.ampelDatenschutz !== "ok"
                          ? "Datenschutz-Unterweisung fällig"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <Link
                      to="/personal/$id"
                      params={{ id: m.id }}
                      search={{ tab: "schulungen" }}
                      className="text-xs text-heading underline"
                    >
                      Öffnen
                    </Link>
                  </li>
                ))}
                {checklisten.map(({ m, offen, gesamt }) => (
                  <li
                    key={`c-${m.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span>
                      <span className="label-caps mr-2 text-text-subtle">
                        Checkliste
                      </span>
                      <span className="font-medium text-heading">{m.name}</span>{" "}
                      · {offen} von {gesamt} Punkten offen
                    </span>
                    <Link
                      to="/personal/$id"
                      params={{ id: m.id }}
                      search={{ tab: "onboarding" }}
                      className="text-xs text-heading underline"
                    >
                      Öffnen
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Kasten>

          {konto ? (
            <Kasten titel={`Mein Urlaub ${daten.jahr}`}>
              <div className="grid gap-3 text-sm sm:grid-cols-4">
                {[
                  ["Anspruch", konto.anspruch + konto.uebertrag],
                  ["genommen/geplant", konto.genehmigt],
                  ["beantragt", konto.beantragt],
                  ["verfügbar", konto.rest],
                ].map(([l, w]) => (
                  <div key={l as string}>
                    <div className="text-xl font-light tabular-nums text-heading">
                      {(w as number).toLocaleString("de-DE")}
                    </div>
                    <div className="text-xs text-text-muted">{l} (Tage)</div>
                  </div>
                ))}
              </div>
            </Kasten>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Kasten titel="Wer ist abwesend (14 Tage)">
            {weg.length === 0 ? (
              <p className="text-sm text-text-muted">Alle im Büro.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {weg.map(({ m, erste, anzahl }) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="text-heading">{m.name}</span>
                    <span className="text-right text-xs text-text-muted">
                      {artLabel(erste!.a!)}{" "}
                      {erste!.t === heute
                        ? "heute"
                        : `ab ${formatDate(erste!.t)}`}
                      {anzahl > 1 ? `, ${anzahl} Arbeitstage` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Kasten>
          <Anstehend
            mitarbeiter={aktiv.filter((m) => m.vollstaendig)}
            heute={heute}
          />
        </div>
      </div>

      {antrag ? (
        <EintragDialog k={k} offen={antrag} onClose={() => setAntrag(false)} />
      ) : null}
    </div>
  );
}
