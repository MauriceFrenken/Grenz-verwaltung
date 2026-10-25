/**
 * Excel-Ausgaben im Grenz-Format: Mietaufstellung und Kaufpreistool aus den Original-Vorlagen,
 * DCF-Kalkulation neu im Stil der Mietaufstellung (gleiche Schriften, Farben 233466, Logo).
 * Alle Summen und Kennzahlen bleiben Excel-Formeln, damit Grenz weiterrechnen kann.
 */

import {
  bezuegeVerschieben,
  elemente,
  formelErgebnisseEntfernen,
  nummerZuSpalte,
  zelleSetzen,
  zelleXml,
  type Zellwert,
} from "../ooxml";
import {
  excelNeuBerechnen,
  fuellungAnhaengen,
  lesen,
  paketOeffnen,
  paketSpeichern,
  schreiben,
  zellformateAnhaengen,
} from "../paket";
import { DCF_JAHRE } from "../rechnen";
import type {
  DcfDaten,
  KaufpreisDaten,
  MieterlisteDaten,
  Objekt,
} from "../typen";

const BLATT = "xl/worksheets/sheet1.xml";

export function adresseZeile(o: Objekt): string {
  return o.strasse.wert ?? "";
}

export function plzOrt(o: Objekt): string {
  return [o.plz.wert, o.ort.wert].filter(Boolean).join(" ");
}

// ---------- Mietaufstellung ----------

/** Erste und letzte Datenzeile der Vorlage (Einheit 1 bis 26). */
const M_ERSTE = 7;
const M_LETZTE = 32;

function verschiebeAttribute(
  xml: string,
  ab: number,
  um: number,
  ende: { alt: number; neu: number },
): string {
  return xml
    .replace(
      /\b(r|ref|sqref)="([^"]*)"/g,
      (_m, a: string, v: string) =>
        `${a}="${bezuegeVerschieben(v, ab, um, ende)}"`,
    )
    .replace(
      /(<f(?:\s[^>]*)?>)([^<]*)(<\/f>)/g,
      (_m, auf: string, f: string, zu: string) =>
        auf + bezuegeVerschieben(f, ab, um, ende) + zu,
    );
}

export async function mietaufstellungErstellen(
  vorlage: Uint8Array,
  d: MieterlisteDaten,
): Promise<Uint8Array> {
  if (!d.einheiten.length)
    throw new Error("Die Mieterliste enthält keine Einheiten.");
  const paket = await paketOeffnen(vorlage);
  let blatt = await lesen(paket, BLATT);

  blatt = zelleSetzen(blatt, "C1", adresseZeile(d.objekt));
  blatt = zelleSetzen(blatt, "C2", plzOrt(d.objekt));
  blatt = zelleSetzen(blatt, "C3", d.kaufpreis.wert);

  const n = d.einheiten.length;
  const letzte = M_ERSTE + n - 1;
  const um = letzte - M_LETZTE;
  const ende = { alt: M_LETZTE, neu: letzte };

  const daten = d.einheiten.map((e, i) => {
    const r = M_ERSTE + i;
    const parken =
      e.nutzung === "Stellplatz" || e.nutzung === "Garagenstellplatz";
    const s = parken ? 6 : 5;
    const mitFlaeche = !parken && e.flaeche != null;
    const zellen: [string, Zellwert, number][] = [
      ["A", i + 1, 42],
      ["B", e.lage, s],
      ["C", e.mieter, s],
      [
        "D",
        e.vertragBeginn ? { datum: e.vertragBeginn } : null,
        e.vertragBeginn ? 55 : parken ? 44 : 43,
      ],
      ["E", e.laufzeit, s],
      ["F", e.info, s],
      ["G", e.nutzung, s],
      ["H", e.belegung, s],
      ["I", e.flaeche, s],
      ["J", e.belegung === "vermietet" ? e.kaltmieteIst : null, s],
      ["K", mitFlaeche ? { formel: `IF(I${r}=0,"###",J${r}/I${r})` } : null, s],
      ["L", e.kaltmieteSoll, s],
      ["M", mitFlaeche ? { formel: `IF(I${r}=0,"###",L${r}/I${r})` } : null, s],
      ["N", { formel: `SUM(O${r}:P${r})` }, 5],
      ["O", e.betriebskosten, s],
      ["P", e.heizkosten, s],
    ];
    return `<row r="${r}" spans="1:16">${zellen.map(([sp, w, st]) => zelleXml(`${sp}${r}`, w, st)).join("")}</row>`;
  });

  const zeilen = elemente(blatt, "row");
  const vorher = zeilen.filter(
    (z) => Number(/\br="(\d+)"/.exec(z.xml)![1]) < M_ERSTE,
  );
  const nachher = zeilen.filter(
    (z) => Number(/\br="(\d+)"/.exec(z.xml)![1]) > M_LETZTE,
  );
  const sheetData = `<sheetData>${vorher.map((z) => z.xml).join("")}${daten.join("")}${nachher
    .map((z) => verschiebeAttribute(z.xml, M_LETZTE + 1, um, ende))
    .join("")}</sheetData>`;

  const kopf = blatt.slice(0, blatt.indexOf("<sheetData"));
  const rest = blatt.slice(
    blatt.indexOf("</sheetData>") + "</sheetData>".length,
  );
  blatt =
    verschiebeAttribute(
      kopf.replace(
        /<dimension ref="[^"]*"\/>/,
        `<dimension ref="A1:P${50 + um}"/>`,
      ),
      M_LETZTE + 1,
      um,
      ende,
    ) +
    sheetData +
    verschiebeAttribute(rest, M_LETZTE + 1, um, ende);
  schreiben(paket, BLATT, formelErgebnisseEntfernen(blatt));
  await excelNeuBerechnen(paket);
  return paketSpeichern(paket);
}

