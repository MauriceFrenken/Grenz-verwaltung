/**
 * Kleine Helfer, um die Grenz-Vorlagen (PPTX/XLSX aus PowerPoint und Excel) direkt im XML zu füllen.
 * Die Vorlagen bleiben dadurch unverändert im Design (Master, Schriften, Logo, Formeln);
 * ersetzt werden nur Texte, Tabellenzellen, Bilder und Zellwerte. Reine String-Funktionen, testbar.
 */

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type Bereich = { start: number; ende: number; xml: string };

/** Alle Elemente eines Tags, die nicht ineinander verschachtelt sind (a:tr, a:tc, p:sp …). */
export function elemente(
  xml: string,
  tag: string,
  ab = 0,
  bis = xml.length,
): Bereich[] {
  const liste: Bereich[] = [];
  const offen = new RegExp(`<${tag}(?=[\\s>/])`, "g");
  const zu = `</${tag}>`;
  offen.lastIndex = ab;
  for (;;) {
    const m = offen.exec(xml);
    if (!m || m.index >= bis) break;
    const kopfEnde = xml.indexOf(">", m.index);
    if (xml[kopfEnde - 1] === "/") {
      liste.push({
        start: m.index,
        ende: kopfEnde + 1,
        xml: xml.slice(m.index, kopfEnde + 1),
      });
      offen.lastIndex = kopfEnde + 1;
      continue;
    }
    // Verschachtelung desselben Tags mitzählen (p:sp in p:grpSp ist ein anderer Tag).
    let tiefe = 1;
    let pos = kopfEnde + 1;
    const innen = new RegExp(`<${tag}(?=[\\s>/])|</${tag}>`, "g");
    innen.lastIndex = pos;
    let ende = -1;
    for (;;) {
      const t = innen.exec(xml);
      if (!t) break;
      if (t[0] === zu) {
        tiefe -= 1;
        if (tiefe === 0) {
          ende = t.index + zu.length;
          break;
        }
      } else {
        const k = xml.indexOf(">", t.index);
        if (xml[k - 1] !== "/") tiefe += 1;
      }
      pos = innen.lastIndex;
    }
    if (ende < 0) break;
    liste.push({ start: m.index, ende, xml: xml.slice(m.index, ende) });
    offen.lastIndex = ende;
  }
  return liste;
}

export function ersetzeBereich(xml: string, b: Bereich, neu: string): string {
  return xml.slice(0, b.start) + neu + xml.slice(b.ende);
}

/** Erstes Vorkommen eines (leeren oder vollen) Elements als String. */
export function erstesElement(xml: string, tag: string): string | null {
  return elemente(xml, tag)[0]?.xml ?? null;
}

const FORM_TAGS = ["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp"];

/** Oberste Formen einer Folie (in Reihenfolge), ohne den Inhalt von Gruppen aufzulösen. */
export function formen(folie: string): Bereich[] {
  const baum = folie.indexOf("<p:spTree");
  const baumEnde = folie.lastIndexOf("</p:spTree>");
  const alle: Bereich[] = [];
  for (const tag of FORM_TAGS)
    alle.push(...elemente(folie, tag, baum, baumEnde));
  alle.sort((a, b) => a.start - b.start);
  // Nur oberste Ebene: Bereiche, die in einem früheren liegen, verwerfen.
  const oben: Bereich[] = [];
  for (const b of alle) {
    const letzte = oben[oben.length - 1];
    if (letzte && b.start < letzte.ende) continue;
    oben.push(b);
  }
  return oben;
}

export function formName(form: string): string {
  return /<p:cNvPr [^>]*?name="([^"]*)"/.exec(form)?.[1] ?? "";
}

