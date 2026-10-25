/**
 * PowerPoint-Ausgaben aus den Original-Vorlagen von Grenz & Co.:
 * Exposé (GrenzCo_Exposé Vorlage) und Vermarktungseinschätzung (GC Einschätzung).
 * Master, Schriften, Farben, Kontaktseite, AGB und Widerrufsbelehrung bleiben unverändert.
 */

import {
  absaetzeNachVorbild,
  elemente,
  ersetzeBereich,
  findeForm,
  formAendern,
  formEntfernen,
  spaltenEntfernen,
  tabelleFuellen,
  tabellenZeilen,
  textSetzen,
  zeileWie,
  zeilenErsetzen,
  type FormFinder,
} from "../ooxml";
import {
  bildSetzen,
  folieAendern,
  folieDuplizieren,
  folienEntfernen,
  lesen,
  folienPfad,
  paketOeffnen,
  paketSpeichern,
  type Bild,
  type Paket,
} from "../paket";
import {
  euro,
  fach,
  flaeche,
  mietSummen,
  mio,
  proM2,
  prozent,
  zahl,
  datumLang,
} from "../rechnen";
import type {
  Angabe,
  ExposeDaten,
  MarktpreisDaten,
  Mieteinheit,
} from "../typen";

export type BildDatei = Bild & { name: string };

const w = <T>(a: Angabe<T> | undefined): T | null => a?.wert ?? null;

/** Bilder nach Dateinamen sortieren: Grundrisse, Lagekarten, Fotos. */
export function bilderEinteilen(bilder: BildDatei[]): {
  fotos: BildDatei[];
  grundrisse: BildDatei[];
  karten: BildDatei[];
} {
  const grundrisse: BildDatei[] = [];
  const karten: BildDatei[] = [];
  const fotos: BildDatei[] = [];
  for (const b of bilder) {
    const n = b.name.toLowerCase();
    if (/grundriss|floor|plan_|_plan|\bgr\b|schnitt/.test(n))
      grundrisse.push(b);
    else if (/karte|lageplan|makro|mikro|map|stadtplan|luftbild/.test(n))
      karten.push(b);
    else fotos.push(b);
  }
  return { fotos, grundrisse, karten };
}

export function geschossAusName(name: string): string {
  const n = name.toLowerCase();
  if (/\bkg\b|keller|untergeschoss|\bug\b/.test(n)) return "KELLERGESCHOSS";
  if (/\bdg\b|dachgeschoss|dach/.test(n)) return "DACHGESCHOSS";
  const og = /(\d)\.?\s*(og|obergeschoss)/.exec(n);
  if (og) return `${og[1]}. OBERGESCHOSS`;
  if (/\bog\b|obergeschoss/.test(n)) return "OBERGESCHOSS";
  if (/\beg\b|erdgeschoss/.test(n)) return "ERDGESCHOSS";
  return "GRUNDRISS";
}

async function textAufFolie(
  paket: Paket,
  nr: number,
  finder: FormFinder,
  text: string,
): Promise<void> {
  await folieAendern(paket, nr, (xml) =>
    formAendern(xml, finder, (f) => textSetzen(f, text)),
  );
}

/** Untertitel „Objektart | Straße | PLZ Ort“ auf allen Folien ersetzen. */
async function untertitelUeberall(
  paket: Paket,
  folien: number[],
  beginn: string,
  text: string,
): Promise<void> {
  for (const nr of folien) {
    if (!paket.file(folienPfad(nr))) continue;
    await folieAendern(paket, nr, (xml) => {
      const b = findeForm(xml, { textBeginn: beginn });
      return b ? ersetzeBereich(xml, b, textSetzen(b.xml, text)) : xml;
    });
  }
}

/** Füllt Bildrahmen der Reihe nach; übrige Rahmen werden geleert. */
async function bilderInRahmen(
  paket: Paket,
  nr: number,
  rahmen: FormFinder[],
  bilder: (Bild | undefined)[],
): Promise<void> {
  for (let i = 0; i < rahmen.length; i++)
    await bildSetzen(paket, nr, rahmen[i], bilder[i] ?? null);
}

async function tabelle(
  paket: Paket,
  nr: number,
  name: string,
  aendern: (frame: string) => string,
): Promise<void> {
  await folieAendern(paket, nr, (xml) => formAendern(xml, { name }, aendern));
}