// ---------- Kaufpreistool ----------

export async function kaufpreistoolErstellen(
  vorlage: Uint8Array,
  d: KaufpreisDaten,
): Promise<Uint8Array> {
  const paket = await paketOeffnen(vorlage);
  let blatt = await lesen(paket, BLATT);
  const adresse = [adresseZeile(d.objekt), plzOrt(d.objekt)]
    .filter(Boolean)
    .join(", ");
  const werte: [string, Zellwert][] = [
    ["B3", adresse],
    ["B4", d.flaecheWohnen.wert],
    ["B5", d.flaecheGewerbe.wert],
    ["B7", d.mieteMonatIst.wert],
    ["B8", d.mieteMonatSoll.wert],
    ["B9", d.marktmieteWohnen.wert],
    ["B10", d.marktmieteGewerbe.wert],
    ["B11", d.basisKaufpreis.wert],
    ["B13", d.schritt.wert],
  ];
  for (const [ref, w] of werte) blatt = zelleSetzen(blatt, ref, w);
  // Auswahlliste der Schrittweite um größere Schritte erweitern.
  blatt = blatt.replace(
    /<formula1>"25000,50000,100000,200000"<\/formula1>/,
    '<formula1>"25000,50000,100000,200000,250000,500000"</formula1>',
  );
  schreiben(paket, BLATT, formelErgebnisseEntfernen(blatt));
  await excelNeuBerechnen(paket);
  return paketSpeichern(paket);
}

// ---------- DCF ----------

/** Stile der Mietaufstellung-Vorlage (cellXfs-Index). */
const S = {
  labelKopf: 78,
  label: 57,
  labelUnten: 58,
  wertFett: 59,
  euroFett: 61,
  kopf: 12,
  zahl: 5,
  navyText: 28,
  navyProzent: 64,
  navyFach: 66,
  navyEuroM2: 70,
  navyZahl: 29,
};

