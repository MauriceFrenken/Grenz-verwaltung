// Typecheck für den Board-Nachtlauf: `tsc --noEmit` über das ganze Projekt,
// schlägt nur fehl, wenn Fehler außerhalb der bekannten Altdateien auftreten.
// Altfehler stammen aus main (Stand 07.10.2026) und werden hier bewusst nicht angefasst.
import { spawnSync } from "node:child_process";

const ALTDATEIEN = new Set([
  "src/features/dokumente/OrdnerAuswahl.tsx",
  "src/features/transaktionen/expose-import/pdfQuoteHighlight.ts",
  "src/lib/ebics/client.ts",
  "src/lib/microsoft/graph.ts",
  "src/lib/postfach/anhang-text.ts",
  "src/lib/salesforce/api.ts",
  "src/routes/__root.tsx",
]);

const lauf = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], {
  encoding: "utf8",
});
const zeilen = (lauf.stdout + lauf.stderr)
  .split("\n")
  .filter((z) => /error TS\d+/.test(z));
const neu = zeilen.filter((z) => !ALTDATEIEN.has(z.split("(")[0]));
const alt = zeilen.length - neu.length;

if (neu.length > 0) {
  console.error(neu.join("\n"));
  console.error(
    `\n${neu.length} neue Typfehler (${alt} bekannte Altfehler ignoriert).`,
  );
  process.exit(1);
}
console.log(
  `Typecheck ok: keine neuen Fehler (${alt} bekannte Altfehler ignoriert).`,
);
