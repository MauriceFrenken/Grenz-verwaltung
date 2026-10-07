/**
 * Messung Ablage v2 gegen das fiktive Testset (30 Mails).
 * Aufruf: npm run ablage:messen  → Ausgabe in der Konsole und in
 * docs/testdaten/ablage-v2-messbericht.md
 */
import { writeFileSync } from "node:fs";
import { MockKlassifikator } from "@/lib/ai/klassifikation";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import {
  ablageVorschlag,
  AUTO_SCHWELLE,
  kontextAus,
  messen,
  ordnerGruppe,
  quoten,
  type Quote,
} from "@/modules/ablage-v2/logik/ablage";
import { ABLAGE_ERWARTUNGEN, ABLAGE_MAILS } from "@/modules/ablage-v2/testset";

const daten = erzeugeSeed("2026-10-07");
const kontext = kontextAus(daten);
const ki = new MockKlassifikator();
const kurz = (id: string | null) =>
  daten.companies.find((c) => c.id === id)?.shortName ?? null;

const vorschlaege = ABLAGE_MAILS.map((m) =>
  ablageVorschlag(m, kontext, ki.klassifiziereSync(m, kontext)),
);
const ergebnisse = messen(vorschlaege, ABLAGE_ERWARTUNGEN, kurz);

const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)} %`;
const tabelle = (titel: string, q: Quote[]) => {
  const zeilen = [
    `### ${titel}`,
    "",
    "| Gruppe | Mails | Treffer | Quote | automatisch | Fehlablagen |",
    "|---|---:|---:|---:|---:|---:|",
    ...q.map(
      (z) =>
        `| ${z.gruppe} | ${z.anzahl} | ${z.treffer} | ${pct(z.quote).trim()} | ${z.automatisch} | ${z.fehlablagen} |`,
    ),
    "",
  ];
  return zeilen.join("\n");
};

const gesamt = quoten(ergebnisse, () => "Gesamt")[0];
const proGesellschaft = quoten(
  ergebnisse,
  (e) => e.erwartet.gesellschaft ?? "(keine)",
);
const proOrdner = quoten(ergebnisse, (e) => ordnerGruppe(e.erwartet.ordner));
const auto = ergebnisse.filter((e) => !e.vorschlag.pruefen);
const praezision = auto.length
  ? auto.filter((e) => e.treffer).length / auto.length
  : 1;

const details = ergebnisse.map((e) => {
  const v = e.vorschlag;
  return `| ${v.mail.id} | ${e.treffer ? "✓" : "✗"} | ${v.pruefen ? "Prüfliste" : "auto"} | ${pct(v.konfidenz).trim()} | ${kurz(v.gesellschaftId.wert) ?? "–"} | ${v.ordner} | ${e.treffer ? "" : `${e.erwartet.gesellschaft ?? "–"} · ${e.erwartet.ordner}`} |`;
});

const bericht = [
  "# Ablage v2 – Messbericht (Testset, Mock-KI)",
  "",
  `Erzeugt mit \`npm run ablage:messen\`. Klassifikator: ${ki.modell}. Schwelle für automatische Ablage: ${pct(AUTO_SCHWELLE).trim()}.`,
  "Treffer = Gesellschaft **und** Ordner stimmen mit der Erwartung überein. Fehlablage = falsch **und** ohne Prüfung abgelegt.",
  "",
  `- Mails: ${gesamt.anzahl}`,
  `- Trefferquote gesamt: ${pct(gesamt.quote).trim()} (${gesamt.treffer}/${gesamt.anzahl})`,
  `- Automatisch abgelegt: ${auto.length}, davon richtig: ${pct(praezision).trim()}`,
  `- Prüfliste: ${gesamt.anzahl - auto.length}`,
  `- Fehlablagen ohne Prüfung: ${gesamt.fehlablagen}`,
  "",
  tabelle("Trefferquote je Gesellschaft", proGesellschaft),
  tabelle("Trefferquote je Ordner", proOrdner),
  "### Einzelergebnisse",
  "",
  "| Mail | Treffer | Weg | Konfidenz | Gesellschaft | Ordner (Vorschlag) | Erwartet (falls abweichend) |",
  "|---|---|---|---:|---|---|---|",
  ...details,
  "",
].join("\n");

console.log(bericht);
writeFileSync("docs/testdaten/ablage-v2-messbericht.md", bericht);
