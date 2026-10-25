/**
 * Öffnen, Ändern und Speichern der Office-Vorlagen (ZIP-Pakete) mit JSZip.
 * Läuft im Browser (Bilder bleiben lokal) und in Tests unter Node.
 */

import JSZip from "jszip";

import {
  bildForm,
  bildPlatzhalterLeeren,
  elemente,
  findeForm,
  ersetzeBereich,
  type FormFinder,
} from "./ooxml";

export type Paket = JSZip;

export async function paketOeffnen(
  daten: Uint8Array | ArrayBuffer,
): Promise<Paket> {
  return JSZip.loadAsync(daten);
}

export async function lesen(paket: Paket, pfad: string): Promise<string> {
  const datei = paket.file(pfad);
  if (!datei) throw new Error(`Vorlage: ${pfad} fehlt.`);
  return datei.async("string");
}

export function schreiben(
  paket: Paket,
  pfad: string,
  inhalt: string | Uint8Array,
): void {
  paket.file(pfad, inhalt);
}

export async function paketSpeichern(paket: Paket): Promise<Uint8Array> {
  return paket.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/octet-stream",
  });
}

// ---------- PowerPoint ----------

export const folienPfad = (nr: number) => `ppt/slides/slide${nr}.xml`;
const relsPfad = (nr: number) => `ppt/slides/_rels/slide${nr}.xml.rels`;

export async function folieAendern(
  paket: Paket,
  nr: number,
  aendern: (xml: string) => string | Promise<string>,
): Promise<void> {
  const pfad = folienPfad(nr);
  schreiben(paket, pfad, await aendern(await lesen(paket, pfad)));
}

/** Entfernt Folien (Dateinummern der Vorlage) aus Präsentation, Beziehungen und Inhaltstypen. */
export async function folienEntfernen(
  paket: Paket,
  nummern: number[],
): Promise<void> {
  if (!nummern.length) return;
  let praes = await lesen(paket, "ppt/presentation.xml");
  let praesRels = await lesen(paket, "ppt/_rels/presentation.xml.rels");
  let typen = await lesen(paket, "[Content_Types].xml");
  for (const nr of nummern) {
    const rel =
      new RegExp(
        `<Relationship [^>]*Id="([^"]+)"[^>]*Target="slides/slide${nr}\\.xml"[^>]*/>`,
      ).exec(praesRels) ??
      new RegExp(
        `<Relationship [^>]*Target="slides/slide${nr}\\.xml"[^>]*Id="([^"]+)"[^>]*/>`,
      ).exec(praesRels);
    if (!rel) continue;
    praesRels = praesRels.replace(rel[0], "");
    praes = praes.replace(
      new RegExp(`<p:sldId [^>]*r:id="${rel[1]}"\\s*/>`),
      "",
    );
    // Notizen der Folie mit entfernen.
    const folienRels = paket.file(relsPfad(nr))
      ? await lesen(paket, relsPfad(nr))
      : "";
    const notiz = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(
      folienRels,
    )?.[1];
    if (notiz) {
      paket.remove(`ppt/notesSlides/${notiz}`);
      paket.remove(`ppt/notesSlides/_rels/${notiz}.rels`);
      typen = typen.replace(
        new RegExp(`<Override PartName="/ppt/notesSlides/${notiz}"[^>]*/>`),
        "",
      );
    }
    paket.remove(folienPfad(nr));
    paket.remove(relsPfad(nr));
    typen = typen.replace(
      new RegExp(`<Override PartName="/ppt/slides/slide${nr}\\.xml"[^>]*/>`),
      "",
    );
  }
  schreiben(paket, "ppt/presentation.xml", praes);
  schreiben(paket, "ppt/_rels/presentation.xml.rels", praesRels);
  schreiben(paket, "[Content_Types].xml", typen);
  await abschnitteBereinigen(paket);
}

