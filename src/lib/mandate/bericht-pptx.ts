/**
 * Vermarktungsbericht als PowerPoint im Layout der Grenz-Vorlage (A4 quer, drei Folien:
 * Titel, Zielgruppe, Vermarktungsstand). Diagramme sind echte PowerPoint-Diagramme und
 * bleiben in PowerPoint bearbeitbar.
 */

import PptxGenJS from "pptxgenjs";

import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";
import wortmarkeWeiss from "@/assets/grenz-co-wortmarke-weiss.png?inline";

import {
  BERICHT_FARBEN,
  euroKurz,
  type BerichtStand,
} from "./vermarktungsbericht";

export type BerichtFoto = { dataUri: string; breite: number; hoehe: number };

const F = {
  navy: BERICHT_FARBEN.navy.slice(1),
  hellblau: BERICHT_FARBEN.hellblau.slice(1),
  grau: BERICHT_FARBEN.grau.slice(1),
  zeile: BERICHT_FARBEN.zeile.slice(1),
  text: BERICHT_FARBEN.text.slice(1),
  textHell: BERICHT_FARBEN.textHell.slice(1),
};
const SCHRIFT = "Roboto Light";
const BREITE = 11.69;
const HOEHE = 8.27;

function foto(
  slide: PptxGenJS.Slide,
  bild: BerichtFoto | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!bild) {
    slide.addShape("rect", { x, y, w, h, fill: { color: F.grau } });
    return;
  }
  slide.addImage({
    data: bild.dataUri,
    x,
    y,
    w: bild.breite,
    h: bild.hoehe,
    sizing: { type: "cover", w, h },
  });
}