export async function dcfErstellen(
  vorlage: Uint8Array,
  d: DcfDaten,
): Promise<Uint8Array> {
  const paket = await paketOeffnen(vorlage);

  // Zusätzliche Formate: Eingabefelder hellblau (Grenz BCD4E5), Prozent, Text, Jahre.
  let styles = await lesen(paket, "xl/styles.xml");
  const hell = fuellungAnhaengen(styles, "BCD4E5");
  styles = hell.styles;
  const f = hell.index;
  const neu = zellformateAnhaengen(styles, [
    `<xf numFmtId="166" fontId="0" fillId="${f}" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`,
    `<xf numFmtId="43" fontId="0" fillId="${f}" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`,
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
    `<xf numFmtId="43" fontId="3" fillId="0" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="1" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>`,
    `<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
  ]);
  schreiben(paket, "xl/styles.xml", neu.styles);
  const [
    prozentEin,
    zahlEin,
    prozent,
    text,
    textFett,
    zahlFett,
    jahr,
    faktor4,
    klein,
    navyLabel,
  ] = neu.indizes;

  const zeilen = new Map<number, string[]>();
  const setze = (ref: string, w: Zellwert, stil: number) => {
    const r = Number(/\d+/.exec(ref)![0]);
    const liste = zeilen.get(r) ?? [];
    liste.push(zelleXml(ref, w, stil));
    zeilen.set(r, liste);
  };

  setze("A1", "Objektadresse:", S.labelKopf);
  setze("B1", adresseZeile(d.objekt), S.wertFett);
  setze("A2", "PLZ / Ort:", S.label);
  setze("B2", plzOrt(d.objekt), S.wertFett);
  setze("A3", "Kaufpreis:", S.labelUnten);
  setze("B3", d.kaufpreis.wert, S.euroFett);

  setze("A5", "ANNAHMEN", navyLabel);
  setze("B5", "", navyLabel);
  const annahmen: [string, Zellwert, number][] = [
    ["Mietfläche gesamt (m²)", d.flaeche.wert, zahlEin],
    ["Anzahl Einheiten", d.einheiten.wert, zahlEin],
    ["Jahresnettokaltmiete IST (EUR)", d.mieteJahrIst.wert, zahlEin],
    ["Jahresnettokaltmiete Marktmiete (EUR)", d.mieteJahrMarkt.wert, zahlEin],
    ["Anpassung an Marktmiete über (Jahre)", d.anpassungJahre.wert, zahlEin],
    ["Mietsteigerung p. a.", d.mietsteigerung.wert, prozentEin],
    ["Mietausfallwagnis (% der Miete)", d.mietausfall.wert, prozentEin],
    ["Verwaltung je Einheit p. a. (EUR)", d.verwaltungProEinheit.wert, zahlEin],
    ["Instandhaltung je m² p. a. (EUR)", d.instandhaltungM2.wert, zahlEin],
    [
      "Sonstige nicht umlagefähige Kosten (% der Miete)",
      d.nichtUmlagefaehig.wert,
      prozentEin,
    ],
    ["Kostensteigerung p. a.", d.kostensteigerung.wert, prozentEin],
    ["Grunderwerbsteuer", d.grunderwerbsteuer.wert, prozentEin],
    ["Notar / Grundbuch", d.notarGrundbuch.wert, prozentEin],
    ["Maklerprovision", d.makler.wert, prozentEin],
    ["Diskontierungszins", d.diskontierung.wert, prozentEin],
    ["Exit-Faktor (x Jahresmiete Folgejahr)", d.exitFaktor.wert, zahlEin],
  ];
  annahmen.forEach(([label, w, stil], i) => {
    setze(`A${6 + i}`, label, text);
    setze(`B${6 + i}`, w, stil);
  });
  // B6 Fläche, B7 Einheiten, B8 Miete IST, B9 Marktmiete, B10 Anpassung, B11 Steigerung, B12 Ausfall,
  // B13 Verwaltung, B14 Instandhaltung, B15 Sonstige, B16 Kostensteigerung, B17 GrESt, B18 Notar,
  // B19 Makler, B20 Zins, B21 Exit-Faktor

  const Z = 37; // Kopf Cashflow
  const sp = (t: number) => nummerZuSpalte(2 + t); // Jahr 0 = B
  const letzteSp = sp(DCF_JAHRE);
  const miete = (jahrRef: string) =>
    `($B$8+($B$9-$B$8)*IF($B$10<=0,1,MIN(${jahrRef},$B$10)/$B$10))*(1+$B$11)^(${jahrRef}-1)`;

  setze("A23", "ERGEBNIS", navyLabel);
  setze("B23", "", navyLabel);
  const ergebnis: [string, Zellwert, number][] = [
    ["Erwerbsnebenkosten", { formel: "B3*(B17+B18+B19)" }, S.zahl],
    ["Gesamtinvestition", { formel: "B3+B24" }, zahlFett],
    ["Kaufpreisfaktor IST", { formel: 'IF(B8=0,"###",B3/B8)' }, S.navyFach],
    ["Kaufpreis pro m²", { formel: 'IF(B6=0,"###",B3/B6)' }, S.navyEuroM2],
    ["Bruttoanfangsrendite", { formel: 'IF(B3=0,"###",B8/B3)' }, prozent],
    [
      "Nettoanfangsrendite",
      { formel: `IF(B25=0,"###",C${Z + 6}/B25)` },
      prozent,
    ],
    ["Exit-Wert Jahr 10", { formel: `${letzteSp}${Z + 8}` }, S.zahl],
    [
      "Barwert der Cashflows",
      { formel: `SUM(C${Z + 12}:${letzteSp}${Z + 12})` },
      zahlFett,
    ],
    [
      "Kapitalwert (Barwert – Gesamtinvestition)",
      { formel: "B31-B25" },
      zahlFett,
    ],
    [
      "IRR ungehebelt",
      { formel: `IRR(B${Z + 9}:${letzteSp}${Z + 9})` },
      S.navyProzent,
    ],
    [
      "Max. Kaufpreis bei Zielrendite",
      { formel: "B31/(1+B17+B18+B19)" },
      S.navyZahl,
    ],
  ];
  ergebnis.forEach(([label, w, stil], i) => {
    setze(`A${24 + i}`, label, text);
    setze(`B${24 + i}`, w, stil);
  });

  setze(`A${Z}`, "CASHFLOW (EUR) / JAHR", navyLabel);
  for (let t = 0; t <= DCF_JAHRE; t++) setze(`${sp(t)}${Z}`, t, jahr);
  const reihen: [string, (c: string, t: number) => Zellwert, number][] = [
    [
      "Jahresnettokaltmiete",
      (c, t) => (t === 0 ? null : { formel: miete(`${c}$${Z}`) }),
      S.zahl,
    ],
    [
      "Mietausfallwagnis",
      (c, t) => (t === 0 ? null : { formel: `-${c}${Z + 1}*$B$12` }),
      S.zahl,
    ],
    [
      "Verwaltung",
      (c, t) =>
        t === 0 ? null : { formel: `-$B$7*$B$13*(1+$B$16)^(${c}$${Z}-1)` },
      S.zahl,
    ],
    [
      "Instandhaltung",
      (c, t) =>
        t === 0 ? null : { formel: `-$B$6*$B$14*(1+$B$16)^(${c}$${Z}-1)` },
      S.zahl,
    ],
    [
      "Sonstige nicht umlagefähige Kosten",
      (c, t) => (t === 0 ? null : { formel: `-${c}${Z + 1}*$B$15` }),
      S.zahl,
    ],
    [
      "Nettomietertrag (NOI)",
      (c, t) => (t === 0 ? null : { formel: `SUM(${c}${Z + 1}:${c}${Z + 5})` }),
      zahlFett,
    ],
    [
      "Investition / Exit",
      (c, t) =>
        t === 0
          ? { formel: "-B25" }
          : t === DCF_JAHRE
            ? { formel: `${miete(`(${c}$${Z}+1)`)}*$B$21` }
            : null,
      S.zahl,
    ],
    [
      "Cashflow",
      (c) => ({ formel: `SUM(${c}${Z + 6}:${c}${Z + 7})` }),
      zahlFett,
    ],
    ["Diskontfaktor", (c) => ({ formel: `1/(1+$B$20)^${c}$${Z}` }), faktor4],
    [
      "Barwert",
      (c, t) => (t === 0 ? null : { formel: `${c}${Z + 9}*${c}${Z + 11}` }),
      S.zahl,
    ],
  ];
  // Zeilen: Z+1 Miete … Z+6 NOI, Z+7 Investition/Exit, Z+8 Exit (Hilfszeile), Z+9 Cashflow, Z+11 Diskont, Z+12 Barwert
  const zeilenNr = [
    Z + 1,
    Z + 2,
    Z + 3,
    Z + 4,
    Z + 5,
    Z + 6,
    Z + 7,
    Z + 9,
    Z + 11,
    Z + 12,
  ];
  reihen.forEach(([label, wert, stil], i) => {
    const r = zeilenNr[i];
    setze(`A${r}`, label, i === 5 || i === 7 ? textFett : text);
    for (let t = 0; t <= DCF_JAHRE; t++) {
      const c = sp(t);
      let w = wert(c, t);
      // Cashflow-Zeile: NOI (Z+6) + Investition/Exit (Z+7).
      if (i === 7) w = { formel: `${c}${Z + 6}+${c}${Z + 7}` };
      setze(`${c}${r}`, w, stil);
    }
  });
  setze(`A${Z + 8}`, "davon Exit-Wert", text);
  setze(`${letzteSp}${Z + 8}`, { formel: `${letzteSp}${Z + 7}` }, S.zahl);
  setze(
    `A${Z + 15}`,
    "Indikative DCF-Kalkulation von Grenz & Co. auf Basis der vorliegenden Unterlagen und der markierten Annahmen (hellblau = Eingabe). Kein Verkehrswertgutachten im Sinne von § 194 BauGB. Betrachtungszeitraum 10 Jahre, ungehebelt, vor Steuern.",
    klein,
  );

  const rows = [...zeilen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, cs]) => {
      const sortiert = cs.sort((x, y) => spalteVon(x) - spalteVon(y));
      const hoehe =
        r === Z + 15
          ? ' ht="48" customHeight="1"'
          : r === Z || r === 5 || r === 23
            ? ' ht="22" customHeight="1"'
            : "";
      return `<row r="${r}"${hoehe}>${sortiert.join("")}</row>`;
    })
    .join("");

  const cols =
    '<cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/>' +
    `<col min="3" max="${2 + DCF_JAHRE}" width="14" customWidth="1"/></cols>`;
  let blatt = await lesen(paket, BLATT);
  const kopf = blatt.slice(0, blatt.indexOf("<dimension"));
  blatt =
    kopf +
    `<dimension ref="A1:${letzteSp}${Z + 15}"/><sheetViews><sheetView tabSelected="1" zoomScaleNormal="100" workbookViewId="0"/></sheetViews>` +
    '<sheetFormatPr baseColWidth="10" defaultRowHeight="16"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    `<mergeCells count="1"><mergeCell ref="A${Z + 15}:${letzteSp}${Z + 15}"/></mergeCells>` +
    '<pageMargins left="0.7" right="0.7" top="0.787" bottom="0.787" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>' +
    '<drawing r:id="rId1"/></worksheet>';
  schreiben(paket, BLATT, blatt);

  // Logo oben rechts über den letzten Jahresspalten.
  let zeichnung = await lesen(paket, "xl/drawings/drawing1.xml");
  zeichnung = zeichnung
    .replace(
      /<xdr:from><xdr:col>\d+<\/xdr:col>/,
      `<xdr:from><xdr:col>${DCF_JAHRE - 1}</xdr:col>`,
    )
    .replace(
      /<xdr:to><xdr:col>\d+<\/xdr:col>/,
      `<xdr:to><xdr:col>${DCF_JAHRE + 1}</xdr:col>`,
    );
  schreiben(paket, "xl/drawings/drawing1.xml", zeichnung);

  const wb = await lesen(paket, "xl/workbook.xml");
  schreiben(
    paket,
    "xl/workbook.xml",
    wb
      .replace(/<sheet name="[^"]*"/, '<sheet name="DCF"')
      .replace(/<definedNames>[\s\S]*?<\/definedNames>/, ""),
  );
  const app = await lesen(paket, "docProps/app.xml");
  schreiben(
    paket,
    "docProps/app.xml",
    app.replace(/<vt:lpstr>Tabelle1<\/vt:lpstr>/, "<vt:lpstr>DCF</vt:lpstr>"),
  );
  await excelNeuBerechnen(paket);
  return paketSpeichern(paket);
}

function spalteVon(zelle: string): number {
  const m = /r="([A-Z]+)\d+"/.exec(zelle)!;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