/** Zeilen einer 2-spaltigen Tabelle füllen und leere Zeilen entfernen. */
function wertTabelle(
  frame: string,
  werte: Record<number, string | undefined>,
  behalten: number[] = [],
): string {
  const zeilen = tabellenZeilen(frame);
  let ergebnis = tabelleFuellen(
    frame,
    zeilen.map((_, i) => (werte[i] !== undefined ? [undefined, werte[i]] : [])),
  );
  const weg = Object.entries(werte)
    .filter(([i, v]) => !v && !behalten.includes(Number(i)))
    .map(([i]) => Number(i))
    .sort((a, b) => b - a);
  for (const i of weg) ergebnis = zeilenErsetzen(ergebnis, i, i + 1, []);
  return ergebnis;
}

// ---------- Exposé ----------

const MIETER_PRO_FOLIE = 11;

function mieterZeilen(mieter: Mieteinheit[]): string[][] {
  const parken = mieter.filter(
    (m) => m.nutzung === "Stellplatz" || m.nutzung === "Garagenstellplatz",
  );
  const zeilen = mieter
    .filter((m) => !parken.includes(m))
    .map((m) => {
      const miete = m.belegung === "vermietet" ? m.kaltmieteIst : null;
      return [
        m.lage,
        m.belegung === "leer" ? `${m.nutzung} (leer)` : m.nutzung,
        flaeche(m.flaeche),
        m.belegung === "leer" ? "Leerstand" : euro(miete),
        miete != null && m.flaeche ? proM2(miete / m.flaeche) : "",
        m.vertragBeginn ? m.vertragBeginn.slice(0, 4) : "",
        m.laufzeit,
        m.info,
      ];
    });
  if (parken.length) {
    const vermietet = parken.filter((p) => p.belegung === "vermietet");
    zeilen.push([
      parken.length === 1 ? parken[0].lage : "Stellplätze",
      `${parken.length} ${parken.some((p) => p.nutzung === "Garagenstellplatz") ? "Stellplätze / Garagen" : "Stellplätze"}`,
      "",
      euro(vermietet.reduce((s, p) => s + (p.kaltmieteIst ?? 0), 0)),
      "",
      "",
      "",
      vermietet.length < parken.length
        ? `${parken.length - vermietet.length} frei`
        : "",
    ]);
  }
  return zeilen;
}

