/**
 * Vermarktungsbericht als PDF im Layout der Grenz-Vorlage (A4 quer, drei Seiten wie die
 * PowerPoint-Fassung). Maße in Zoll aus der Vorlage, umgerechnet in Punkt.
 */

import {
  Document,
  Image,
  Page,
  Path,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";
import wortmarkeWeiss from "@/assets/grenz-co-wortmarke-weiss.png?inline";

import type { BerichtFoto } from "./bericht-pptx";
import {
  BERICHT_FARBEN as F,
  tortenStuecke,
  type BerichtStand,
} from "./vermarktungsbericht";

const Z = 72; // Punkt je Zoll
const SEITE: [number, number] = [11.69 * Z, 8.27 * Z];
const SCHRIFT = "Helvetica";

type Pos = { x: number; y: number; w: number; h: number };
const abs = (p: Pos) => ({
  position: "absolute" as const,
  left: p.x * Z,
  top: p.y * Z,
  width: p.w * Z,
  height: p.h * Z,
});

function Foto({ bild, pos }: { bild: BerichtFoto | null; pos: Pos }) {
  if (!bild) return <View style={{ ...abs(pos), backgroundColor: F.grau }} />;
  return (
    <Image src={bild.dataUri} style={{ ...abs(pos), objectFit: "cover" }} />
  );
}

function Fuss({ seite, stempel }: { seite: number; stempel: string | null }) {
  return (
    <>
      <Text
        style={{
          ...abs({ x: 8.2, y: 7.98, w: 2.6, h: 0.18 }),
          fontSize: 7,
          color: F.textHell,
          textAlign: "right",
        }}
      >
        {stempel
          ? `- ${stempel} · Streng vertraulich -`
          : "- Streng vertraulich -"}
      </Text>
      <View
        style={{
          ...abs({ x: 10.88, y: 7.92, w: 0.36, h: 0.3 }),
          backgroundColor: F.navy,
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 8, color: "#FFFFFF", textAlign: "center" }}>
          {seite}
        </Text>
      </View>
    </>
  );
}

function Rahmen({
  titel,
  untertitel,
  seite,
  stempel,
  children,
}: {
  titel: string;
  untertitel: string;
  seite: number;
  stempel: string | null;
  children: ReactNode;
}) {
  return (
    <Page size={SEITE} style={{ fontFamily: SCHRIFT, color: F.text }}>
      <View
        style={{
          ...abs({ x: 7.55, y: 0, w: 11.69 - 7.55, h: 8.27 }),
          backgroundColor: F.hellblau,
        }}
      />
      <Image
        src={wortmarkeWeiss}
        style={abs({ x: 9.97, y: 0.21, w: 1.48, h: 0.23 })}
      />
      <Text
        style={{
          ...abs({ x: 0.35, y: 0.48, w: 7.1, h: 0.65 }),
          fontSize: 32,
          color: F.navy,
        }}
      >
        {titel.toUpperCase()}
      </Text>
      <Text
        style={{ ...abs({ x: 0.35, y: 1.15, w: 7.1, h: 0.3 }), fontSize: 9.5 }}
      >
        {untertitel}
      </Text>
      {children}
      <Fuss seite={seite} stempel={stempel} />
    </Page>
  );
}

function Tabelle({
  pos,
  kopf,
  zeilen,
  gesamt,
  spalte,
}: {
  pos: { x: number; y: number; w: number };
  kopf?: string;
  zeilen: [string, string][];
  gesamt?: number;
  spalte: number;
}) {
  const zeile = (
    l: string,
    w: string,
    stil: { bg: string; farbe?: string; fett?: boolean },
    i: number,
  ) => (
    <View
      key={i}
      style={{
        flexDirection: "row",
        backgroundColor: stil.bg,
        borderBottom: "1.5pt solid #FFFFFF",
        minHeight: 0.31 * Z,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          width: (pos.w - spalte) * Z,
          paddingHorizontal: 6,
          paddingVertical: 3,
          fontSize: 9,
          color: stil.farbe ?? F.text,
          fontFamily: stil.fett ? "Helvetica-Bold" : SCHRIFT,
        }}
      >
        {l}
      </Text>
      <Text
        style={{
          width: spalte * Z,
          paddingHorizontal: 6,
          fontSize: 9,
          textAlign: kopf ? "right" : "left",
          color: stil.farbe ?? F.text,
          fontFamily: stil.fett ? "Helvetica-Bold" : SCHRIFT,
        }}
      >
        {w}
      </Text>
    </View>
  );
  return (
    <View
      style={{
        position: "absolute",
        left: pos.x * Z,
        top: pos.y * Z,
        width: pos.w * Z,
      }}
    >
      {kopf ? zeile(kopf, "", { bg: F.navy, farbe: "#FFFFFF" }, -1) : null}
      {zeilen.map(([l, w], i) => zeile(l, w, { bg: F.zeile }, i))}
      {gesamt != null
        ? zeile(
            "Gesamt",
            gesamt.toLocaleString("de-DE"),
            { bg: "#FFFFFF", fett: true },
            -2,
          )
        : null}
    </View>
  );
}

function Torte({
  titel,
  werte,
  pos,
  legende,
}: {
  titel: string;
  werte: { label: string; wert: number }[];
  pos: Pos;
  legende: "rechts" | "unten";
}) {
  const palette = legende === "unten" ? F.diagrammPanel : F.diagramm;
  const r =
    legende === "rechts"
      ? Math.min(pos.h - 0.5, pos.w / 2) / 2
      : Math.min(pos.w, pos.h * 0.62) / 2 - 0.1;
  const stuecke = tortenStuecke(werte, r * Z, r * Z, r * Z, palette);
  if (!stuecke.length) return null;
  const legendenEintraege = stuecke.map((s) => (
    <View
      key={s.label}
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          backgroundColor: s.farbe,
          marginRight: 5,
        }}
      />
      <Text style={{ fontSize: 8.5, maxWidth: 150 }}>{s.label}</Text>
    </View>
  ));
  return (
    <View style={{ ...abs(pos) }}>
      <Text
        style={{
          fontSize: 9,
          color: F.textHell,
          textAlign: legende === "unten" ? "center" : "left",
          marginBottom: 10,
          marginLeft: legende === "rechts" ? 0.4 * Z : 0,
        }}
      >
        {titel}
      </Text>
      <View
        style={{
          flexDirection: legende === "rechts" ? "row" : "column",
          alignItems: "center",
        }}
      >
        <Svg width={2 * r * Z} height={2 * r * Z}>
          {stuecke.map((s) => (
            <Path
              key={s.label}
              d={s.pfad}
              fill={s.farbe}
              stroke="#FFFFFF"
              strokeWidth={1}
            />
          ))}
        </Svg>
        <View
          style={
            legende === "rechts"
              ? { marginLeft: 18 }
              : { marginTop: 14, alignSelf: "flex-start", marginLeft: 0.3 * Z }
          }
        >
          {legendenEintraege}
        </View>
      </View>
    </View>
  );
}

