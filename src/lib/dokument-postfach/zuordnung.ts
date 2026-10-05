/**
 * Serverseitige Gesellschaft-/Objekt-Zuordnung für Dokument-Postfach.
 * Priorisiert Mail/Betreff/Dateiname vor schwachen Scan-Adress-Treffern.
 */
import type { DokumentAnalyseFelder, DokumentFeldQuelle } from "@/lib/dokument-ai";

import {
  findeGesellschaftId,
  findeObjektIdGlobalAusKontext,
  findeObjektIdStaerkste,
  normalisiereSuchtext,
} from "./ablage-kontext";
import type { DokumentPosteingangRow } from "./store";

export type GesellschaftRef = { id: string; name: string; kuerzel: string };
export type ObjektRef = {
  id: string;
  bezeichnung: string;
  gesellschaft_id: string;
  strasse?: string | null;
  ort?: string | null;
};

export type GeschwisterHinweis = {
  gesellschaftId: string;
  gesellschaftName: string;
  objektId: string | null;
  objektBezeichnung: string | null;
  anzahl: number;
  gesellschaftEinig: boolean;
  objektEinig: boolean;
  hinweisText: string;
};

const FIRMEN_OHNE_OBJEKT =
  /gr[uü]ndung|gesellschafter(?:liste|vertrag)|gesellschaftsvertrag|handelsregister|sitzverlegung|notar|beglaubigung|gesellschafterbeschluss|urkunde(?:nverzeichnis)?/i;

const KI_UNSICHER = 0.75;

export function istFirmenKontextOhneObjekt(
  texte: Array<string | null | undefined>,
): boolean {
  return texte.some((t) => Boolean(t && FIRMEN_OHNE_OBJEKT.test(t)));
}

