import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  abwesenheitAm,
  schulungsstatus,
  urlaubskonto,
} from "@/lib/personal/berechnen";
import {
  ABWESENHEITSARTEN,
  VERTRAGSARTEN,
  type Mitarbeiter,
} from "@/lib/personal/typen";

import { AkteDialog } from "./AkteDialog";
import {
  AmpelMarke,
  Kasten,
  aktiveMitarbeiter,
  heuteIso,
  tageText,
} from "./bausteine";
import type { PersonalKontext } from "./usePersonal";

/** Nächster Jahrestag eines Datums ab heute (für Geburtstage und Jubiläen). */
function naechsterJahrestag(
  datum: string,
  heute: string,
): { am: string; jahre: number } {
  const jahr = Number(heute.slice(0, 4));
  let am = `${jahr}${datum.slice(4, 10)}`;
  if (am < heute) am = `${jahr + 1}${datum.slice(4, 10)}`;
  return { am, jahre: Number(am.slice(0, 4)) - Number(datum.slice(0, 4)) };
}

function tageBis(heute: string, ziel: string): number {
  return Math.round(
    (Date.parse(`${ziel}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) /
      86_400_000,
  );
}

export function Anstehend({
  mitarbeiter,
  heute,
}: {
  mitarbeiter: Mitarbeiter[];
  heute: string;
}) {
  const termine = useMemo(() => {
    const t: Array<{ am: string; text: string }> = [];
    for (const m of mitarbeiter) {
      if (m.geburtstag) {
        const g = naechsterJahrestag(m.geburtstag, heute);
        t.push({ am: g.am, text: `Geburtstag ${m.name}` });
      }
      if (m.eintrittAm && m.eintrittAm < heute) {
        const j = naechsterJahrestag(m.eintrittAm, heute);
        if (j.jahre > 0 && (j.jahre % 5 === 0 || j.jahre === 1))
          t.push({
            am: j.am,
            text: `${j.jahre} ${j.jahre === 1 ? "Jahr" : "Jahre"} bei Grenz & Co.: ${m.name}`,
          });
      }
      if (m.probezeitBis && m.probezeitBis >= heute)
        t.push({ am: m.probezeitBis, text: `Ende der Probezeit ${m.name}` });
      if (m.austrittAm && m.austrittAm >= heute)
        t.push({ am: m.austrittAm, text: `Letzter Arbeitstag ${m.name}` });
    }
    return t
      .filter((x) => tageBis(heute, x.am) <= 60)
      .sort((a, b) => a.am.localeCompare(b.am));
  }, [mitarbeiter, heute]);
  if (termine.length === 0) return null;
  return (
    <Kasten titel="In den nächsten 60 Tagen">
      <ul className="flex flex-col gap-1 text-sm">
        {termine.map((t) => (
          <li key={t.am + t.text} className="flex gap-3">
            <span className="w-24 shrink-0 tabular-nums text-text-muted">
              {formatDate(t.am)}
            </span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </Kasten>
  );
}

/** Mitarbeiterliste wie in Personio: Klick öffnet das Profil. */
export function TeamTab({ k }: { k: PersonalKontext }) {
  const { daten } = k;
  const heute = heuteIso();
  const [akte, setAkte] = useState<Mitarbeiter | null | "neu">(null);
  const [ehemalige, setEhemalige] = useState(false);
  const [suche, setSuche] = useState("");
  const navigate = useNavigate();
  const q = suche.trim().toLowerCase();
  const liste = (
    ehemalige ? daten.mitarbeiter : aktiveMitarbeiter(daten.mitarbeiter, heute)
  ).filter(
    (m) =>
      !q ||
      [m.name, m.position, m.email].some((t) => t?.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-4">
      <Kasten
        titel={`Mitarbeiter (${liste.length})`}
        aktion={
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="h-8 w-56"
              placeholder="Name, Position, E-Mail"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={ehemalige}
                onChange={(e) => setEhemalige(e.target.checked)}
              />
              Ehemalige zeigen
            </label>
            {daten.verwalten ? (
              <Button size="sm" onClick={() => setAkte("neu")}>
                <Plus className="size-4" /> Mitarbeiter anlegen
              </Button>
            ) : null}
          </div>
        }
      >
        {liste.length === 0 ? (
          <p className="text-sm text-text-muted">
            {daten.verwalten
              ? "Noch keine Mitarbeiter erfasst. Lege die Akten an und verknüpfe sie mit den App-Benutzern."
              : "Für dich ist noch keine Akte angelegt. Die Geschäftsführung kann sie anlegen."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-subtle">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Kontakt</th>
                  <th className="py-2 pr-3 font-medium">Vertrag</th>
                  <th className="py-2 pr-3 font-medium">
                    Resturlaub {daten.jahr}
                  </th>
                  <th className="py-2 pr-3 font-medium">Pflichtschulungen</th>
                  <th className="py-2 font-medium">Heute</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((m) => {
                  const a = abwesenheitAm(m.id, heute, daten.abwesenheiten);
                  const konto = m.vollstaendig
                    ? urlaubskonto(
                        m,
                        daten.abwesenheiten,
                        daten.jahreswerte,
                        daten.jahr,
                      )
                    : null;
                  const st = m.vollstaendig
                    ? schulungsstatus(m, daten.schulungen, heute)
                    : null;
                  const klickbar = m.vollstaendig;
                  return (
                    <tr
                      key={m.id}
                      className={`border-t border-hairline align-top ${klickbar ? "cursor-pointer hover:bg-surface-muted" : ""}`}
                      onClick={
                        klickbar
                          ? () =>
                              void navigate({
                                to: "/personal/$id",
                                params: { id: m.id },
                              })
                          : undefined
                      }
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-heading">
                          {m.name}
                          {m.id === daten.ichId ? (
                            <span className="ml-2 text-xs font-normal text-text-subtle">
                              (du)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-text-subtle">
                          {m.position ?? "–"}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-text-muted">
                        <div>{m.email ?? "–"}</div>
                        <div>{m.telefon ?? ""}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-text-muted">
                        {m.vollstaendig ? (
                          <>
                            <div>
                              {m.vertragsart
                                ? VERTRAGSARTEN[m.vertragsart]
                                : "–"}
                              {m.wochenstunden
                                ? `, ${m.wochenstunden} Std.`
                                : ""}
                            </div>
                            <div>
                              {m.eintrittAm
                                ? `seit ${formatDate(m.eintrittAm)}`
                                : ""}
                            </div>
                            {m.austrittAm ? (
                              <div>bis {formatDate(m.austrittAm)}</div>
                            ) : null}
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {konto ? (
                          <>
                            <div className="font-medium text-heading">
                              {tageText(konto.rest)}
                            </div>
                            <div className="text-xs text-text-subtle">
                              von {konto.anspruch + konto.uebertrag}
                              {konto.beantragt
                                ? `, ${konto.beantragt} beantragt`
                                : ""}
                            </div>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {st ? (
                          <div className="flex flex-wrap gap-1">
                            <AmpelMarke ampel={st.ampel34c}>
                              §34c{" "}
                              {st.ampel34c === "entfaellt"
                                ? "entfällt"
                                : `${st.stunden34c}/20 h`}
                            </AmpelMarke>
                            <AmpelMarke ampel={st.ampelGwg}>GwG</AmpelMarke>
                            <AmpelMarke ampel={st.ampelDatenschutz}>
                              Datenschutz
                            </AmpelMarke>
                          </div>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {a ? (
                          <span
                            className={
                              a.status === "beantragt"
                                ? "text-text-subtle"
                                : "text-heading"
                            }
                          >
                            {a.art ? ABWESENHEITSARTEN[a.art] : "Abwesend"}
                            {a.status === "beantragt" ? " (beantragt)" : ""}
                          </span>
                        ) : (
                          <span className="text-text-subtle">im Büro</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kasten>

      <AkteDialog
        k={k}
        offen={akte !== null}
        mitarbeiter={akte === "neu" ? null : akte}
        onClose={() => setAkte(null)}
      />
    </div>
  );
}