function Punkte({ titel, punkte }: { titel: string; punkte: string[] }) {
  if (!punkte.length) return null;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          fontSize: 9.5,
          fontFamily: "Helvetica-Oblique",
          marginBottom: 5,
        }}
      >
        {titel}
      </Text>
      {punkte.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
          <Text style={{ fontSize: 9.5, width: 12 }}>•</Text>
          <Text style={{ fontSize: 9.5, flex: 1, lineHeight: 1.3 }}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

function BerichtDokument({
  b,
  fotos,
}: {
  b: BerichtStand;
  fotos: { titel: BerichtFoto | null; objekt: BerichtFoto | null };
}) {
  const zeilen = Math.max(b.status.length, b.absagegruende.length) + 2;
  const textY = Math.max(5.03, 1.61 + 0.31 * zeilen + 0.3);
  return (
    <Document title={`${b.titel} ${b.objektbezeichnung}`} author="Grenz & Co.">
      <Page size={SEITE} style={{ fontFamily: SCHRIFT }}>
        <View
          style={{
            ...abs({ x: 0, y: 0, w: 7.4, h: 6.05 }),
            backgroundColor: F.hellblau,
          }}
        />
        <Foto
          bild={fotos.titel ?? fotos.objekt}
          pos={{ x: 0.45, y: 0.87, w: 10.79, h: 6.53 }}
        />
        <View
          style={{
            ...abs({ x: 5.69, y: 4.04, w: 6.01, h: 2.48 }),
            backgroundColor: F.navy,
            paddingHorizontal: 0.23 * Z,
            paddingTop: 0.42 * Z,
          }}
        >
          <Text style={{ fontSize: 20, color: "#FFFFFF", marginBottom: 8 }}>
            {b.titel.toUpperCase()}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#FFFFFF",
              lineHeight: 1.35,
              height: 0.75 * Z,
            }}
          >
            {b.objektbezeichnung}
          </Text>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 11, color: "#FFFFFF" }}>
              {b.auftraggeber}
            </Text>
            <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
              {b.berichtsdatum}
            </Text>
          </View>
        </View>
        <View
          style={{
            ...abs({ x: 0, y: 6.61, w: 3.04, h: 1.09 }),
            backgroundColor: F.navy,
          }}
        />
        <Image
          src={logoWeiss}
          style={abs({ x: 0.27, y: 6.8, w: 2.5, h: 0.716 })}
        />
        <Text
          style={{
            ...abs({ x: 8.6, y: 7.5, w: 2.64, h: 0.2 }),
            fontSize: 7,
            color: F.textHell,
            textAlign: "right",
          }}
        >
          {b.stempel
            ? `- ${b.stempel} · Streng vertraulich -`
            : "- Streng vertraulich -"}
        </Text>
      </Page>

      <Rahmen
        titel="Zielgruppe"
        untertitel="Angesprochene Investoren"
        seite={2}
        stempel={b.stempel}
      >
        <Foto
          bild={fotos.objekt ?? fotos.titel}
          pos={{ x: 7.03, y: 1.43, w: 4.24, h: 5.39 }}
        />
        <Tabelle
          pos={{ x: 0.35, y: 1.57, w: 6.33 }}
          spalte={3.38}
          zeilen={[
            ["Objektanschrift", b.objektanschrift],
            ["Objekttyp", b.objekttyp],
            ["Auftraggeber", b.auftraggeber],
            ["Beginn der Vermarktung", b.vermarktungsbeginn],
            [
              "Angesprochene Investoren",
              b.angesprochen.toLocaleString("de-DE"),
            ],
          ]}
        />
        <Torte
          titel="Zusammensetzung der Kundengruppen"
          werte={b.kundengruppen}
          pos={{ x: 0.35, y: 3.85, w: 6.4, h: 3.9 }}
          legende="rechts"
        />
      </Rahmen>

      <Rahmen
        titel="Vermarktungsstand"
        untertitel="Aktueller Stand"
        seite={3}
        stempel={b.stempel}
      >
        <Tabelle
          pos={{ x: 0.35, y: 1.61, w: 3.33 }}
          kopf="Status"
          spalte={0.65}
          zeilen={b.status.map((s) => [
            s.label,
            s.wert.toLocaleString("de-DE"),
          ])}
          gesamt={b.angesprochen}
        />
        {b.absagegruende.length ? (
          <Tabelle
            pos={{ x: 3.98, y: 1.61, w: 3.23 }}
            kopf="Absagegründe"
            spalte={0.65}
            zeilen={b.absagegruende.map((s) => [
              s.label,
              s.wert.toLocaleString("de-DE"),
            ])}
            gesamt={b.absagenGesamt}
          />
        ) : null}
        <Torte
          titel="Absagegründe"
          werte={b.absagegruende}
          pos={{ x: 7.75, y: 1.61, w: 3.7, h: 6.1 }}
          legende="unten"
        />
        <View
          style={{
            position: "absolute",
            left: 0.35 * Z,
            top: textY * Z,
            width: 6.86 * Z,
          }}
        >
          <Punkte
            titel="Bisherige Herausforderungen bei der Vermarktung:"
            punkte={b.herausforderungen}
          />
          <Punkte titel="Weiteres Vorgehen:" punkte={b.weiteresVorgehen} />
        </View>
      </Rahmen>
    </Document>
  );
}

export async function berichtAlsPdf(
  b: BerichtStand,
  fotos: { titel: BerichtFoto | null; objekt: BerichtFoto | null },
): Promise<Buffer> {
  return renderToBuffer(<BerichtDokument b={b} fotos={fotos} />);
}
