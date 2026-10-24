/**
 * PDF-Rendering (serverseitig, @react-pdf/renderer) aus DokumentInhalt + DesignVorlage.
 * Schriften: eingebaute PDF-Schriften (Times für Titel, Helvetica für Text), damit keine
 * Schriftdateien im Server-Bundle liegen müssen.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";

import type { Block, DesignVorlage, DokumentInhalt, SchriftArt } from "./typen";

function schrift(art: SchriftArt, fett = false): string {
  if (art === "serif") return fett ? "Times-Bold" : "Times-Roman";
  return fett ? "Helvetica-Bold" : "Helvetica";
}

function datumDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}

function stile(v: DesignVorlage) {
  const f = v.design.farben;
  const text = v.design.schriften.text;
  const titel = v.design.schriften.titel;
  return StyleSheet.create({
    seite: {
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: 48,
      fontFamily: schrift(text),
      fontSize: 9.5,
      color: f.text,
    },
    inhalt: { lineHeight: 1.45 },
    deckblatt: {
      padding: 0,
      fontFamily: schrift(text),
      color: "#ffffff",
      backgroundColor: f.primaer,
    },
    deckInnen: {
      flex: 1,
      paddingHorizontal: 56,
      paddingTop: 64,
      paddingBottom: 56,
      justifyContent: "space-between",
    },
    logo: { width: 150 },
    deckTitel: {
      fontFamily: schrift(titel),
      fontSize: 30,
      lineHeight: 1.15,
      marginBottom: 10,
    },
    deckUntertitel: { fontSize: 12, color: "#dfe4ec" },
    deckLinie: {
      width: 48,
      height: 2,
      backgroundColor: f.akzent,
      marginBottom: 18,
    },
    deckFuss: { fontSize: 8, color: "#c9d1de" },
    kopf: {
      position: "absolute",
      top: 22,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: f.textHell,
      borderBottomWidth: 0.5,
      borderBottomColor: f.linie,
      paddingBottom: 6,
    },
    fussText: {
      position: "absolute",
      bottom: 26,
      left: 48,
      right: 48,
      fontSize: 7,
      color: f.textHell,
      borderTopWidth: 0.5,
      borderTopColor: f.linie,
      paddingTop: 6,
    },
    fussSeite: {
      position: "absolute",
      bottom: 28,
      right: 48,
      fontSize: 7,
      color: f.textHell,
    },
    stempel: { color: f.akzent, fontFamily: schrift(text, true) },
    abschnitt: { marginBottom: 16 },
    abschnittTitel: {
      fontFamily: schrift(titel, true),
      fontSize: 15,
      color: f.primaer,
      marginBottom: 4,
    },
    abschnittLinie: {
      width: 28,
      height: 1.5,
      backgroundColor: f.akzent,
      marginBottom: 8,
    },
    absatz: { marginBottom: 6 },
    quelleNr: { fontSize: 6.5, color: f.akzent },
    kennzahlen: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
    kennzahl: {
      width: "33.33%",
      paddingVertical: 6,
      paddingRight: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: f.linie,
    },
    kennzahlLabel: { fontSize: 7.5, color: f.textHell, marginBottom: 2 },
    kennzahlWert: { fontFamily: schrift(text, true), fontSize: 11 },
    tabelle: { marginBottom: 8, borderTopWidth: 0.5, borderTopColor: f.linie },
    tabZeile: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: f.linie,
      paddingVertical: 3,
    },
    tabKopf: {
      fontFamily: schrift(text, true),
      color: f.primaer,
      backgroundColor: f.flaeche,
    },
    tabZelle: { flex: 1, paddingHorizontal: 3 },
    listePunkt: { flexDirection: "row", marginBottom: 3 },
    balkenZeile: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    balkenLabel: { width: 110, fontSize: 8.5 },
    balkenSpur: { flex: 1, height: 12, backgroundColor: f.flaeche },
    balkenWert: {
      width: 36,
      textAlign: "right",
      fontFamily: schrift(text, true),
    },
    luecke: {
      borderLeftWidth: 2,
      borderLeftColor: "#c23b3b",
      backgroundColor: "#fbeeee",
      color: "#8a2a2a",
      padding: 6,
      marginBottom: 6,
      fontSize: 8.5,
    },
    hinweis: {
      borderLeftWidth: 2,
      borderLeftColor: f.akzent,
      backgroundColor: f.flaeche,
      padding: 6,
      marginBottom: 6,
      fontSize: 8.5,
    },
    quellen: { fontSize: 7, color: f.textHell },
  });
}

function quellenNummern(
  ids: string[] | undefined,
  nummern: Map<string, number>,
): string {
  if (!ids?.length) return "";
  const n = ids
    .map((id) => nummern.get(id))
    .filter((x): x is number => x != null);
  return n.length ? ` [${n.join(", ")}]` : "";
}

function BlockPdf({
  block,
  s,
  nummern,
  akzent,
}: {
  block: Block;
  s: ReturnType<typeof stile>;
  nummern: Map<string, number>;
  akzent: string;
}) {
  switch (block.art) {
    case "absatz":
      return (
        <Text style={s.absatz}>
          {block.text}
          <Text style={s.quelleNr}>
            {quellenNummern(block.quellen, nummern)}
          </Text>
        </Text>
      );
    case "kennzahlen":
      return (
        <View style={s.kennzahlen}>
          {block.eintraege.map((e, i) => (
            <View key={i} style={s.kennzahl} wrap={false}>
              <Text style={s.kennzahlLabel}>{e.label}</Text>
              <Text style={s.kennzahlWert}>
                {e.wert}
                <Text style={s.quelleNr}>
                  {quellenNummern(e.quellen, nummern)}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      );
    case "tabelle":
      return (
        <View style={s.tabelle}>
          <View style={[s.tabZeile, s.tabKopf]} fixed>
            {block.kopf.map((k, i) => (
              <Text
                key={i}
                style={[
                  s.tabZelle,
                  {
                    textAlign:
                      block.ausrichtung?.[i] === "rechts" ? "right" : "left",
                  },
                ]}
              >
                {k}
              </Text>
            ))}
          </View>
          {block.zeilen.map((z, zi) => (
            <View key={zi} style={s.tabZeile} wrap={false}>
              {z.map((zelle, i) => (
                <Text
                  key={i}
                  style={[
                    s.tabZelle,
                    {
                      textAlign:
                        block.ausrichtung?.[i] === "rechts" ? "right" : "left",
                    },
                  ]}
                >
                  {zelle}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "liste":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.punkte.map((p, i) => (
            <View key={i} style={s.listePunkt}>
              <Text style={{ width: 10, color: akzent }}>•</Text>
              <Text style={{ flex: 1 }}>{p}</Text>
            </View>
          ))}
        </View>
      );
    case "balken": {
      const max = Math.max(1, ...block.eintraege.map((e) => e.wert));
      return (
        <View style={{ marginBottom: 8 }}>
          {block.eintraege.map((e, i) => (
            <View key={i} style={s.balkenZeile}>
              <Text style={s.balkenLabel}>{e.label}</Text>
              <View style={s.balkenSpur}>
                <View
                  style={{
                    width: `${(e.wert / max) * 100}%`,
                    height: 12,
                    backgroundColor: akzent,
                  }}
                />
              </View>
              <Text style={s.balkenWert}>{e.wert.toLocaleString("de-DE")}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "luecke":
      return <Text style={s.luecke}>Fehlende Angabe: {block.text}</Text>;
    case "hinweis":
      return <Text style={s.hinweis}>{block.text}</Text>;
  }
}

export function DokumentPdf({
  inhalt,
  vorlage,
}: {
  inhalt: DokumentInhalt;
  vorlage: DesignVorlage;
}) {
  const s = stile(vorlage);
  const d = vorlage.design;
  const nummern = new Map(inhalt.quellen.map((q, i) => [q.id, i + 1]));

  return (
    <Document
      title={inhalt.titel}
      author={d.firma.name}
      creator="Grenz & Co. App"
    >
      <Page size={d.seitenformat} style={s.deckblatt}>
        <View style={s.deckInnen}>
          <Image src={logoWeiss} style={s.logo} />
          <View>
            <View style={s.deckLinie} />
            <Text style={s.deckTitel}>{inhalt.titel}</Text>
            {inhalt.untertitel ? (
              <Text style={s.deckUntertitel}>{inhalt.untertitel}</Text>
            ) : null}
            <Text style={[s.deckUntertitel, { marginTop: 18 }]}>
              {datumDe(inhalt.datum)}
            </Text>
            {inhalt.stempel ? (
              <Text
                style={[
                  s.deckUntertitel,
                  { color: d.farben.akzent, marginTop: 6 },
                ]}
              >
                {inhalt.stempel}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={s.deckFuss}>{d.firma.name}</Text>
            <Text style={s.deckFuss}>
              {d.firma.anschrift} · {d.firma.telefon} · {d.firma.email}
            </Text>
          </View>
        </View>
      </Page>

      <Page size={d.seitenformat} style={s.seite}>
        <Text
          style={s.fussSeite}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber - 1} von ${totalPages - 1}`
          }
        />
        <View style={s.kopf} fixed>
          <Text>{inhalt.titel}</Text>
          {inhalt.stempel ? (
            <Text style={s.stempel}>{inhalt.stempel}</Text>
          ) : (
            <Text>{d.firma.name}</Text>
          )}
        </View>

        <View style={s.inhalt}>
          {inhalt.abschnitte.map((a) => (
            <View key={a.id} style={s.abschnitt}>
              <View wrap={false}>
                <Text style={s.abschnittTitel}>{a.titel}</Text>
                <View style={s.abschnittLinie} />
              </View>
              {a.bloecke.map((b, i) => (
                <BlockPdf
                  key={i}
                  block={b}
                  s={s}
                  nummern={nummern}
                  akzent={d.farben.akzent}
                />
              ))}
            </View>
          ))}

          {inhalt.quellen.length ? (
            <View style={s.abschnitt} break={inhalt.quellen.length > 12}>
              <Text style={s.abschnittTitel}>Quellen</Text>
              <View style={s.abschnittLinie} />
              {inhalt.quellen.map((q, i) => (
                <Text key={q.id} style={s.quellen}>
                  [{i + 1}] {q.bezeichnung}
                  {q.seite ? `, S. ${q.seite}` : ""}
                  {q.zitat ? `: „${q.zitat}“` : ""}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={s.fussText} fixed>
          {d.fusszeile}
        </Text>
      </Page>
    </Document>
  );
}

export async function dokumentAlsPdf(
  inhalt: DokumentInhalt,
  vorlage: DesignVorlage,
): Promise<Buffer> {
  return renderToBuffer(<DokumentPdf inhalt={inhalt} vorlage={vorlage} />);
}
