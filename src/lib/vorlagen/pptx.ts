/**
 * PPTX-Export (pptxgenjs) aus derselben Inhalts- und Design-Definition wie das PDF.
 * Eine Folie je Abschnitt; lange Tabellen werden auf Folgefolien umbrochen.
 */

import PptxGenJS from "pptxgenjs";

import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";

import type { Block, DesignVorlage, DokumentInhalt } from "./typen";

const farbe = (hex: string) => hex.replace("#", "");

function schriftName(art: "serif" | "sans"): string {
  return art === "serif" ? "Cormorant Garamond" : "Source Sans 3";
}

function blockText(b: Block): string[] {
  switch (b.art) {
    case "absatz":
      return [b.text];
    case "liste":
      return b.punkte.map((p) => `• ${p}`);
    case "luecke":
      return [`Fehlende Angabe: ${b.text}`];
    case "hinweis":
      return [b.text];
    default:
      return [];
  }
}

export async function dokumentAlsPptx(
  inhalt: DokumentInhalt,
  vorlage: DesignVorlage,
  logo?: string | null,
): Promise<Buffer> {
  const d = vorlage.design;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = d.firma.name;
  pptx.title = inhalt.titel;
  const titelSchrift = schriftName(d.schriften.titel);
  const textSchrift = schriftName(d.schriften.text);

  pptx.defineSlideMaster({
    title: "GRENZ",
    background: { color: "FFFFFF" },
    objects: [
      {
        rect: {
          x: 0,
          y: 7.1,
          w: 13.33,
          h: 0.4,
          fill: { color: farbe(d.farben.flaeche) },
        },
      },
      {
        text: {
          text: d.fusszeile,
          options: {
            x: 0.5,
            y: 7.12,
            w: 10,
            h: 0.35,
            fontSize: 8,
            color: farbe(d.farben.textHell),
            fontFace: textSchrift,
          },
        },
      },
    ],
    slideNumber: {
      x: 12.4,
      y: 7.12,
      fontSize: 8,
      color: farbe(d.farben.textHell),
    },
  });

  const deck = pptx.addSlide();
  deck.background = { color: farbe(d.farben.primaer) };
  deck.addImage({ data: logo ?? logoWeiss, x: 0.8, y: 0.7, w: 2.6, h: 0.75 });
  deck.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 3.0,
    w: 0.8,
    h: 0.05,
    fill: { color: farbe(d.farben.akzent) },
  });
  deck.addText(inhalt.titel, {
    x: 0.8,
    y: 3.2,
    w: 11.5,
    h: 1.2,
    fontSize: 36,
    color: "FFFFFF",
    fontFace: titelSchrift,
  });
  if (inhalt.untertitel) {
    deck.addText(inhalt.untertitel, {
      x: 0.8,
      y: 4.4,
      w: 11.5,
      h: 0.5,
      fontSize: 16,
      color: "DFE4EC",
      fontFace: textSchrift,
    });
  }
  deck.addText(`${d.firma.name} · ${d.firma.anschrift}`, {
    x: 0.8,
    y: 6.6,
    w: 11.5,
    h: 0.4,
    fontSize: 10,
    color: "C9D1DE",
    fontFace: textSchrift,
  });

  for (const a of inhalt.abschnitte) {
    let folie = pptx.addSlide({ masterName: "GRENZ" });
    const kopf = () => {
      folie.addText(a.titel, {
        x: 0.5,
        y: 0.35,
        w: 12,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: farbe(d.farben.primaer),
        fontFace: titelSchrift,
      });
      folie.addShape(pptx.ShapeType.rect, {
        x: 0.5,
        y: 0.95,
        w: 0.6,
        h: 0.04,
        fill: { color: farbe(d.farben.akzent) },
      });
    };
    kopf();
    let y = 1.2;

    for (const b of a.bloecke) {
      if (b.art === "kennzahlen") {
        const proZeile = 3;
        b.eintraege.forEach((e, i) => {
          const x = 0.5 + (i % proZeile) * 4.1;
          const yy = y + Math.floor(i / proZeile) * 0.85;
          folie.addText(
            [
              {
                text: e.label,
                options: {
                  fontSize: 10,
                  color: farbe(d.farben.textHell),
                  breakLine: true,
                },
              },
              {
                text: e.wert,
                options: {
                  fontSize: 16,
                  bold: true,
                  color: farbe(d.farben.text),
                },
              },
            ],
            { x, y: yy, w: 3.9, h: 0.8, fontFace: textSchrift, valign: "top" },
          );
        });
        y += Math.ceil(b.eintraege.length / proZeile) * 0.85 + 0.1;
      } else if (b.art === "tabelle") {
        const proFolie = 14;
        for (
          let start = 0;
          start < b.zeilen.length || start === 0;
          start += proFolie
        ) {
          if (start > 0) {
            folie = pptx.addSlide({ masterName: "GRENZ" });
            kopf();
            y = 1.2;
          }
          const zeilen = [
            b.kopf,
            ...b.zeilen.slice(start, start + proFolie),
          ].map((z, zi) =>
            z.map((t, i) => ({
              text: t,
              options: {
                bold: zi === 0,
                fill: { color: zi === 0 ? farbe(d.farben.flaeche) : "FFFFFF" },
                align: (b.ausrichtung?.[i] === "rechts" ? "right" : "left") as
                  "right" | "left",
              },
            })),
          );
          folie.addTable(zeilen, {
            x: 0.5,
            y,
            w: 12.3,
            fontSize: 9,
            fontFace: textSchrift,
            color: farbe(d.farben.text),
            border: { type: "solid", pt: 0.5, color: farbe(d.farben.linie) },
          });
          y += 0.3 * (Math.min(proFolie, b.zeilen.length - start) + 1) + 0.2;
          if (b.zeilen.length === 0) break;
        }
      } else if (b.art === "balken") {
        const max = Math.max(1, ...b.eintraege.map((e) => e.wert));
        b.eintraege.forEach((e, i) => {
          const yy = y + i * 0.45;
          folie.addText(e.label, {
            x: 0.5,
            y: yy,
            w: 2.8,
            h: 0.35,
            fontSize: 11,
            fontFace: textSchrift,
            color: farbe(d.farben.text),
          });
          folie.addShape(pptx.ShapeType.rect, {
            x: 3.4,
            y: yy + 0.05,
            w: Math.max(0.05, (e.wert / max) * 8),
            h: 0.25,
            fill: { color: farbe(d.farben.akzent) },
          });
          folie.addText(e.wert.toLocaleString("de-DE"), {
            x: 11.6,
            y: yy,
            w: 1.2,
            h: 0.35,
            fontSize: 11,
            bold: true,
            align: "right",
            fontFace: textSchrift,
          });
        });
        y += b.eintraege.length * 0.45 + 0.2;
      } else {
        const zeilen = blockText(b);
        if (!zeilen.length) continue;
        const hoehe = Math.min(
          5.6 - (y - 1.2),
          0.3 * Math.max(1, Math.ceil(zeilen.join(" ").length / 140)) + 0.2,
        );
        folie.addText(zeilen.join("\n"), {
          x: 0.5,
          y,
          w: 12.3,
          h: Math.max(0.4, hoehe),
          fontSize: 11,
          fontFace: textSchrift,
          color: b.art === "luecke" ? "8A2A2A" : farbe(d.farben.text),
          fill:
            b.art === "luecke"
              ? { color: "FBEEEE" }
              : b.art === "hinweis"
                ? { color: farbe(d.farben.flaeche) }
                : undefined,
          valign: "top",
        });
        y += Math.max(0.4, hoehe) + 0.1;
      }
      if (y > 6.6) {
        folie = pptx.addSlide({ masterName: "GRENZ" });
        kopf();
        y = 1.2;
      }
    }
  }

  const daten = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return daten;
}