export async function exposeErstellen(
  vorlage: Uint8Array,
  d: ExposeDaten,
  bilder: BildDatei[],
): Promise<Uint8Array> {
  const paket = await paketOeffnen(vorlage);
  const { fotos, grundrisse, karten } = bilderEinteilen(bilder);
  const summen = mietSummen(d.mieter);
  const strasse = w(d.objekt.strasse) ?? "";
  const plzOrt = [w(d.objekt.plz), w(d.objekt.ort)].filter(Boolean).join(" ");
  const objektart = w(d.objekt.objektart) ?? "Immobilie";
  const untertitel = [objektart, strasse, plzOrt].filter(Boolean).join(" | ");
  const entfernen = new Set<number>();

  // 1 Titel
  const ortZeile = [w(d.objekt.ort), w(d.objekt.stadtteil)]
    .filter(Boolean)
    .join(" ");
  const titel = (w(d.titelzeile) ?? objektart)
    .split("\n")
    .filter(Boolean)
    .slice(0, 3);
  await folieAendern(paket, 1, (xml) =>
    formAendern(xml, { name: "Textfeld 1" }, (f) =>
      absaetzeNachVorbild(f, [
        { vorbild: 0, text: ortZeile },
        { vorbild: 1, text: " " },
        ...titel.map((t) => ({ vorbild: 2, text: t })),
        { vorbild: 4, text: " " },
        { vorbild: 5, text: strasse },
        { vorbild: 6, text: plzOrt },
      ]),
    ),
  );
  await bildSetzen(paket, 1, { name: "Bildplatzhalter 3" }, fotos[0] ?? null);

  // 2 Investment und Objektdaten
  const mieteIst =
    w(d.mieteJahrIst) ??
    (summen.mieteMonatIst ? summen.mieteMonatIst * 12 : null);
  const mieteSoll =
    w(d.mieteJahrSoll) ??
    (summen.mieteMonatSoll ? summen.mieteMonatSoll * 12 : null);
  const kaufpreis = w(d.kaufpreis);
  const flaecheGesamt = w(d.flaecheGesamt) ?? (summen.flaecheGesamt || null);
  const faktoren = [
    kaufpreis && mieteIst ? kaufpreis / mieteIst : null,
    kaufpreis && mieteSoll ? kaufpreis / mieteSoll : null,
  ];
  const faktorText =
    faktoren[0] && faktoren[1] && Math.abs(faktoren[0] - faktoren[1]) > 0.05
      ? `${zahl(faktoren[0], 1)} / ${fach(faktoren[1])}`
      : fach(faktoren[0] ?? faktoren[1]);
  const vermietung = w(d.vermietungsstand) ?? summen.vermietungsstand;
  const we = w(d.wohneinheiten) ?? (summen.wohneinheiten || null);
  const ge = w(d.gewerbeeinheiten) ?? (summen.gewerbeeinheiten || null);
  const fw = w(d.flaecheWohnen) ?? (summen.flaecheWohnen || null);
  const fg = w(d.flaecheGewerbe) ?? (summen.flaecheGewerbe || null);
  await tabelle(paket, 2, "Tabelle 7", (frame) => {
    let f = tabelleFuellen(frame, [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ["Bodenrichtwert"],
    ]);
    f = wertTabelle(
      f,
      {
        1: kaufpreis ? euro(kaufpreis) : "auf Anfrage",
        2: euro(mieteIst),
        3: euro(mieteSoll),
        4: prozent(vermietung),
        5: faktorText,
        6:
          kaufpreis && flaecheGesamt
            ? `ca. ${zahl(kaufpreis / flaecheGesamt, 0)} €/m²`
            : "",
        7:
          d.provision === "provisionsfrei"
            ? "provisionsfrei"
            : "provisionspflichtig",
        9: flaeche(w(d.grundstueck), true),
        10: w(d.bodenrichtwert) ?? "",
        11: flaeche(flaecheGesamt, true),
        12: we != null ? String(we) : "",
        13: flaeche(fw, true),
        14: summen.mieteM2Wohnen ? proM2(summen.mieteM2Wohnen) : "",
        15: ge ? String(ge) : "",
        16: ge ? flaeche(fg, true) : "",
        17: ge && summen.mieteM2Gewerbe ? proM2(summen.mieteM2Gewerbe) : "",
        18: w(d.sonstigeFlaechen) ? flaeche(w(d.sonstigeFlaechen), true) : "",
        19:
          (w(d.stellplaetze) ?? summen.stellplaetze)
            ? String(w(d.stellplaetze) ?? summen.stellplaetze)
            : "",
      },
      [1],
    );
    return f;
  });
  await bildSetzen(paket, 2, { name: "Bildplatzhalter 1" }, fotos[1] ?? null);

  // 3 Weitere Objektinformationen
  const besonderheiten = d.besonderheiten
    .map((b) => b.wert)
    .filter(Boolean) as string[];
  await tabelle(paket, 3, "Tabelle 7", (frame) => {
    let f = frame;
    const zeilen = tabellenZeilen(f);
    const letzte = zeilen.length - 1;
    f = tabelleFuellen(
      f,
      zeilen.map((_, i) =>
        i === letzte
          ? [
              besonderheiten.length
                ? `Besonderheiten:\n\n${besonderheiten.join("\n\n")}`
                : "",
            ]
          : [],
      ),
    );
    return wertTabelle(f, {
      1: w(d.baujahr) ?? "",
      2: w(d.geschosse) ?? "",
      3: w(d.bauweise) ?? "",
      4: w(d.geschossdecken) ?? "",
      5: w(d.fenster) ?? "",
      6: w(d.heizsystem) ?? "",
      7: w(d.energietraeger) ?? "",
      8: w(d.baujahrHeizung) ?? "",
      9: w(d.balkone) ?? "",
      10: w(d.aufzug) ?? "",
      11: w(d.dachgeschoss) ?? "",
      12: w(d.denkmalschutz) ?? "",
      ...(besonderheiten.length ? {} : { [letzte]: "" }),
    });
  });
  await bildSetzen(paket, 3, { name: "Bildplatzhalter 1" }, fotos[2] ?? null);

  // 4 Mieterübersicht (bei vielen Einheiten auf mehrere Folien verteilt)
  const zeilen = mieterZeilen(d.mieter);
  if (!zeilen.length) entfernen.add(4);
  else {
    const seiten: string[][][] = [];
    for (let i = 0; i < zeilen.length; i += MIETER_PRO_FOLIE)
      seiten.push(zeilen.slice(i, i + MIETER_PRO_FOLIE));
    const folien = [4];
    for (let i = 1; i < seiten.length; i++)
      folien.push(await folieDuplizieren(paket, 4, folien[folien.length - 1]));
    const summe = [
      "Gesamt",
      "",
      flaeche(summen.flaecheGesamt),
      euro(summen.mieteMonatIst),
      "",
      "",
      "",
      "",
    ];
    const jahr = [
      "Pro Jahr",
      "",
      "",
      euro(summen.mieteMonatIst * 12),
      "",
      "",
      "",
      "",
    ];
    for (let s = 0; s < seiten.length; s++) {
      const letzte = s === seiten.length - 1;
      await tabelle(paket, folien[s], "Tabelle 1", (frame) => {
        const tz = tabellenZeilen(frame);
        const vorlage = tz[1].xml;
        const neu = seiten[s].map((z) => zeileWie(vorlage, z));
        if (letzte)
          neu.push(zeileWie(tz[6].xml, summe), zeileWie(tz[7].xml, jahr));
        return zeilenErsetzen(frame, 1, tz.length, neu);
      });
    }
  }

  // 5–8 Impressionen
  const impressionen: { nr: number; rahmen: string[] }[] = [
    {
      nr: 5,
      rahmen: ["Bildplatzhalter 1", "Bildplatzhalter 4", "Bildplatzhalter 5"],
    },
    { nr: 6, rahmen: ["Bildplatzhalter 11", "Bildplatzhalter 12"] },
    {
      nr: 7,
      rahmen: [
        "Bildplatzhalter 6",
        "Bildplatzhalter 7",
        "Bildplatzhalter 11",
        "Bildplatzhalter 8",
      ],
    },
    { nr: 8, rahmen: ["Bildplatzhalter 4", "Bildplatzhalter 5"] },
  ];
  let fotoNr = 3;
  for (const imp of impressionen) {
    const teil = fotos.slice(fotoNr, fotoNr + imp.rahmen.length);
    if (!teil.length) {
      entfernen.add(imp.nr);
      continue;
    }
    fotoNr += teil.length;
    await bilderInRahmen(
      paket,
      imp.nr,
      imp.rahmen.map((name) => ({ name })),
      teil,
    );
  }
  if (!entfernen.has(8))
    await textAufFolie(
      paket,
      8,
      { name: "Textplatzhalter 6" },
      "OBJEKTINFORMATIONEN",
    );

  // 9–10 Grundrisse
  if (!grundrisse.length) {
    entfernen.add(9);
    entfernen.add(10);
  } else {
    const folien = [9, 10];
    for (let i = 2; i < grundrisse.length; i++)
      folien.push(await folieDuplizieren(paket, 10, folien[folien.length - 1]));
    for (let i = 0; i < folien.length; i++) {
      const g = grundrisse[i];
      if (!g) {
        entfernen.add(folien[i]);
        continue;
      }
      await bildSetzen(paket, folien[i], { name: "Bildplatzhalter 3" }, g);
      await textAufFolie(
        paket,
        folien[i],
        { name: "Textfeld 199" },
        geschossAusName(g.name),
      );
    }
  }

  // 11 Makrolage
  if (!d.erreichbarkeit.length && !karten[0]) entfernen.add(11);
  else {
    await bildSetzen(
      paket,
      11,
      { name: "Bildplatzhalter 4" },
      karten[0] ?? null,
    );
    if (d.erreichbarkeit.length) {
      await tabelle(paket, 11, "Tabelle 2", (frame) => {
        const tz = tabellenZeilen(frame);
        const neu = d.erreichbarkeit
          .slice(0, 8)
          .map((e) =>
            zeileWie(tz[1].xml, [
              e.ziel,
              e.minuten != null ? String(e.minuten) : "",
              "min",
              e.verkehrsmittel,
            ]),
          );
        return zeilenErsetzen(frame, 1, tz.length, neu);
      });
    } else {
      await folieAendern(paket, 11, (xml) =>
        formEntfernen(xml, { name: "Tabelle 2" }),
      );
    }
  }

  // 12 Mikrolage
  const mikro = w(d.mikrolage);
  if (!mikro && karten.length < 2) entfernen.add(12);
  else {
    await folieAendern(paket, 12, (xml) =>
      formAendern(xml, { name: "Textfeld 308" }, (f) =>
        absaetzeNachVorbild(f, [
          {
            vorbild: 0,
            text: `Stadtteil: ${w(d.objekt.stadtteil) ?? w(d.objekt.ort) ?? ""}`,
          },
          ...(mikro ?? "")
            .split("\n")
            .filter(Boolean)
            .map((t) => ({ vorbild: 1, text: t })),
        ]),
      ),
    );
    await bilderInRahmen(
      paket,
      12,
      [{ name: "Bildplatzhalter 4" }, { name: "Bildplatzhalter 5" }],
      karten.slice(1, 3),
    );
  }

  // 14–16 Provision, Disclaimer, Energieausweis
  const energie = [
    w(d.ausweistyp),
    w(d.energiekennwert),
    w(d.energietraeger),
    w(d.baujahrHeizung),
    w(d.effizienzklasse),
  ];
  const mitEnergie = Boolean(
    w(d.ausweistyp) || w(d.energiekennwert) || w(d.effizienzklasse),
  );
  if (mitEnergie) {
    entfernen.add(14);
    entfernen.add(15);
    await tabelle(paket, 16, "Tabelle 3", (frame) =>
      tabelleFuellen(
        frame,
        energie.map((v) => [undefined, v ?? "liegt nicht vor"]),
      ),
    );
    if (d.provision === "provisionsfrei") {
      const frei = await lesen(paket, folienPfad(14));
      const quelle = findeForm(frei, { textBeginn: "Provision" });
      if (quelle) {
        await folieAendern(paket, 16, (xml) => {
          const ziel = findeForm(xml, { textBeginn: "Provision" });
          if (!ziel) return xml;
          const body = elemente(quelle.xml, "p:txBody")[0].xml;
          const alt = elemente(ziel.xml, "p:txBody")[0];
          return ersetzeBereich(xml, ziel, ersetzeBereich(ziel.xml, alt, body));
        });
      }
    }
  } else {
    entfernen.add(16);
    entfernen.add(d.provision === "provisionsfrei" ? 15 : 14);
  }

  await untertitelUeberall(
    paket,
    Array.from({ length: 40 }, (_, i) => i + 1),
    "Wohn- und Geschäftshaus |",
    untertitel,
  );
  await folienEntfernen(paket, [...entfernen]);
  return paketSpeichern(paket);
}