/** Sichtbarer Text einer Form oder Zelle (Absätze mit \n getrennt). */
export function textVon(xml: string): string {
  return elemente(xml, "a:p")
    .map((p) =>
      [...p.xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    )
    .join("\n");
}

export type FormFinder =
  | { name: string; nr?: number }
  | { textBeginn: string }
  | { platzhalterIdx: string };

export function findeForm(folie: string, finder: FormFinder): Bereich | null {
  const liste = formen(folie);
  if ("name" in finder) {
    const treffer = liste.filter((f) => formName(f.xml) === finder.name);
    return treffer[finder.nr ?? 0] ?? null;
  }
  if ("platzhalterIdx" in finder) {
    return (
      liste.find((f) =>
        new RegExp(`<p:ph [^>]*idx="${finder.platzhalterIdx}"`).test(f.xml),
      ) ?? null
    );
  }
  const beginn = finder.textBeginn.toLowerCase();
  return (
    liste.find((f) => textVon(f.xml).trim().toLowerCase().startsWith(beginn)) ??
    null
  );
}

/** Ändert eine Form der Folie; wirft, wenn die Vorlage die Form nicht (mehr) enthält. */
export function formAendern(
  folie: string,
  finder: FormFinder,
  aendern: (form: string) => string,
): string {
  const b = findeForm(folie, finder);
  if (!b) throw new Error(`Vorlage: Form ${JSON.stringify(finder)} fehlt.`);
  return ersetzeBereich(folie, b, aendern(b.xml));
}

export function formEntfernen(folie: string, finder: FormFinder): string {
  const b = findeForm(folie, finder);
  return b ? ersetzeBereich(folie, b, "") : folie;
}

function rPrAus(p: string): string {
  const r = erstesElement(p, "a:r");
  const rpr = r ? erstesElement(r, "a:rPr") : null;
  if (rpr) return rpr;
  const end = erstesElement(p, "a:endParaRPr");
  if (end)
    return end
      .replace(/^<a:endParaRPr/, "<a:rPr")
      .replace(/<\/a:endParaRPr>$/, "</a:rPr>");
  return '<a:rPr lang="de-DE" dirty="0"/>';
}

/** Neuer Absatz im Format eines Vorlage-Absatzes (pPr und Schrift des ersten Laufs bleiben). */
export function absatzWie(vorlage: string, text: string): string {
  const ppr = erstesElement(vorlage, "a:pPr") ?? "";
  const rpr = rPrAus(vorlage);
  const end =
    erstesElement(vorlage, "a:endParaRPr") ??
    rpr
      .replace(/^<a:rPr/, "<a:endParaRPr")
      .replace(/<\/a:rPr>$/, "</a:endParaRPr>");
  if (!text) return `<a:p>${ppr}${end}</a:p>`;
  return `<a:p>${ppr}<a:r>${rpr}<a:t>${xmlEscape(text)}</a:t></a:r>${end}</a:p>`;
}

/**
 * Ersetzt die Absätze eines Textkörpers (p:txBody oder a:txBody). Absatz i übernimmt das Format
 * von Vorlage-Absatz i; überzählige Absätze nehmen das Format des Absatzes `formatAb`.
 */
export function absaetzeSetzen(
  xml: string,
  absaetze: string[],
  formatAb?: number,
): string {
  const body = elemente(xml, "p:txBody")[0] ?? elemente(xml, "a:txBody")[0];
  if (!body) throw new Error("Vorlage: Textkörper fehlt.");
  const alte = elemente(body.xml, "a:p");
  if (!alte.length) throw new Error("Vorlage: Absatz fehlt.");
  const reserve =
    alte[Math.min(formatAb ?? alte.length - 1, alte.length - 1)].xml;
  const neu = (absaetze.length ? absaetze : [""])
    .map((t, i) =>
      absatzWie(
        i < alte.length && (formatAb == null || i < formatAb)
          ? alte[i].xml
          : reserve,
        t,
      ),
    )
    .join("");
  const innen =
    body.xml.slice(0, alte[0].start) +
    neu +
    body.xml.slice(alte[alte.length - 1].ende);
  return ersetzeBereich(xml, body, innen);
}

/** Text einer Form oder Zelle setzen; Zeilenumbrüche werden zu Absätzen im Format des ersten. */
export function textSetzen(xml: string, text: string): string {
  return absaetzeSetzen(xml, text.split("\n"), 1);
}

// ---------- Tabellen ----------

export function tabellenZeilen(frame: string): Bereich[] {
  return elemente(frame, "a:tr");
}

export function zellen(zeile: string): Bereich[] {
  return elemente(zeile, "a:tc");
}

/** Setzt Zellentexte; `werte[z][s]` undefined lässt die Zelle unverändert. */
export function tabelleFuellen(
  frame: string,
  werte: (string | undefined)[][],
): string {
  let ergebnis = frame;
  const zeilen = tabellenZeilen(ergebnis);
  for (let z = zeilen.length - 1; z >= 0; z--) {
    const reihe = werte[z];
    if (!reihe) continue;
    let zeile = zeilen[z].xml;
    const zs = zellen(zeile);
    for (let s = zs.length - 1; s >= 0; s--) {
      const w = reihe[s];
      if (w === undefined) continue;
      zeile = ersetzeBereich(zeile, zs[s], textSetzen(zs[s].xml, w));
    }
    ergebnis = ersetzeBereich(ergebnis, zeilen[z], zeile);
  }
  return ergebnis;
}

/** Ersetzt Zeilen ab `von` (inkl.) bis `bis` (exkl.) durch neue Zeilen-XML. */
export function zeilenErsetzen(
  frame: string,
  von: number,
  bis: number,
  neu: string[],
): string {
  const zeilen = tabellenZeilen(frame);
  const start = zeilen[von]?.start ?? zeilen[zeilen.length - 1].ende;
  const ende = bis > von ? zeilen[bis - 1].ende : start;
  // a16:rowId muss eindeutig sein; kopierte Zeilen bekommen neue Ids.
  let id = 1000;
  const xml = neu
    .map((z) =>
      z.replace(
        /<a16:rowId ([^>]*?)val="\d+"/,
        (_m, a) => `<a16:rowId ${a}val="${(id += 7)}${Date.now() % 100000}"`,
      ),
    )
    .join("");
  return frame.slice(0, start) + xml + frame.slice(ende);
}

/** Zeile im Format einer Vorlage-Zeile mit neuen Zellentexten. */
export function zeileWie(vorlage: string, texte: string[]): string {
  let zeile = vorlage;
  const zs = zellen(zeile);
  for (let s = zs.length - 1; s >= 0; s--) {
    zeile = ersetzeBereich(zeile, zs[s], textSetzen(zs[s].xml, texte[s] ?? ""));
  }
  return zeile;
}

/** Entfernt Spalten (0-basiert) aus Tabelle und Raster; die Breite geht an die letzte Spalte. */
export function spaltenEntfernen(frame: string, spalten: number[]): string {
  if (!spalten.length) return frame;
  const weg = new Set(spalten);
  let ergebnis = frame;
  const zeilen = tabellenZeilen(ergebnis);
  for (let z = zeilen.length - 1; z >= 0; z--) {
    let zeile = zeilen[z].xml;
    const zs = zellen(zeile);
    for (let s = zs.length - 1; s >= 0; s--)
      if (weg.has(s)) zeile = ersetzeBereich(zeile, zs[s], "");
    ergebnis = ersetzeBereich(ergebnis, zeilen[z], zeile);
  }
  const grid = elemente(ergebnis, "a:tblGrid")[0];
  if (grid) {
    const cols = elemente(grid.xml, "a:gridCol");
    let breiteWeg = 0;
    let neu = grid.xml;
    for (let s = cols.length - 1; s >= 0; s--) {
      if (!weg.has(s)) continue;
      breiteWeg += Number(/w="(\d+)"/.exec(cols[s].xml)?.[1] ?? 0);
      neu = ersetzeBereich(neu, cols[s], "");
    }
    const rest = elemente(neu, "a:gridCol");
    const letzte = rest[rest.length - 1];
    if (letzte && breiteWeg) {
      const w = Number(/w="(\d+)"/.exec(letzte.xml)?.[1] ?? 0) + breiteWeg;
      neu = ersetzeBereich(
        neu,
        letzte,
        letzte.xml.replace(/w="\d+"/, `w="${w}"`),
      );
    }
    ergebnis = ersetzeBereich(ergebnis, grid, neu);
  }
  return ergebnis;
}

// ---------- Bilder ----------

/** Zuschnitt (in 1/1000 Prozent), damit ein Bild den Rahmen ohne Verzerrung füllt. */
export function zuschnitt(
  bild: { breite: number; hoehe: number },
  rahmen: { breite: number; hoehe: number },
): { l: number; t: number; r: number; b: number } {
  const bildVerh = bild.breite / bild.hoehe;
  const rahmenVerh = rahmen.breite / rahmen.hoehe;
  if (
    !isFinite(bildVerh) ||
    !isFinite(rahmenVerh) ||
    Math.abs(bildVerh - rahmenVerh) < 0.001
  )
    return { l: 0, t: 0, r: 0, b: 0 };
  if (bildVerh > rahmenVerh) {
    const rand = Math.round(((1 - rahmenVerh / bildVerh) / 2) * 100000);
    return { l: rand, t: 0, r: rand, b: 0 };
  }
  const rand = Math.round(((1 - bildVerh / rahmenVerh) / 2) * 100000);
  return { l: 0, t: rand, r: 0, b: rand };
}

export function rahmenGroesse(
  form: string,
): { breite: number; hoehe: number } | null {
  const m = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(form);
  return m ? { breite: Number(m[1]), hoehe: Number(m[2]) } : null;
}

/**
 * Macht aus einer Bildform (p:pic) oder einem leeren Bildplatzhalter (p:sp) ein Bild mit rId.
 * Position und Größe bleiben, das Bild wird mittig zugeschnitten.
 */
export function bildForm(
  form: string,
  rId: string,
  bild: { breite: number; hoehe: number },
  rahmenErsatz?: { breite: number; hoehe: number },
): string {
  const rahmen = rahmenGroesse(form) ?? rahmenErsatz ?? bild;
  const z = zuschnitt(bild, rahmen);
  const srcRect =
    z.l || z.t || z.r || z.b
      ? `<a:srcRect l="${z.l}" t="${z.t}" r="${z.r}" b="${z.b}"/>`
      : "";
  const blipFill = `<p:blipFill><a:blip r:embed="${rId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`;
  if (form.startsWith("<p:pic")) {
    return form.replace(/<p:blipFill>[\s\S]*?<\/p:blipFill>/, blipFill);
  }
  const cnv =
    erstesElement(form, "p:cNvPr") ?? '<p:cNvPr id="900" name="Bild"/>';
  const nvPr = erstesElement(form, "p:nvPr") ?? "<p:nvPr/>";
  const spPr = erstesElement(form, "p:spPr") ?? "<p:spPr/>";
  return `<p:pic><p:nvPicPr>${cnv}<p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr>${nvPr}</p:nvPicPr>${blipFill}${spPr}</p:pic>`;
}

/** Bild eines Platzhalters entfernen: zurück zum leeren Platzhalter („Bild einfügen“). */
export function bildPlatzhalterLeeren(form: string): string {
  if (!form.startsWith("<p:pic") || !/<p:ph /.test(form)) return form;
  const cnv = erstesElement(form, "p:cNvPr") ?? "";
  const nvPr = erstesElement(form, "p:nvPr") ?? "<p:nvPr/>";
  const spPr = erstesElement(form, "p:spPr") ?? "<p:spPr/>";
  return `<p:sp><p:nvSpPr>${cnv}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>${nvPr}</p:nvSpPr>${spPr}</p:sp>`;
}

// ---------- Excel ----------

export function spalteZuNummer(spalte: string): number {
  let n = 0;
  for (const ch of spalte) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function nummerZuSpalte(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type Zellwert =
  | number
  | string
  | null
  | { formel: string }
  | { datum: string };

/** Excel-Seriennummer (1900-System) zu einem ISO-Datum JJJJ-MM-TT. */
export function excelDatum(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round(t / 86_400_000) + 25569;
}

/** Eine Zelle als XML; `stil` ist der Index in cellXfs. */
export function zelleXml(
  ref: string,
  wert: Zellwert,
  stil?: number | string,
): string {
  const s = stil != null && stil !== "" ? ` s="${stil}"` : "";
  if (wert == null || wert === "") return `<c r="${ref}"${s}/>`;
  if (typeof wert === "number") {
    return Number.isFinite(wert)
      ? `<c r="${ref}"${s}><v>${wert}</v></c>`
      : `<c r="${ref}"${s}/>`;
  }
  if (typeof wert === "string")
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(wert)}</t></is></c>`;
  if ("datum" in wert) {
    const d = excelDatum(wert.datum);
    return d == null
      ? `<c r="${ref}"${s}/>`
      : `<c r="${ref}"${s}><v>${d}</v></c>`;
  }
  return `<c r="${ref}"${s}><f>${xmlEscape(wert.formel)}</f></c>`;
}

function zellRef(ref: string): { spalte: number; zeile: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Ungültige Zelle ${ref}`);
  return { spalte: spalteZuNummer(m[1]), zeile: Number(m[2]) };
}

/** Setzt einen Zellwert im Tabellenblatt und behält den Stil der Vorlage-Zelle. */
export function zelleSetzen(
  blatt: string,
  ref: string,
  wert: Zellwert,
  stil?: number,
): string {
  const { spalte, zeile } = zellRef(ref);
  const zeilen = elemente(blatt, "row");
  const reihe = zeilen.find((r) =>
    new RegExp(`^<row [^>]*\\br="${zeile}"`).test(r.xml),
  );
  if (!reihe) {
    const danach = zeilen.find(
      (r) => Number(/\br="(\d+)"/.exec(r.xml)?.[1]) > zeile,
    );
    const neu = `<row r="${zeile}">${zelleXml(ref, wert, stil)}</row>`;
    if (danach)
      return blatt.slice(0, danach.start) + neu + blatt.slice(danach.start);
    return blatt.replace("</sheetData>", `${neu}</sheetData>`);
  }
  const cs = elemente(reihe.xml, "c");
  const alt = cs.find((c) => new RegExp(`^<c [^>]*\\br="${ref}"`).test(c.xml));
  let zeileXml: string;
  if (alt) {
    const s = stil ?? /\bs="(\d+)"/.exec(alt.xml)?.[1];
    zeileXml = ersetzeBereich(reihe.xml, alt, zelleXml(ref, wert, s));
  } else {
    const nach = cs.find(
      (c) => zellRef(/\br="([A-Z]+\d+)"/.exec(c.xml)![1]).spalte > spalte,
    );
    const neu = zelleXml(ref, wert, stil);
    if (nach)
      zeileXml =
        reihe.xml.slice(0, nach.start) + neu + reihe.xml.slice(nach.start);
    else if (reihe.xml.endsWith("/>"))
      zeileXml = reihe.xml.replace(/\/>$/, `>${neu}</row>`);
    else zeileXml = reihe.xml.replace(/<\/row>$/, `${neu}</row>`);
  }
  return ersetzeBereich(blatt, reihe, zeileXml);
}

/** Gespeicherte Formelergebnisse entfernen, damit Excel beim Öffnen neu rechnet. */
export function formelErgebnisseEntfernen(blatt: string): string {
  return blatt.replace(
    /<c ([^>]*?)>(<f[^>]*?(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v><\/c>/g,
    (_m, attr: string, f: string) => {
      return `<c ${attr.replace(/\s*t="(str|e|b|n)"/, "")}>${f}</c>`;
    },
  );
}

/** Verschiebt Zeilenbezüge in Formeln/Referenzen: Zeilen >= `ab` um `um`, Zeile `bereichEnde` auf `neuesEnde`. */
export function bezuegeVerschieben(
  text: string,
  ab: number,
  um: number,
  bereichEnde?: { alt: number; neu: number },
): string {
  return text.replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(])/g,
    (m, d1, sp, d2, z) => {
      const zeile = Number(z);
      if (bereichEnde && zeile === bereichEnde.alt)
        return `${d1}${sp}${d2}${bereichEnde.neu}`;
      if (zeile >= ab) return `${d1}${sp}${d2}${zeile + um}`;
      return m;
    },
  );
}

/** Absätze gezielt nach Vorlage-Absätzen bauen: jeder neue Absatz nennt den Index seines Vorbilds. */
export function absaetzeNachVorbild(
  xml: string,
  liste: { vorbild: number; text: string }[],
): string {
  const body = elemente(xml, "p:txBody")[0] ?? elemente(xml, "a:txBody")[0];
  if (!body) throw new Error("Vorlage: Textkörper fehlt.");
  const alte = elemente(body.xml, "a:p");
  const neu = liste
    .map((a) =>
      absatzWie(alte[Math.min(a.vorbild, alte.length - 1)].xml, a.text),
    )
    .join("");
  const innen =
    body.xml.slice(0, alte[0].start) +
    neu +
    body.xml.slice(alte[alte.length - 1].ende);
  return ersetzeBereich(xml, body, innen);
}