function scoreGesellschaftInText(
  text: string,
  g: GesellschaftRef,
): number {
  const such = normalisiereSuchtext(text);
  if (!such) return 0;
  const gn = normalisiereSuchtext(g.name);
  const kuerzel = normalisiereSuchtext(g.kuerzel);
  let score = 0;

  if (such === gn) return 120;
  if (gn.length >= 6 && such.includes(gn)) {
    score += 50 + Math.min(gn.length, 40);
  } else if (gn.length >= 10) {
    // Teilname ohne Rechtsform
    const kern = gn
      .replace(/\bgmbh\b/g, "")
      .replace(/\bgbr\b/g, "")
      .replace(/\bag\b/g, "")
      .trim();
    if (kern.length >= 6 && such.includes(kern)) {
      score += 40 + Math.min(kern.length, 30);
    }
  }

  if (kuerzel.length >= 2 && new RegExp(`\\b${kuerzel}\\b`).test(such)) {
    score += 35;
  }
  if (/\bmtf\b/.test(such) && /\bmtf\b/.test(gn)) score += 45;
  if (such.includes("immobilien") && gn.includes("immobilien")) score += 20;
  if (such.includes("holding") && gn.includes("holding")) score += 20;

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
 * den Kontext-Treffer bevorzugen (häufig bei Scans/Gesellschafterlisten).
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
    if (!ausWert || ausZitat.score >= ausWertScore + 10 || (feld.konfidenz ?? 0) < KI_UNSICHER) {
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
  objekte: ObjektRef[],
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
  const objCounts = new Map<string, number>();
  for (const s of fertig) {
    if (s.gesellschaft_id) {
      gsCounts.set(s.gesellschaft_id, (gsCounts.get(s.gesellschaft_id) ?? 0) + 1);
    }
    if (s.objekt_id) {
      objCounts.set(s.objekt_id, (objCounts.get(s.objekt_id) ?? 0) + 1);
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

  let bestObj: { id: string; n: number } | null = null;
  for (const [id, n] of objCounts) {
    if (!bestObj || n > bestObj.n) bestObj = { id, n };
  }
  const mitObjekt = fertig.filter((s) => s.objekt_id).length;
  const objektEinig = Boolean(
    bestObj && mitObjekt > 0 && bestObj.n === mitObjekt && bestObj.n >= 1,
  );

  const gsName =
    gesellschaften.find((g) => g.id === bestGs.id)?.name ??
    fertig.find((s) => s.gesellschaft_id === bestGs.id)?.felder?.gesellschaftName
      ?.value ??
    bestGs.id;
  const objName = bestObj
    ? (objekte.find((o) => o.id === bestObj.id)?.bezeichnung ??
      fertig.find((s) => s.objekt_id === bestObj.id)?.felder?.objektBezeichnung
        ?.value ??
      null)
    : null;

  const zeilen = fertig.map((s) => {
    const gs =
      gesellschaften.find((g) => g.id === s.gesellschaft_id)?.name ??
      s.felder?.gesellschaftName?.value ??
      "–";
    const obj =
      objekte.find((o) => o.id === s.objekt_id)?.bezeichnung ??
      s.felder?.objektBezeichnung?.value ??
      null;
    return `- ${s.anhang_name ?? "Anhang"} → ${gs}${obj ? ` / ${obj}` : " (kein Objekt)"}`;
  });

  return {
    gesellschaftId: bestGs.id,
    gesellschaftName: gsName,
    objektId: objektEinig && bestObj ? bestObj.id : null,
    objektBezeichnung: objektEinig ? objName : null,
    anzahl: fertig.length,
    gesellschaftEinig,
    objektEinig,
    hinweisText: [
      "Andere Anhänge derselben E-Mail (bereits analysiert):",
      ...zeilen,
      gesellschaftEinig
        ? `Sichere Gesellschaft laut Geschwister-Anhängen: ${gsName}`
        : `Mehrheitliche Gesellschaft laut Geschwister-Anhängen: ${gsName}`,
      objektEinig && objName
        ? `Sicheres Objekt laut Geschwister-Anhängen: ${objName}`
        : "Objekt unter Geschwister-Anhängen nicht einheitlich — nur übernehmen wenn dieses Dokument unsicher ist und klar zum selben Objekt gehört.",
    ].join("\n"),
  };
}

export type ZuordnungErgebnis = {
  gesellschaftId: string | null;
  objektId: string | null;
  felder: DokumentAnalyseFelder;
  vonGeschwistern: boolean;
};

/**
 * Endgültige Zuordnung nach KI:
 * 1) Mail/Betreff/Dateiname
 * 2) KI-Wert, korrigiert über Zitat
 * 3) Geschwister-Anhänge bei Unsicherheit
 * 4) Objekt-Match nur wenn zur Gesellschaft passend — nie Gesellschaft überschreiben
 */
export function finalisiereZuordnung(input: {
  felder: DokumentAnalyseFelder;
  dokumentTyp: string;
  istScanVision: boolean;
  istTam: boolean;
  betreff?: string | null;
  anhangName?: string | null;
  mailKontext?: string | null;
  modelContext?: string | null;
  geschwister: GeschwisterHinweis | null;
  gesellschaften: GesellschaftRef[];
  objekte: ObjektRef[];
}): ZuordnungErgebnis {
  const felder = { ...input.felder };
  let vonGeschwistern = false;

  if (input.istTam) {
    felder.objektBezeichnung = {
      ...(felder.objektBezeichnung ?? {
        value: null,
        verbatimQuote: null,
        page: null,
        konfidenz: 0,
      }),
      value: null,
      konfidenz: 0,
    };
    return {
      gesellschaftId: null,
      objektId: null,
      felder,
      vonGeschwistern: false,
    };
  }

  const mailTexte = [
    input.betreff,
    input.anhangName,
    input.mailKontext,
    felder.dokumentTitel?.value,
  ];
  const ohneObjekt =
    input.dokumentTyp === "expose" ||
    istFirmenKontextOhneObjekt([
      ...mailTexte,
      felder.dokumentTitel?.value,
      input.modelContext,
    ]);

  const ausMail = findeGesellschaftAusKontextTexten(
    mailTexte,
    input.gesellschaften,
  );
  const kiKorrigiert = korrigiereGesellschaftFeld(
    felder.gesellschaftName ?? {
      value: null,
      verbatimQuote: null,
      page: null,
      konfidenz: 0,
    },
    mailTexte,
    input.gesellschaften,
  );

  let gesellschaftId: string | null = null;
  let gesellschaftName: string | null = null;
  let gsKonfidenz = 0;

  // Mail/Betreff/Dateiname schlägt widersprüchliche KI-Werte.
  if (ausMail && kiKorrigiert.id && ausMail.id !== kiKorrigiert.id) {
    if (ausMail.score >= 40 && (kiKorrigiert.konfidenz < KI_UNSICHER || ausMail.score >= 50)) {
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
  } else if (ausMail) {
    gesellschaftId = ausMail.id;
    gesellschaftName = ausMail.name;
    gsKonfidenz = 0.85;
  }

  // Geschwister übernehmen, wenn unsicher oder leer.
  if (
    input.geschwister &&
    (!gesellschaftId || gsKonfidenz < KI_UNSICHER)
  ) {
    gesellschaftId = input.geschwister.gesellschaftId;
    gesellschaftName = input.geschwister.gesellschaftName;
    gsKonfidenz = Math.max(gsKonfidenz, 0.86);
    vonGeschwistern = true;
  }

  if (gesellschaftName) {
    felder.gesellschaftName = {
      ...(felder.gesellschaftName ?? {
        value: null,
        verbatimQuote: null,
        page: null,
        konfidenz: 0,
      }),
      value: gesellschaftName,
      konfidenz: gsKonfidenz,
    };
  }

  // Objekt: bei Firmengründung o. Ä. bewusst leer lassen.
  let objektId: string | null = null;
  if (!ohneObjekt) {
    const kiObjekt = felder.objektBezeichnung?.value?.trim() || null;
    const kiObjKonf = felder.objektBezeichnung?.konfidenz ?? 0;

    // Nur Adressen/Objektnamen der KI fürs Matching — nie den Gesellschaftsnamen
    // (z. B. „… Industrieparkstraße 2 GbR“ würde sonst das Objekt erzwingen).
    const objektSuchTexte: Array<string | null | undefined> = [];
    if (input.istScanVision) {
      if (kiObjekt && kiObjKonf >= 0.55) objektSuchTexte.push(kiObjekt);
      objektSuchTexte.push(
        felder.zahlungsempfaengerAdresse?.value,
        felder.rechnungsstellerAdresse?.value,
      );
    } else if (input.modelContext) {
      objektSuchTexte.push(input.modelContext);
    }
    objektSuchTexte.push(input.betreff, input.anhangName, input.mailKontext);

    if (gesellschaftId) {
      const inGs = findeObjektIdStaerkste(
        objektSuchTexte.filter(Boolean).join("\n"),
        input.objekte,
        gesellschaftId,
      );
      if (inGs) objektId = inGs;
    }

    if (!objektId) {
      const global = findeObjektIdGlobalAusKontext(
        objektSuchTexte,
        input.objekte,
      );
      // Globaler Objekt-Treffer darf Gesellschaft nur setzen, wenn noch keine da ist.
      if (global) {
        if (!gesellschaftId) {
          gesellschaftId = global.gesellschaftId;
          const gs = input.gesellschaften.find((g) => g.id === global.gesellschaftId);
          if (gs) {
            gesellschaftName = gs.name;
            felder.gesellschaftName = {
              ...(felder.gesellschaftName ?? {
                value: null,
                verbatimQuote: null,
                page: null,
                konfidenz: 0,
              }),
              value: gs.name,
              konfidenz: 0.7,
            };
          }
          objektId = global.objektId;
        } else if (global.gesellschaftId === gesellschaftId) {
          objektId = global.objektId;
        }
        // Widerspruch Objekt↔Gesellschaft: Objekt verwerfen, Gesellschaft behalten.
      }
    }

    // Geschwister-Objekt nur bei Unsicherheit und Einigkeit.
    if (
      !objektId &&
      input.geschwister?.objektEinig &&
      input.geschwister.objektId &&
      input.geschwister.gesellschaftId === gesellschaftId &&
      (kiObjKonf < KI_UNSICHER || !kiObjekt)
    ) {
      objektId = input.geschwister.objektId;
      vonGeschwistern = true;
    }
  }

  const gematchtesObjekt =
    input.objekte.find((o) => o.id === objektId) ?? null;
  if (gematchtesObjekt) {
    // Gesellschaft des Objekts nur übernehmen, wenn wir noch keine haben.
    if (!gesellschaftId) {
      gesellschaftId = gematchtesObjekt.gesellschaft_id;
    }
    if (gesellschaftId === gematchtesObjekt.gesellschaft_id) {
      const gs = input.gesellschaften.find((g) => g.id === gesellschaftId);
      if (gs) {
        felder.gesellschaftName = {
          ...(felder.gesellschaftName ?? {
            value: null,
            verbatimQuote: null,
            page: null,
            konfidenz: 0,
          }),
          value: gs.name,
          konfidenz: Math.max(felder.gesellschaftName?.konfidenz ?? 0, 0.8),
        };
      }
      felder.objektBezeichnung = {
        ...(felder.objektBezeichnung ?? {
          value: null,
          verbatimQuote: null,
          page: null,
          konfidenz: 0,
        }),
        value: gematchtesObjekt.bezeichnung,
        konfidenz: Math.max(felder.objektBezeichnung?.konfidenz ?? 0, 0.8),
      };
    } else {
      // Konflikt: Objekt verwerfen
      objektId = null;
      felder.objektBezeichnung = {
        ...(felder.objektBezeichnung ?? {
          value: null,
          verbatimQuote: null,
          page: null,
          konfidenz: 0,
        }),
        value: null,
        konfidenz: 0,
      };
    }
  } else if (ohneObjekt) {
    felder.objektBezeichnung = {
      ...(felder.objektBezeichnung ?? {
        value: null,
        verbatimQuote: null,
        page: null,
        konfidenz: 0,
      }),
      value: null,
      konfidenz: 0,
    };
  }

  return { gesellschaftId, objektId, felder, vonGeschwistern };
}
