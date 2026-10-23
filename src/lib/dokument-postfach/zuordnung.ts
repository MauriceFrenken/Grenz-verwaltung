/**
 * Serverseitige Gesellschaft-Zuordnung für Dokument-Postfach.
 * Priorisiert Mail/Betreff/Dateiname vor schwachen Scan-Treffern.
 */
import type {
  DokumentAnalyseFelder,
  DokumentFeldQuelle,
} from "@/lib/dokument-ai";

import { findeGesellschaftId, normalisiereSuchtext } from "./ablage-kontext";
import type { DokumentPosteingangRow } from "./store";

export type GesellschaftRef = { id: string; name: string; kuerzel: string };

export type GeschwisterHinweis = {
  gesellschaftId: string;
  gesellschaftName: string;
  anzahl: number;
  gesellschaftEinig: boolean;
  hinweisText: string;
};

const KI_UNSICHER = 0.75;

function leeresFeld(): DokumentFeldQuelle {
  return { value: null, verbatimQuote: null, page: null, konfidenz: 0 };
}

function scoreGesellschaftInText(text: string, g: GesellschaftRef): number {
  const such = normalisiereSuchtext(text);
  if (!such) return 0;
  const gn = normalisiereSuchtext(g.name);
  const kuerzel = normalisiereSuchtext(g.kuerzel);
  let score = 0;

  if (such === gn) return 120;
  if (gn.length >= 6 && such.includes(gn)) {
    score += 50 + Math.min(gn.length, 40);
  } else if (gn.length >= 8) {
    // Teilname ohne Rechtsform
    const kern = gn
      .replace(/\b(gmbh|gbr|ag|kg|co|ug)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (kern.length >= 4 && such.includes(kern)) {
      score += 40 + Math.min(kern.length, 30);
    }
  }

  if (kuerzel.length >= 2 && new RegExp(`\\b${kuerzel}\\b`).test(such)) {
    score += 35;
  }

  return score;
}

/** Beste Gesellschaft aus Betreff/Dateiname/Mail/Titel — deterministisch. */
export function findeGesellschaftAusKontextTexten(
  texte: Array<string | null | undefined>,
  gesellschaften: GesellschaftRef[],
): { id: string; name: string; score: number } | null {
  let best: { id: string; name: string; score: number } | null = null;
  for (const text of texte) {
    if (!text?.trim()) continue;
    for (const g of gesellschaften) {
      const score = scoreGesellschaftInText(text, g);
      if (score > 0 && (!best || score > best.score)) {
        best = { id: g.id, name: g.name, score };
      }
    }
  }
  return best && best.score >= 35 ? best : null;
}

/**
 * Wenn KI-Wert und Zitat/Kontext verschiedene Gesellschaften nennen,
 * den Kontext-Treffer bevorzugen (häufig bei Scans).
 */
export function korrigiereGesellschaftFeld(
  feld: DokumentFeldQuelle,
  kontextTexte: Array<string | null | undefined>,
  gesellschaften: GesellschaftRef[],
): { value: string | null; id: string | null; konfidenz: number } {
  const ausWert = findeGesellschaftId(feld.value, gesellschaften);
  const ausZitat = findeGesellschaftAusKontextTexten(
    [feld.verbatimQuote, ...kontextTexte],
    gesellschaften,
  );
  const ausWertGs = ausWert
    ? gesellschaften.find((g) => g.id === ausWert)
    : null;
  const ausWertScore = ausWertGs
    ? scoreGesellschaftInText(feld.value ?? "", ausWertGs)
    : 0;

  if (ausZitat && (!ausWert || ausZitat.id !== ausWert)) {
    // Kontext/Zitat gewinnt, wenn klarer als der KI-Wert
    if (
      !ausWert ||
      ausZitat.score >= ausWertScore + 10 ||
      (feld.konfidenz ?? 0) < KI_UNSICHER
    ) {
      return {
        value: ausZitat.name,
        id: ausZitat.id,
        konfidenz: Math.max(feld.konfidenz ?? 0, 0.85),
      };
    }
  }

  if (ausWert) {
    const name =
      gesellschaften.find((g) => g.id === ausWert)?.name ?? feld.value ?? null;
    return { value: name, id: ausWert, konfidenz: feld.konfidenz ?? 0 };
  }

  if (ausZitat) {
    return {
      value: ausZitat.name,
      id: ausZitat.id,
      konfidenz: Math.max(feld.konfidenz ?? 0, 0.8),
    };
  }

  return { value: feld.value, id: null, konfidenz: feld.konfidenz ?? 0 };
}

export function ermittleGeschwisterHinweis(
  siblings: DokumentPosteingangRow[],
  excludeId: string,
  gesellschaften: GesellschaftRef[],
): GeschwisterHinweis | null {
  const fertig = siblings.filter(
    (s) =>
      s.id !== excludeId &&
      (s.status === "analysiert" ||
        s.status === "abgelegt" ||
        s.status === "gebucht") &&
      Boolean(s.gesellschaft_id),
  );
  if (fertig.length === 0) return null;

  const gsCounts = new Map<string, number>();
  for (const s of fertig) {
    if (s.gesellschaft_id) {
      gsCounts.set(
        s.gesellschaft_id,
        (gsCounts.get(s.gesellschaft_id) ?? 0) + 1,
      );
    }
  }

  let bestGs: { id: string; n: number } | null = null;
  for (const [id, n] of gsCounts) {
    if (!bestGs || n > bestGs.n) bestGs = { id, n };
  }
  if (!bestGs) return null;

  const gesellschaftEinig = bestGs.n === fertig.length;
  // Mehrheit reicht (mindestens 1, bei 2+ >50%)
  if (!gesellschaftEinig && bestGs.n / fertig.length < 0.67) return null;

  const gsName =
    gesellschaften.find((g) => g.id === bestGs.id)?.name ??
    fertig.find((s) => s.gesellschaft_id === bestGs.id)?.felder
      ?.gesellschaftName?.value ??
    bestGs.id;

  const zeilen = fertig.map((s) => {
    const gs =
      gesellschaften.find((g) => g.id === s.gesellschaft_id)?.name ??
      s.felder?.gesellschaftName?.value ??
      "–";
    return `- ${s.anhang_name ?? "Anhang"} → ${gs}`;
  });

  return {
    gesellschaftId: bestGs.id,
    gesellschaftName: gsName,
    anzahl: fertig.length,
    gesellschaftEinig,
    hinweisText: [
      "Andere Anhänge derselben E-Mail (bereits analysiert):",
      ...zeilen,
      gesellschaftEinig
        ? `Sichere Gesellschaft laut Geschwister-Anhängen: ${gsName}`
        : `Mehrheitliche Gesellschaft laut Geschwister-Anhängen: ${gsName}`,
    ].join("\n"),
  };
}

export type ZuordnungErgebnis = {
  gesellschaftId: string | null;
  felder: DokumentAnalyseFelder;
  vonGeschwistern: boolean;
};

/**
 * Endgültige Zuordnung nach KI:
 * 1) Mail/Betreff/Dateiname
 * 2) KI-Wert, korrigiert über Zitat
 * 3) Geschwister-Anhänge bei Unsicherheit
 * 4) Gibt es nur eine Gesellschaft, gehört die Post ihr
 */
export function finalisiereZuordnung(input: {
  felder: DokumentAnalyseFelder;
  betreff?: string | null;
  anhangName?: string | null;
  mailKontext?: string | null;
  geschwister: GeschwisterHinweis | null;
  gesellschaften: GesellschaftRef[];
}): ZuordnungErgebnis {
  const felder = { ...input.felder };
  let vonGeschwistern = false;

  const mailTexte = [
    input.betreff,
    input.anhangName,
    input.mailKontext,
    felder.dokumentTitel?.value,
  ];

  const ausMail = findeGesellschaftAusKontextTexten(
    mailTexte,
    input.gesellschaften,
  );
  const kiKorrigiert = korrigiereGesellschaftFeld(
    felder.gesellschaftName ?? leeresFeld(),
    mailTexte,
    input.gesellschaften,
  );

  let gesellschaftId: string | null = null;
  let gesellschaftName: string | null = null;
  let gsKonfidenz = 0;

  // Mail/Betreff/Dateiname schlägt widersprüchliche KI-Werte.
  if (ausMail && kiKorrigiert.id && ausMail.id !== kiKorrigiert.id) {
    if (
      ausMail.score >= 40 &&
      (kiKorrigiert.konfidenz < KI_UNSICHER || ausMail.score >= 50)
    ) {
      gesellschaftId = ausMail.id;
      gesellschaftName = ausMail.name;
      gsKonfidenz = 0.9;
    } else {
      gesellschaftId = kiKorrigiert.id;
      gesellschaftName = kiKorrigiert.value;
      gsKonfidenz = kiKorrigiert.konfidenz;
    }
  } else if (ausMail && !kiKorrigiert.id) {
    gesellschaftId = ausMail.id;
    gesellschaftName = ausMail.name;
    gsKonfidenz = 0.88;
  } else if (kiKorrigiert.id) {
    gesellschaftId = kiKorrigiert.id;
    gesellschaftName = kiKorrigiert.value;
    gsKonfidenz = kiKorrigiert.konfidenz;
  }

  // Geschwister übernehmen, wenn unsicher oder leer.
  if (input.geschwister && (!gesellschaftId || gsKonfidenz < KI_UNSICHER)) {
    gesellschaftId = input.geschwister.gesellschaftId;
    gesellschaftName = input.geschwister.gesellschaftName;
    gsKonfidenz = Math.max(gsKonfidenz, 0.86);
    vonGeschwistern = true;
  }

  const einzige =
    input.gesellschaften.length === 1 ? input.gesellschaften[0]! : null;
  if (!gesellschaftId && einzige) {
    gesellschaftId = einzige.id;
    gesellschaftName = einzige.name;
    gsKonfidenz = Math.max(gsKonfidenz, 0.8);
  }

  if (gesellschaftName) {
    felder.gesellschaftName = {
      ...(felder.gesellschaftName ?? leeresFeld()),
      value: gesellschaftName,
      konfidenz: gsKonfidenz,
    };
  }

  return { gesellschaftId, felder, vonGeschwistern };
}