// ---------- Vermarktungseinschätzung ----------

export async function einschaetzungErstellen(
  vorlage: Uint8Array,
  d: MarktpreisDaten,
  bilder: BildDatei[],
): Promise<Uint8Array> {
  const paket = await paketOeffnen(vorlage);
  const { fotos } = bilderEinteilen(bilder);
  const objekte = d.objekte.slice(0, 3);
  if (!objekte.length)
    throw new Error("Keine Liegenschaft für die Einschätzung.");
  const entfernen = new Set<number>([3]);
  const ueberzaehlig = [3, 2, 1].filter((s) => s > objekte.length);

  // 1 Titel
  await folieAendern(paket, 1, (xml) => {
    let x = formAendern(xml, { name: "Untertitel 24", nr: 0 }, (f) =>
      absaetzeNachVorbild(
        f,
        objekte.map((o) => ({ vorbild: 0, text: o.bezeichnung })),
      ),
    );
    x = formAendern(x, { name: "Untertitel 24", nr: 1 }, (f) =>
      textSetzen(f, d.empfaenger),
    );
    x = formAendern(x, { name: "Textfeld 8" }, (f) =>
      textSetzen(f, datumLang(d.datum)),
    );
    return x;
  });
  if (fotos[0]) await bildSetzen(paket, 1, { name: "Grafik 4" }, fotos[0]);

  // 4 Impressionen
  const imp = fotos.slice(1, 4);
  if (!imp.length) entfernen.add(4);
  else {
    const rahmen = ["Bildplatzhalter 22", "Grafik 24", "Grafik 26"];
    const texte = ["Textfeld 29", "Textfeld 30", "Textfeld 31"];
    for (let i = 0; i < 3; i++) {
      if (imp[i]) await bildSetzen(paket, 4, { name: rahmen[i] }, imp[i]);
      else
        await folieAendern(paket, 4, (xml) =>
          formEntfernen(xml, { name: rahmen[i] }),
        );
      const unterschrift =
        objekte.length > 1 ? (objekte[i]?.bezeichnung ?? "") : "";
      if (imp[i] && unterschrift)
        await textAufFolie(paket, 4, { name: texte[i] }, unterschrift);
      else
        await folieAendern(paket, 4, (xml) =>
          formEntfernen(xml, { name: texte[i] }),
        );
    }
  }

  // 5 Key Facts
  const spalte = (f: (o: (typeof objekte)[number]) => string) => objekte.map(f);
  await folieAendern(paket, 5, (xml) =>
    formAendern(xml, { textBeginn: "Drei Wohn- und" }, (f) =>
      textSetzen(f, d.untertitel),
    ),
  );
  await tabelle(paket, 5, "Tabellenplatzhalter 11", (frame) => {
    const qm = (o: (typeof objekte)[number]) => {
      const fw = o.flaecheWohnen.wert ?? 0;
      const fg = o.flaecheGewerbe.wert ?? 0;
      return { fw, fg, gesamt: fw + fg };
    };
    const reihen: string[][] = [
      ["Liegenschaft", ...spalte((o) => o.bezeichnung)],
      ["Grundstücksgröße", ...spalte((o) => flaeche(o.grundstueck.wert, true))],
      [
        "Anzahl Wohneinheiten",
        ...spalte((o) =>
          o.wohneinheiten.wert != null ? String(o.wohneinheiten.wert) : "",
        ),
      ],
      [
        "Anzahl Gewerbeeinheiten",
        ...spalte((o) => o.gewerbeeinheiten.wert ?? ""),
      ],
      [
        "Gesamtmietfläche",
        ...spalte((o) => flaeche(qm(o).gesamt || null, true)),
      ],
      [
        "Mietfläche Wohnen",
        ...spalte((o) => flaeche(o.flaecheWohnen.wert, true)),
      ],
      [
        "Mietfläche Gewerbe",
        ...spalte((o) => flaeche(o.flaecheGewerbe.wert, true)),
      ],
      [
        "Nettokaltmiete pro Jahr Ist",
        ...spalte((o) => euro(o.mieteJahrIst.wert)),
      ],
      [
        "Nettokaltmiete pro Jahr SOLL",
        ...spalte((o) => euro(o.mieteJahrSoll.wert ?? o.mieteJahrIst.wert)),
      ],
      [
        "Durchschnittsmiete Wohnen IST",
        ...spalte((o) => proM2(o.mieteM2Wohnen.wert)),
      ],
      [
        "Durchschnittsmiete Gewerbe IST",
        ...spalte((o) => proM2(o.mieteM2Gewerbe.wert)),
      ],
      [
        "\nBesonderheiten\n",
        ...spalte((o) =>
          o.besonderheiten.length ? `\n${o.besonderheiten.join("\n\n")}` : "",
        ),
      ],
    ];
    let f = tabelleFuellen(frame, reihen);
    // Zeilen ohne Werte entfernen (außer Kopf).
    const leer = reihen
      .map((r, i) => (i > 0 && r.slice(1).every((v) => !v.trim()) ? i : -1))
      .filter((i) => i > 0)
      .sort((a, b) => b - a);
    for (const i of leer) f = zeilenErsetzen(f, i, i + 1, []);
    return spaltenEntfernen(f, ueberzaehlig);
  });

  // 6 Vergleichstransaktionen
  const vergleiche = d.vergleiche.slice(0, 3);
  if (!vergleiche.length) entfernen.add(6);
  else {
    const boxen = [
      { daten: "Textfeld 8", einordnung: "Textfeld 6" },
      { daten: "Textfeld 10", einordnung: "Textfeld 7" },
      { daten: "Textfeld 15", einordnung: "Textfeld 17" },
    ];
    await folieAendern(paket, 6, (xml) => {
      let x = xml;
      boxen.forEach((b, i) => {
        const v = vergleiche[i];
        if (!v) {
          x = formEntfernen(x, { name: b.daten });
          x = formEntfernen(x, { name: b.einordnung });
          return;
        }
        const faktor = v.preis && v.mieteJahr ? v.preis / v.mieteJahr : null;
        const qm = v.preis && v.flaeche ? v.preis / v.flaeche : null;
        x = formAendern(x, { name: b.daten }, (f) =>
          absaetzeNachVorbild(f, [
            { vorbild: 0, text: v.adresse },
            { vorbild: 1, text: v.objektart },
            {
              vorbild: 2,
              text: [
                v.flaeche ? `Mietfläche: ${zahl(v.flaeche)} m²` : "",
                v.mieteJahr ? `JNKM: ${zahl(v.mieteJahr)} €` : "",
              ]
                .filter(Boolean)
                .join(" I "),
            },
            {
              vorbild: 3,
              text: `${v.preisart === "angebot" ? "Angebotspreis" : "Kaufpreis"}: ${v.preis ? mio(v.preis).replace(" €", "€") : "k. A."}`,
            },
            ...(faktor
              ? [{ vorbild: 4, text: `Kaufpreisfaktor\t${fach(faktor)}` }]
              : []),
            ...(qm
              ? [{ vorbild: 5, text: `Kaufpreis pro m²\t${zahl(qm)} €/m²` }]
              : []),
          ]),
        );
        const quelle =
          v.beleg?.art === "web"
            ? `Quelle: ${hostVon(v.beleg.url)}`
            : v.beleg?.art === "dokument"
              ? `Quelle: ${v.beleg.unterlage}`
              : v.beleg?.art === "berechnung"
                ? "Quelle: Grenz-Vergleichsdaten"
                : "";
        x = formAendern(x, { name: b.einordnung }, (f) =>
          absaetzeNachVorbild(f, [
            { vorbild: 0, text: "Einordnung:" },
            ...[...v.einordnung, ...(quelle ? [quelle] : [])].map((t) => ({
              vorbild: 1,
              text: t,
            })),
          ]),
        );
      });
      if (vergleiche[2]?.preisart !== "angebot")
        x = formEntfernen(x, { name: "Textfeld 24" });
      const alleVerkauft = vergleiche.every((v) => v.preisart === "kauf");
      return formAendern(
        x,
        { textBeginn: "Vergleichbare Liegenschaften" },
        (f) =>
          textSetzen(
            f,
            alleVerkauft
              ? "Vergleichbare Liegenschaften kürzlich verkauft"
              : "Vergleichbare Liegenschaften im Markt",
          ),
      );
    });
  }

  // 7 Preisfindung
  const mitEigentuemer = objekte.some((o) => o.preisEigentuemer.wert);
  await tabelle(paket, 7, "Tabellenplatzhalter 11", (frame) => {
    const qmVon = (o: (typeof objekte)[number]) =>
      (o.flaecheWohnen.wert ?? 0) + (o.flaecheGewerbe.wert ?? 0);
    const block = (
      preis: (o: (typeof objekte)[number]) => number | null,
      anmerkung: boolean,
    ) => [
      spalte((o) => mio(preis(o))),
      spalte((o) =>
        preis(o) && o.mieteJahrIst.wert
          ? fach(preis(o)! / o.mieteJahrIst.wert)
          : "",
      ),
      spalte((o) => {
        const p = preis(o);
        const q = qmVon(o);
        const t = p && q ? `${zahl(p / q)} €/m²` : "";
        return anmerkung && o.preisAnmerkung ? `${t} (${o.preisAnmerkung})` : t;
      }),
    ];
    const g = block((o) => o.preisGrenz.wert, true);
    const e = block((o) => o.preisEigentuemer.wert, false);
    let f = tabelleFuellen(frame, [
      ["Liegenschaft", ...spalte((o) => o.bezeichnung)],
      [undefined, ...g[0]],
      [undefined, ...g[1]],
      [undefined, ...g[2]],
      [],
      [`Einschätzung ${d.empfaenger || "Eigentümer"}`, ...e[0]],
      [undefined, ...e[1]],
      [undefined, ...e[2]],
    ]);
    if (!mitEigentuemer) f = zeilenErsetzen(f, 4, 8, []);
    return spaltenEntfernen(f, ueberzaehlig);
  });
  await folieAendern(paket, 7, (xml) => {
    let x = formAendern(xml, { name: "Textfeld 13" }, (f) =>
      absaetzeNachVorbild(f, [
        { vorbild: 0, text: "Zusammenfassung:" },
        ...d.zusammenfassung.map((t) => ({ vorbild: 1, text: t })),
      ]),
    );
    x = formAendern(x, { name: "Textfeld 15" }, (f) =>
      absaetzeNachVorbild(
        f,
        d.vorgehen.map((t, i) => ({ vorbild: i === 0 ? 0 : 1, text: t })),
      ),
    );
    return x;
  });

  await folienEntfernen(paket, [...entfernen]);
  return paketSpeichern(paket);
}

function hostVon(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