/** Kopiert eine Folie und fügt sie direkt hinter `nachNr` ein. Liefert die neue Dateinummer. */
export async function folieDuplizieren(
  paket: Paket,
  nr: number,
  nachNr = nr,
): Promise<number> {
  const nummern = Object.keys(paket.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  const neu = Math.max(...nummern) + 1;
  schreiben(paket, folienPfad(neu), await lesen(paket, folienPfad(nr)));
  const rels = await lesen(paket, relsPfad(nr));
  schreiben(
    paket,
    relsPfad(neu),
    rels.replace(/<Relationship [^>]*notesSlide[^>]*\/>/, ""),
  );

  let praesRels = await lesen(paket, "ppt/_rels/presentation.xml.rels");
  const rIds = [...praesRels.matchAll(/Id="rId(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const rId = `rId${Math.max(...rIds) + 1}`;
  praesRels = praesRels.replace(
    "</Relationships>",
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${neu}.xml"/></Relationships>`,
  );
  let praes = await lesen(paket, "ppt/presentation.xml");
  const nachRel =
    new RegExp(`Id="([^"]+)"[^>]*Target="slides/slide${nachNr}\\.xml"`).exec(
      praesRels,
    ) ??
    new RegExp(`Target="slides/slide${nachNr}\\.xml"[^>]*Id="([^"]+)"`).exec(
      praesRels,
    );
  const ids = [...praes.matchAll(/<p:sldId id="(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const eintrag = `<p:sldId id="${Math.max(...ids) + 1}" r:id="${rId}"/>`;
  const nach = nachRel
    ? new RegExp(`<p:sldId [^>]*r:id="${nachRel[1]}"\\s*/>`).exec(praes)
    : null;
  praes = nach
    ? praes.replace(nach[0], nach[0] + eintrag)
    : praes.replace("</p:sldIdLst>", `${eintrag}</p:sldIdLst>`);
  schreiben(paket, "ppt/presentation.xml", praes);
  schreiben(paket, "ppt/_rels/presentation.xml.rels", praesRels);
  const typen = await lesen(paket, "[Content_Types].xml");
  schreiben(
    paket,
    "[Content_Types].xml",
    typen.replace(
      "</Types>",
      `<Override PartName="/ppt/slides/slide${neu}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    ),
  );
  return neu;
}

/** Abschnitte (p14:sectionLst) dürfen nur noch vorhandene Folien nennen. */
async function abschnitteBereinigen(paket: Paket): Promise<void> {
  let praes = await lesen(paket, "ppt/presentation.xml");
  const ids = new Set(
    [...praes.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]),
  );
  praes = praes.replace(/<p14:sldId id="(\d+)"\/>/g, (m, id) =>
    ids.has(id) ? m : "",
  );
  schreiben(paket, "ppt/presentation.xml", praes);
}

export type Bild = {
  daten: Uint8Array;
  /** jpeg oder png */
  endung: "jpeg" | "png";
  breite: number;
  hoehe: number;
};

const BILD_TYP: Record<Bild["endung"], string> = {
  jpeg: "image/jpeg",
  png: "image/png",
};

async function inhaltstypSicherstellen(
  paket: Paket,
  endung: string,
): Promise<void> {
  let typen = await lesen(paket, "[Content_Types].xml");
  if (new RegExp(`<Default Extension="${endung}"`, "i").test(typen)) return;
  typen = typen.replace(
    "<Default ",
    `<Default Extension="${endung}" ContentType="${BILD_TYP[endung as Bild["endung"]]}"/><Default `,
  );
  schreiben(paket, "[Content_Types].xml", typen);
}

let bildZaehler = 0;

/** Setzt ein Bild in eine Bildform oder einen Bildplatzhalter einer Folie (null = Platzhalter leeren). */
export async function bildSetzen(
  paket: Paket,
  folie: number,
  finder: FormFinder,
  bild: Bild | null,
): Promise<void> {
  let xml = await lesen(paket, folienPfad(folie));
  const form = findeForm(xml, finder);
  if (!form)
    throw new Error(
      `Vorlage: Bildrahmen ${JSON.stringify(finder)} fehlt auf Folie ${folie}.`,
    );
  if (!bild) {
    xml = ersetzeBereich(xml, form, bildPlatzhalterLeeren(form.xml));
    schreiben(paket, folienPfad(folie), xml);
    return;
  }
  await inhaltstypSicherstellen(paket, bild.endung);
  bildZaehler += 1;
  const datei = `ki-bild-${folie}-${bildZaehler}.${bild.endung}`;
  schreiben(paket, `ppt/media/${datei}`, bild.daten);
  let rels = await lesen(paket, relsPfad(folie));
  const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const rId = `rId${Math.max(0, ...ids) + 1}`;
  rels = rels.replace(
    "</Relationships>",
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${datei}"/></Relationships>`,
  );
  schreiben(paket, relsPfad(folie), rels);
  xml = ersetzeBereich(xml, form, bildForm(form.xml, rId, bild));
  schreiben(paket, folienPfad(folie), xml);
}

// ---------- Excel ----------

/** Rechenkette entfernen und Neuberechnung beim Öffnen erzwingen (nach Änderungen an Formeln). */
export async function excelNeuBerechnen(paket: Paket): Promise<void> {
  if (paket.file("xl/calcChain.xml")) {
    paket.remove("xl/calcChain.xml");
    const rels = await lesen(paket, "xl/_rels/workbook.xml.rels");
    schreiben(
      paket,
      "xl/_rels/workbook.xml.rels",
      rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, ""),
    );
    const typen = await lesen(paket, "[Content_Types].xml");
    schreiben(
      paket,
      "[Content_Types].xml",
      typen.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""),
    );
  }
  let wb = await lesen(paket, "xl/workbook.xml");
  wb = /<calcPr /.test(wb)
    ? wb.replace(
        /<calcPr ([^>]*?)\/>/,
        (_m, a: string) =>
          `<calcPr ${a.replace(/\s*fullCalcOnLoad="\d"/, "")} fullCalcOnLoad="1"/>`,
      )
    : wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  schreiben(paket, "xl/workbook.xml", wb);
}

/** Hängt Zellformate an cellXfs an und liefert ihre Indizes. */
export function zellformateAnhaengen(
  styles: string,
  xfs: string[],
): { styles: string; indizes: number[] } {
  const block = elemente(styles, "cellXfs")[0];
  if (!block) throw new Error("Vorlage: cellXfs fehlt.");
  const anzahl = elemente(block.xml, "xf").length;
  const neu = block.xml
    .replace(/count="\d+"/, `count="${anzahl + xfs.length}"`)
    .replace("</cellXfs>", `${xfs.join("")}</cellXfs>`);
  return {
    styles: ersetzeBereich(styles, block, neu),
    indizes: xfs.map((_, i) => anzahl + i),
  };
}

/** Hängt eine Füllung an und liefert ihren Index. */
export function fuellungAnhaengen(
  styles: string,
  rgb: string,
): { styles: string; index: number } {
  const block = elemente(styles, "fills")[0];
  if (!block) throw new Error("Vorlage: fills fehlt.");
  const anzahl = elemente(block.xml, "fill").length;
  const neu = block.xml
    .replace(/count="\d+"/, `count="${anzahl + 1}"`)
    .replace(
      "</fills>",
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill></fills>`,
    );
  return { styles: ersetzeBereich(styles, block, neu), index: anzahl };
}