function rahmen(
  slide: PptxGenJS.Slide,
  titel: string,
  untertitel: string,
  seite: number,
  stempel: string | null,
) {
  slide.addShape("rect", {
    x: 7.55,
    y: 0,
    w: BREITE - 7.55,
    h: HOEHE,
    fill: { color: F.hellblau },
    line: { color: F.hellblau },
  });
  slide.addImage({ data: wortmarkeWeiss, x: 9.97, y: 0.21, w: 1.48, h: 0.23 });
  slide.addText(titel.toUpperCase(), {
    x: 0.35,
    y: 0.43,
    w: 7.1,
    h: 0.7,
    fontFace: SCHRIFT,
    fontSize: 36,
    color: F.navy,
    margin: 0,
    valign: "middle",
  });
  slide.addText(untertitel, {
    x: 0.35,
    y: 1.13,
    w: 7.1,
    h: 0.3,
    fontFace: SCHRIFT,
    fontSize: 10,
    color: F.text,
    margin: 0,
  });
  slide.addText(
    stempel ? `- ${stempel} · Streng vertraulich -` : "- Streng vertraulich -",
    {
      x: 8.2,
      y: 7.97,
      w: 2.6,
      h: 0.27,
      fontFace: SCHRIFT,
      fontSize: 8,
      color: F.textHell,
      align: "right",
      margin: 0,
    },
  );
  slide.addText(String(seite), {
    x: 10.88,
    y: 7.95,
    w: 0.36,
    h: 0.33,
    fontFace: SCHRIFT,
    fontSize: 9,
    color: "FFFFFF",
    fill: { color: F.navy },
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

type Zelle = PptxGenJS.TableCell;

function zelle(
  text: string,
  opt: Partial<PptxGenJS.TableCellProps> = {},
): Zelle {
  return {
    text,
    options: {
      fontFace: SCHRIFT,
      fontSize: 10,
      color: F.text,
      fill: { color: F.zeile },
      border: { type: "solid", pt: 1.5, color: "FFFFFF" },
      valign: "middle",
      margin: [0.03, 0.08, 0.03, 0.08],
      ...opt,
    },
  };
}

function wertTabelle(
  kopf: string,
  zeilen: { label: string; wert: number }[],
  gesamt: number,
): Zelle[][] {
  return [
    [zelle(kopf, { fill: { color: F.navy }, color: "FFFFFF", colspan: 2 })],
    ...zeilen.map((z) => [
      zelle(z.label),
      zelle(z.wert.toLocaleString("de-DE"), { align: "right" }),
    ]),
    [
      zelle("Gesamt", { bold: true, fill: { color: "FFFFFF" } }),
      zelle(gesamt.toLocaleString("de-DE"), {
        bold: true,
        align: "right",
        fill: { color: "FFFFFF" },
      }),
    ],
  ];
}

function torte(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  titel: string,
  werte: { label: string; wert: number }[],
  pos: { x: number; y: number; w: number; h: number },
  legende: "r" | "b",
  palette: readonly string[] = BERICHT_FARBEN.diagramm,
) {
  const mitWert = werte.filter((w) => w.wert > 0);
  if (!mitWert.length) return;
  slide.addChart(
    pptx.ChartType.pie,
    [
      {
        name: titel,
        labels: mitWert.map((w) => w.label),
        values: mitWert.map((w) => w.wert),
      },
    ],
    {
      ...pos,
      chartColors: werte
        .map((w, i) => ({ w, f: palette[i % palette.length] }))
        .filter((x) => x.w.wert > 0)
        .map((x) => x.f.slice(1)),
      showLegend: true,
      legendPos: legende,
      legendFontFace: SCHRIFT,
      legendFontSize: 9,
      legendColor: F.text,
      showTitle: true,
      title: titel,
      titleFontFace: SCHRIFT,
      titleFontSize: 10,
      titleColor: F.textHell,
      showValue: false,
      showPercent: false,
      dataBorder: { pt: 1, color: "FFFFFF" },
    },
  );
}

export async function berichtAlsPptx(
  b: BerichtStand,
  fotos: { titel: BerichtFoto | null; objekt: BerichtFoto | null },
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "A4_QUER", width: BREITE, height: HOEHE });
  pptx.layout = "A4_QUER";
  pptx.author = "Grenz & Co. Immobilienberatung";
  pptx.title = `${b.titel} ${b.objektbezeichnung}`;

  // Folie 1: Titel
  const s1 = pptx.addSlide();
  s1.addShape("rect", {
    x: 0,
    y: 0,
    w: 7.4,
    h: 6.05,
    fill: { color: F.hellblau },
    line: { color: F.hellblau },
  });
  foto(s1, fotos.titel ?? fotos.objekt, 0.45, 0.87, 10.79, 6.53);
  s1.addShape("rect", {
    x: 5.69,
    y: 4.04,
    w: 6.01,
    h: 2.48,
    fill: { color: F.navy },
    line: { color: F.navy },
  });
  s1.addText(b.titel.toUpperCase(), {
    x: 5.92,
    y: 4.4,
    w: 5.6,
    h: 0.6,
    fontFace: SCHRIFT,
    fontSize: 22,
    color: "FFFFFF",
    margin: 0,
    valign: "bottom",
  });
  s1.addText(b.objektbezeichnung, {
    x: 5.92,
    y: 5.05,
    w: 5.6,
    h: 0.65,
    fontFace: SCHRIFT,
    fontSize: 12,
    color: "FFFFFF",
    margin: 0,
    valign: "top",
  });
  s1.addText(b.auftraggeber, {
    x: 5.92,
    y: 5.9,
    w: 3.0,
    h: 0.4,
    fontFace: SCHRIFT,
    fontSize: 12,
    color: "FFFFFF",
    margin: 0,
    valign: "middle",
  });
  s1.addText(b.berichtsdatum, {
    x: 8.9,
    y: 5.9,
    w: 2.6,
    h: 0.4,
    fontFace: SCHRIFT,
    fontSize: 11,
    color: "FFFFFF",
    margin: 0,
    align: "right",
    valign: "middle",
  });
  s1.addShape("rect", {
    x: 0,
    y: 6.61,
    w: 3.04,
    h: 1.09,
    fill: { color: F.navy },
    line: { color: F.navy },
  });
  s1.addImage({ data: logoWeiss, x: 0.27, y: 6.8, w: 2.5, h: 0.716 });
  s1.addText(
    b.stempel
      ? `- ${b.stempel} · Streng vertraulich -`
      : "- Streng vertraulich -",
    {
      x: 8.6,
      y: 7.45,
      w: 2.64,
      h: 0.3,
      fontFace: SCHRIFT,
      fontSize: 8,
      color: F.textHell,
      align: "right",
      margin: 0,
    },
  );

  // Folie 2: Zielgruppe
  const s2 = pptx.addSlide();
  rahmen(s2, "Zielgruppe", "Angesprochene Investoren", 2, b.stempel);
  foto(s2, fotos.objekt ?? fotos.titel, 7.03, 1.43, 4.24, 5.39);
  s2.addTable(
    [
      ["Objektanschrift", b.objektanschrift],
      ["Objekttyp", b.objekttyp],
      ["Auftraggeber", b.auftraggeber],
      ["Beginn der Vermarktung", b.vermarktungsbeginn],
      ["Angesprochene Investoren", b.angesprochen.toLocaleString("de-DE")],
    ].map(([l, w]) => [zelle(l), zelle(w)]),
    { x: 0.35, y: 1.57, w: 6.33, colW: [2.95, 3.38], rowH: 0.33 },
  );
  torte(
    pptx,
    s2,
    "Zusammensetzung der Kundengruppen",
    b.kundengruppen,
    { x: 0.2, y: 3.6, w: 6.48, h: 4.1 },
    "r",
  );

  // Folie 3: Vermarktungsstand
  const s3 = pptx.addSlide();
  rahmen(s3, "Vermarktungsstand", "Aktueller Stand", 3, b.stempel);
  const zeilenHoehe = 0.31;
  s3.addTable(wertTabelle("Status", b.status, b.angesprochen), {
    x: 0.35,
    y: 1.61,
    w: 3.33,
    colW: [2.68, 0.65],
    rowH: zeilenHoehe,
  });
  if (b.absagegruende.length)
    s3.addTable(wertTabelle("Absagegründe", b.absagegruende, b.absagenGesamt), {
      x: 3.98,
      y: 1.61,
      w: 3.23,
      colW: [2.58, 0.65],
      rowH: zeilenHoehe,
    });
  torte(
    pptx,
    s3,
    "Absagegründe",
    b.absagegruende,
    { x: 7.6, y: 1.61, w: 3.95, h: 5.6 },
    "b",
    BERICHT_FARBEN.diagrammPanel,
  );
  const tabellenEnde =
    1.61 +
    zeilenHoehe * (Math.max(b.status.length, b.absagegruende.length) + 2);
  const textY = Math.max(5.03, tabellenEnde + 0.25);
  const absatz: PptxGenJS.TextProps[] = [];
  const block = (ueberschrift: string, punkte: string[]) => {
    if (!punkte.length) return;
    if (absatz.length)
      absatz.push({ text: "", options: { breakLine: true, fontSize: 6 } });
    absatz.push({
      text: ueberschrift,
      options: { italic: true, breakLine: true, paraSpaceAfter: 4 },
    });
    for (const p of punkte)
      absatz.push({ text: p, options: { bullet: true, breakLine: true } });
  };
  block(
    "Bisherige Herausforderungen bei der Vermarktung:",
    b.herausforderungen,
  );
  block("Weiteres Vorgehen:", b.weiteresVorgehen);
  if (absatz.length)
    s3.addText(absatz, {
      x: 0.35,
      y: textY,
      w: 6.86,
      h: Math.max(1, 7.85 - textY),
      fontFace: SCHRIFT,
      fontSize: 10,
      color: F.text,
      valign: "top",
      margin: 0,
      fit: "shrink",
    });

  if (b.aktivitaetsSeite) aktivitaetsFolie(pptx, b);

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

/** Folie 4: Kennzahlen, Aktivitäten je Monat, Angebote, Angebotspreis. */
function aktivitaetsFolie(pptx: PptxGenJS, b: BerichtStand) {
  const s = pptx.addSlide();
  rahmen(
    s,
    "Aktivitäten & Angebote",
    "Vermarktung seit Beginn in Zahlen",
    4,
    b.stempel,
  );
  const breite = (6.85 - 4 * 0.1) / 5;
  b.kennzahlen.forEach((k, i) => {
    const x = 0.35 + i * (breite + 0.1);
    s.addShape("rect", {
      x,
      y: 1.61,
      w: breite,
      h: 1.05,
      fill: { color: F.zeile },
      line: { color: F.zeile },
    });
    s.addShape("rect", {
      x,
      y: 1.61,
      w: breite,
      h: 0.05,
      fill: { color: F.navy },
      line: { color: F.navy },
    });
    s.addText(
      [
        {
          text: k.wert,
          options: {
            fontSize: k.wert.length > 8 ? 13 : 16,
            color: F.navy,
            breakLine: true,
          },
        },
        {
          text: k.label,
          options: { fontSize: 8, color: F.text, breakLine: !!k.hinweis },
        },
        ...(k.hinweis
          ? [{ text: k.hinweis, options: { fontSize: 7, color: F.textHell } }]
          : []),
      ],
      {
        x: x + 0.08,
        y: 1.72,
        w: breite - 0.16,
        h: 0.88,
        fontFace: SCHRIFT,
        valign: "top",
        margin: 0,
        fit: "shrink",
      },
    );
  });

  if (b.verlauf.some((v) => v.wert > 0))
    s.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Aktivitäten",
          labels: b.verlauf.map((v) => v.label),
          values: b.verlauf.map((v) => v.wert),
        },
      ],
      {
        x: 0.25,
        y: 2.85,
        w: 7.0,
        h: 2.35,
        barDir: "col",
        chartColors: [F.navy],
        barGapWidthPct: 60,
        showTitle: true,
        title: "Vermarktungsaktivitäten je Monat (Salesforce)",
        titleFontFace: SCHRIFT,
        titleFontSize: 10,
        titleColor: F.textHell,
        showValue: true,
        dataLabelFontSize: 8,
        dataLabelColor: F.text,
        catAxisLabelFontFace: SCHRIFT,
        catAxisLabelFontSize: 8,
        catAxisLabelColor: F.text,
        valAxisHidden: true,
        valGridLine: { style: "none" },
        catAxisLineShow: false,
        showLegend: false,
      },
    );

  const zeilen: Zelle[][] = [
    ["Angebote", "Kaufpreis", "Stand"].map((t, i) =>
      zelle(t, {
        fill: { color: F.navy },
        color: "FFFFFF",
        align: i === 1 ? "right" : "left",
      }),
    ),
    ...(b.angebote.length
      ? b.angebote
          .slice(0, 6)
          .map((a) => [
            zelle(a.bieter),
            zelle(euroKurz(a.betrag), { align: "right" }),
            zelle(a.stand),
          ])
      : [
          [
            zelle("Bisher liegen keine Kaufangebote vor.", {
              colspan: 3,
              color: F.textHell,
            }),
          ],
        ]),
  ];
  s.addTable(zeilen, {
    x: 0.35,
    y: 5.35,
    w: 6.85,
    colW: [3.1, 1.6, 2.15],
    rowH: 0.31,
  });

  s.addShape("rect", {
    x: 7.95,
    y: 1.61,
    w: 3.3,
    h: 1.35,
    fill: { color: F.navy },
    line: { color: F.navy },
  });
  s.addText(
    [
      { text: "Angebotspreis", options: { fontSize: 9, breakLine: true } },
      { text: euroKurz(b.angebotspreis), options: { fontSize: 22 } },
    ],
    {
      x: 8.15,
      y: 1.75,
      w: 2.95,
      h: 1.1,
      fontFace: SCHRIFT,
      color: "FFFFFF",
      valign: "middle",
      margin: 0,
    },
  );
  const hoechstes = b.kennzahlen.find((k) => k.label === "Höchstes Angebot");
  if (hoechstes)
    s.addText(
      [
        { text: "Höchstes Angebot", options: { fontSize: 9, breakLine: true } },
        {
          text: hoechstes.wert,
          options: { fontSize: 18, color: F.navy, breakLine: true },
        },
        {
          text: hoechstes.hinweis ?? "",
          options: { fontSize: 8, color: F.textHell },
        },
      ],
      {
        x: 7.95,
        y: 3.1,
        w: 3.3,
        h: 1.25,
        fontFace: SCHRIFT,
        color: F.text,
        fill: { color: "FFFFFF" },
        valign: "middle",
        margin: [10, 14, 10, 14],
      },
    );
}
