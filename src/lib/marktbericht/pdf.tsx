/**
 * Marktbericht als PDF im Layout der Grenz-Einschätzungen (A4 quer, hellblaue Randfläche rechts,
 * Wortmarke oben rechts, Seitenzahl im navy Kasten). Maße in Zoll wie in den PowerPoint-Vorlagen.
 * Zielgruppe: private und semi-professionelle Investoren. Absender ist Grenz & Co. Research;
 * fremde Herausgeber werden im PDF nicht genannt (Belege bleiben intern am Vergleichswert).
 */

import {
  Document,
  Font,
  Image,
  Line,
  Page,
  Path,
  Polyline,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import roboto300 from "@/assets/fonts/roboto/roboto-latin-300-normal.ttf?inline";
import roboto400 from "@/assets/fonts/roboto/roboto-latin-400-normal.ttf?inline";
import roboto700 from "@/assets/fonts/roboto/roboto-latin-700-normal.ttf?inline";
import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";
import wortmarkeWeiss from "@/assets/grenz-co-wortmarke-weiss.png?inline";

import { erhebungZeitraum, fmt, kacheln, type Kachel } from "./bericht";
import { zinsStand } from "./bundesbank";
import type { MarktberichtVoll } from "./server-fn";
import {
  bruttorendite,
  deutschland,
  standortZeilen,
  type MarktWert,
} from "./standorte";
import { MINDEST_FALLZAHL, periodeText, type Trend } from "./typen";

const F = {
  navy: "#233567",
  hellblau: "#BCD4E5",
  zeile: "#F2F2F2",
  text: "#1A1A1A",
  textHell: "#595959",
  runter: "#B23A3A",
};
const Z = 72;
const SEITE: [number, number] = [11.69 * Z, 8.27 * Z];
// CI-Schrift Roboto (lokal, latin; TTF, weil fontkit WOFF2 beim Einbetten nicht zuverlässig teilt). Eigene Familien je Schnitt, damit fontFamily allein reicht.
const SCHRIFT = "Roboto";
const LEICHT = "Roboto-Light";
const FETT = "Roboto-Bold";
Font.register({ family: SCHRIFT, src: roboto400 });
Font.register({ family: LEICHT, src: roboto300 });
Font.register({ family: FETT, src: roboto700 });
Font.registerHyphenationCallback((wort) => [wort]);

/** Die Schrift ist auf „latin“ beschränkt: seltene Zeichen ersetzen, sonst fehlen sie im PDF. */
function t(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[−‒]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[▲▼►]/g, "")
    .replace(/[\u2009\u202f]/g, " ");
}

type Pos = { x: number; y: number; w: number; h?: number };
const abs = (p: Pos) => ({
  position: "absolute" as const,
  left: p.x * Z,
  top: p.y * Z,
  width: p.w * Z,
  ...(p.h != null ? { height: p.h * Z } : {}),
});

function Fuss({
  seite,
  kopf,
  stempel,
}: {
  seite: number;
  kopf: string;
  stempel: string | null;
}) {
  return (
    <>
      <Text
        style={{
          ...abs({ x: 6.2, y: 7.98, w: 4.55, h: 0.18 }),
          fontSize: 7,
          color: F.textHell,
          textAlign: "right",
        }}
      >
        {t(stempel ? `${stempel} · ${kopf}` : kopf)}
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
  kopf,
  stempel,
  rand,
  children,
}: {
  titel: string;
  untertitel: string;
  seite: number;
  kopf: string;
  stempel: string | null;
  rand?: ReactNode;
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
          fontSize: 30,
          fontFamily: LEICHT,
          color: F.navy,
        }}
      >
        {t(titel.toUpperCase())}
      </Text>
      <Text
        style={{ ...abs({ x: 0.35, y: 1.15, w: 7.1, h: 0.3 }), fontSize: 9.5 }}
      >
        {t(untertitel)}
      </Text>
      {children}
      {rand ? (
        <View style={{ ...abs({ x: 7.85, y: 1.6, w: 3.45 }) }}>{rand}</View>
      ) : null}
      <Fuss seite={seite} kopf={kopf} stempel={stempel} />
    </Page>
  );
}

function Absatz({
  text,
  pos,
  groesse = 9.5,
}: {
  text?: string;
  pos: Pos;
  groesse?: number;
}) {
  if (!text?.trim()) return null;
  return (
    <View style={abs(pos)}>
      {text
        .split(/\n+/)
        .filter((x) => x.trim())
        .map((a, i) => (
          <Text
            key={i}
            style={{ fontSize: groesse, lineHeight: 1.4, marginBottom: 5 }}
          >
            {t(a.trim())}
          </Text>
        ))}
    </View>
  );
}

/** Randnotiz in navy, Stichwort vor dem Doppelpunkt fett (wie in der Moltkestraße-Einschätzung). */
function Randpunkte({ punkte }: { punkte: string[] }) {
  return (
    <View>
      {punkte.map((p, i) => {
        const [kopf, ...rest] = p.split(":");
        const hatKopf = rest.length > 0 && kopf.length < 60;
        return (
          <View key={i} style={{ flexDirection: "row", marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 12,
                color: F.navy,
                width: 14,
                fontFamily: FETT,
              }}
            >
              -
            </Text>
            <Text
              style={{ fontSize: 12, color: F.navy, flex: 1, lineHeight: 1.3 }}
            >
              {hatKopf ? (
                <>
                  <Text style={{ fontFamily: FETT }}>{t(kopf)}:</Text>
                  {t(rest.join(":"))}
                </>
              ) : (
                t(p)
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Randtitel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        color: F.navy,
        fontFamily: FETT,
        marginBottom: 6,
        letterSpacing: 0.5,
      }}
    >
      {t(children.toUpperCase())}
    </Text>
  );
}

function Randliste({
  titel,
  eintraege,
}: {
  titel: string;
  eintraege: { label: string; wert: string }[];
}) {
  if (!eintraege.length) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Randtitel>{titel}</Randtitel>
      {eintraege.map((e, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderBottom: "0.75pt solid #FFFFFF",
            paddingVertical: 3,
          }}
        >
          <Text style={{ fontSize: 8.5, color: F.text, maxWidth: 2.6 * Z }}>
            {t(e.label)}
          </Text>
          <Text style={{ fontSize: 8.5, color: F.navy, fontFamily: FETT }}>
            {t(e.wert)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Tabelle({
  pos,
  kopf,
  zeilen,
  breiten,
  rechts = [],
  fettLetzte = false,
}: {
  pos: Pos;
  kopf: string[];
  zeilen: string[][];
  breiten: number[];
  rechts?: number[];
  fettLetzte?: boolean;
}) {
  const zelle = (
    text: string,
    i: number,
    stil: { farbe?: string; fett?: boolean; gross?: boolean },
  ) => (
    <Text
      key={i}
      style={{
        width: breiten[i] * Z,
        paddingHorizontal: 5,
        paddingVertical: 4,
        fontSize: stil.gross ? 7.5 : 8.5,
        color: stil.farbe ?? F.text,
        fontFamily: stil.fett ? FETT : SCHRIFT,
        textAlign: rechts.includes(i) ? "right" : "left",
      }}
    >
      {t(text)}
    </Text>
  );
  return (
    <View style={{ ...abs(pos) }}>
      <View style={{ flexDirection: "row", backgroundColor: F.navy }}>
        {kopf.map((k, i) =>
          zelle(k.toUpperCase(), i, { farbe: "#FFFFFF", gross: true }),
        )}
      </View>
      {zeilen.map((z, j) => (
        <View
          key={j}
          style={{
            flexDirection: "row",
            backgroundColor: j % 2 ? "#FFFFFF" : F.zeile,
            borderBottom:
              fettLetzte && j === zeilen.length - 2
                ? `1pt solid ${F.navy}`
                : undefined,
          }}
        >
          {z.map((w, i) =>
            zelle(w, i, {
              fett: (fettLetzte && j === zeilen.length - 1) || i === 0,
            }),
          )}
        </View>
      ))}
    </View>
  );
}

function Balken({
  pos,
  titel,
  werte,
  format,
}: {
  pos: Pos;
  titel: string;
  werte: { label: string; wert: number }[];
  format: (w: number) => string;
}) {
  const max = Math.max(...werte.map((w) => w.wert), 0);
  if (!werte.length || max <= 0) return null;
  const labelBreite = 1.55;
  const balkenBreite = pos.w - labelBreite - 0.7;
  return (
    <View style={abs(pos)}>
      <Text style={{ fontSize: 9, color: F.textHell, marginBottom: 8 }}>
        {t(titel)}
      </Text>
      {werte.map((w, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 5,
          }}
        >
          <Text style={{ width: labelBreite * Z, fontSize: 8.5 }}>
            {t(w.label)}
          </Text>
          <View
            style={{
              width: Math.max(0.02, (w.wert / max) * balkenBreite) * Z,
              height: 0.17 * Z,
              backgroundColor: i % 2 ? F.hellblau : F.navy,
            }}
          />
          <Text style={{ fontSize: 8.5, color: F.navy, marginLeft: 5 }}>
            {t(format(w.wert))}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Linien({
  pos,
  titel,
  reihen,
}: {
  pos: Pos & { h: number };
  titel: string;
  reihen: {
    label: string;
    werte: { monat: string; wert: number }[];
    farbe: string;
  }[];
}) {
  const alle = reihen.flatMap((r) => r.werte);
  if (!alle.length) return null;
  const monate = [...new Set(alle.map((w) => w.monat))].sort();
  const lo = Math.floor(Math.min(...alle.map((w) => w.wert)) * 2) / 2;
  const hi = Math.ceil(Math.max(...alle.map((w) => w.wert)) * 2) / 2;
  const W = (pos.w - 0.45) * Z;
  const H = (pos.h - 0.75) * Z;
  const x = (m: string) =>
    (monate.indexOf(m) / Math.max(1, monate.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / Math.max(0.5, hi - lo)) * H;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.5)
    ticks.push(Math.round(v * 10) / 10);
  const jahre = monate.filter((m) => m.endsWith("-01"));
  return (
    <View style={abs(pos)}>
      <Text style={{ fontSize: 9, color: F.textHell, marginBottom: 6 }}>
        {t(titel)}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 0.4 * Z, height: H, position: "relative" }}>
          {ticks.map((v) => (
            <Text
              key={v}
              style={{
                position: "absolute",
                right: 4,
                top: y(v) - 4,
                fontSize: 7,
                color: F.textHell,
              }}
            >
              {v.toLocaleString("de-DE", { minimumFractionDigits: 1 })}
            </Text>
          ))}
        </View>
        <Svg width={W} height={H}>
          {ticks.map((v) => (
            <Line
              key={v}
              x1={0}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="#D9D9D9"
              strokeWidth={0.5}
            />
          ))}
          {reihen.map((r) => (
            <Polyline
              key={r.label}
              points={r.werte
                .map((w) => `${x(w.monat)},${y(w.wert)}`)
                .join(" ")}
              stroke={r.farbe}
              strokeWidth={1.6}
              fill="none"
            />
          ))}
        </Svg>
      </View>
      <View
        style={{
          marginLeft: 0.4 * Z,
          width: W,
          height: 12,
          position: "relative",
        }}
      >
        {jahre.map((m) => (
          <Text
            key={m}
            style={{
              position: "absolute",
              left: x(m) - 10,
              top: 2,
              fontSize: 7,
              color: F.textHell,
            }}
          >
            {m.slice(0, 4)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6, marginLeft: 0.4 * Z }}>
        {reihen.map((r) => (
          <View
            key={r.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 14,
            }}
          >
            <View
              style={{
                width: 14,
                height: 2,
                backgroundColor: r.farbe,
                marginRight: 4,
              }}
            />
            <Text style={{ fontSize: 7.5 }}>{t(r.label)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Pfeil({
  richtung,
  farbe,
}: {
  richtung: "hoch" | "runter" | "seitwaerts";
  farbe: string;
}) {
  const d =
    richtung === "hoch"
      ? "M0 9 L5 1 L10 9 Z"
      : richtung === "runter"
        ? "M0 1 L5 9 L10 1 Z"
        : "M1 0 L9 5 L1 10 Z";
  return (
    <Svg width={10} height={10}>
      <Path d={d} fill={farbe} />
    </Svg>
  );
}

function trendPfeil(tr: Trend) {
  return tr === "steigend" ? (
    <Pfeil richtung="hoch" farbe={F.navy} />
  ) : tr === "fallend" ? (
    <Pfeil richtung="runter" farbe={F.navy} />
  ) : (
    <Pfeil richtung="seitwaerts" farbe={F.textHell} />
  );
}

function KachelFeld({ k }: { k: Kachel }) {
  return (
    <View
      style={{
        width: 2.15 * Z,
        borderTop: `2.5pt solid ${F.navy}`,
        paddingTop: 7,
        marginBottom: 0.38 * Z,
        marginRight: 0.2 * Z,
      }}
    >
      <Text style={{ fontSize: 22, color: F.navy, fontFamily: LEICHT }}>
        {t(k.wert)}
      </Text>
      <Text style={{ fontSize: 8, marginTop: 4, letterSpacing: 0.3 }}>
        {t(k.label.toUpperCase())}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 4,
          minHeight: 11,
        }}
      >
        {k.richtung ? <Pfeil richtung={k.richtung} farbe={F.navy} /> : null}
        <Text
          style={{
            fontSize: 8,
            color: F.textHell,
            marginLeft: k.richtung ? 4 : 0,
          }}
        >
          {t(k.veraenderung ?? "")}
        </Text>
      </View>
      <Text style={{ fontSize: 6.5, color: F.textHell, marginTop: 3 }}>
        {t(k.quelle)}
      </Text>
    </View>
  );
}

const DISCLAIMER =
  "Dieser Bericht von Grenz & Co. Research dient ausschließlich der allgemeinen Information über den Markt für Zinshäuser und Mehrfamilienhäuser im Rheinland. Er stellt keine Anlage-, Steuer- oder Rechtsberatung, kein Wertgutachten und keine Aufforderung zum Kauf oder Verkauf dar. Die Angaben beruhen auf eigenen Erhebungen und Auswertungen von Grenz & Co. sowie auf öffentlich zugänglichen Markt-, Transaktions- und Finanzdaten, die wir für verlässlich halten. Angebotswerte sind keine beurkundeten Kaufpreise. Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen. Vervielfältigung nur mit Quellenangabe „Grenz & Co. Research“.";

function wertOder(w: MarktWert | undefined): string {
  return w ? w.text : "–";
}

/** Kasten mit navy Rand links, für Erklärungen und Hinweise auf der Randfläche. */
function Hinweis({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderLeft: `3pt solid ${F.navy}`,
        padding: 9,
        marginBottom: 14,
      }}
    >
      <Text
        style={{
          fontSize: 8.5,
          fontFamily: FETT,
          color: F.navy,
          marginBottom: 4,
          letterSpacing: 0.4,
        }}
      >
        {t(titel.toUpperCase())}
      </Text>
      {children}
    </View>
  );
}

function Empfehlungen({ punkte, pos }: { punkte: string[]; pos: Pos }) {
  if (!punkte.length) return null;
  return (
    <View style={abs(pos)}>
      <Text
        style={{
          fontSize: 9,
          fontFamily: FETT,
          color: F.navy,
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        WAS DAS FÜR INVESTOREN BEDEUTET
      </Text>
      {punkte.map((p, i) => {
        const [kopf, ...rest] = p.split(":");
        const hatKopf = rest.length > 0 && kopf.length < 40;
        return (
          <View
            key={i}
            style={{
              flexDirection: "row",
              backgroundColor: i % 2 ? "#FFFFFF" : F.zeile,
              paddingVertical: 7,
              paddingHorizontal: 8,
            }}
          >
            <Text
              style={{
                width: 22,
                fontSize: 14,
                color: F.navy,
                fontFamily: LEICHT,
              }}
            >
              {i + 1}
            </Text>
            <Text style={{ flex: 1, fontSize: 10, lineHeight: 1.35 }}>
              {hatKopf ? (
                <>
                  <Text style={{ fontFamily: FETT, color: F.navy }}>
                    {t(kopf)}:
                  </Text>
                  {t(rest.join(":"))}
                </>
              ) : (
                t(p)
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MarktberichtDokument({ b }: { b: MarktberichtVoll }) {
  const k = b.kennzahlen;
  const x = b.inhalt.texte;
  const stempel = b.status === "entwurf" ? "ENTWURF" : null;
  const periode = periodeText(k.periode);
  const kopf = `Grenz & Co. Research · Marktbericht Zinshäuser Rheinland · ${periode}`;
  const benchmarks = b.inhalt.benchmarks.filter((x) => x.geprueft);
  const standorte = standortZeilen(k, benchmarks);
  const de = deutschland(benchmarks);
  const gesamt = k.angebot.zeilen.find((z) => z.teilmarkt === "Gesamt");
  const bauzins = k.zinsen.reihen.find((r) => r.id === "bauzins");
  const bund = k.zinsen.reihen.find((r) => r.id === "bund10");
  const bauzinsStand = zinsStand(bauzins);
  const renditeAngebot = bruttorendite(gesamt?.faktor?.median);
  const stand = fmt.datum(k.stichtag);
  const laufend = erhebungZeitraum(k, "angebot");
  let seite = 1;
  const naechste = () => ++seite;

  return (
    <Document
      title={b.titel}
      author="Grenz & Co. Research"
      subject={`Marktbericht ${periode}`}
    >
      {/* Titel */}
      <Page size={SEITE} style={{ fontFamily: SCHRIFT }}>
        <View
          style={{
            ...abs({ x: 0, y: 0, w: 7.4, h: 6.05 }),
            backgroundColor: F.hellblau,
          }}
        />
        <View
          style={{
            ...abs({ x: 0.45, y: 0.87, w: 10.79, h: 6.53 }),
            backgroundColor: "#5D7690",
          }}
        />
        <Svg
          style={abs({ x: 0.45, y: 3.4, w: 10.79, h: 4 })}
          viewBox="0 0 200 80"
          preserveAspectRatio="none"
        >
          <Path
            fill="#3D5470"
            d="M0 80V44h10V30h8v14h6V22h10v22h8V36h12v8h6V18l6-6 6 6v26h10V30h14v14h8V26h10v18h6V34h12v10h10V20h8v24h8V38h14v42z"
          />
          <Path
            fill="#2A3D57"
            d="M0 80V60h20V52h14v8h22V48h10v12h30V54h16v6h24V50h12v10h20V56h32v24z"
          />
        </Svg>
        <Text
          style={{
            ...abs({ x: 0.85, y: 1.35, w: 6 }),
            fontSize: 11,
            color: "#FFFFFF",
            letterSpacing: 2,
          }}
        >
          GRENZ & CO. RESEARCH
        </Text>
        <View
          style={{
            ...abs({ x: 5.69, y: 4.04, w: 6.01, h: 2.48 }),
            backgroundColor: F.navy,
            paddingHorizontal: 0.23 * Z,
            paddingTop: 0.32 * Z,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              color: "#FFFFFF",
              marginBottom: 8,
              fontFamily: LEICHT,
            }}
          >
            MARKTBERICHT
          </Text>
          <Text style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.35 }}>
            Zinshäuser Rheinland · Köln · Düsseldorf · Bonn · Umland
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: "#FFFFFF",
              lineHeight: 1.35,
              marginBottom: 12,
            }}
          >
            {t(`${periode} · Für private und professionelle Investoren`)}
          </Text>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
              {k.vorlaeufig ? `Vorläufiger Stand ${stand}` : `Stand ${stand}`}
            </Text>
            {stempel ? (
              <Text style={{ fontSize: 10, color: "#FFFFFF" }}>{stempel}</Text>
            ) : null}
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
      </Page>

      {/* Auf einen Blick */}
      <Rahmen
        titel="Auf einen Blick"
        untertitel={`Zinshausmarkt Rheinland · ${periode}${k.vorlaeufig ? ` · vorläufig, Stand ${stand}` : ""}`}
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={x.thesen?.length ? <Randpunkte punkte={x.thesen} /> : null}
      >
        <View
          style={{
            ...abs({ x: 0.35, y: 1.65, w: 7.1 }),
            flexDirection: "row",
            flexWrap: "wrap",
          }}
        >
          {kacheln(k, benchmarks).map((kc, i) => (
            <KachelFeld key={i} k={kc} />
          ))}
        </View>
        <Absatz
          text={x.einleitung}
          pos={{ x: 0.35, y: 4.5, w: 6.9 }}
          groesse={10.5}
        />
      </Rahmen>

      {/* Finanzierung */}
      <Rahmen
        titel="Finanzierung"
        untertitel="Bauzinsen, Kapitalmarkt und Rendite im Vergleich"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <>
            <Randliste
              titel="Aktuell"
              eintraege={[bauzins, bund]
                .map((r) => ({ r, s: zinsStand(r) }))
                .filter((e) => e.s)
                .map(({ r, s }) => ({
                  label: `${r!.label.replace(" (Zinsbindung über 10 Jahre)", " 10 J.")} (${s!.monat.slice(5, 7)}/${s!.monat.slice(0, 4)})`,
                  wert: `${fmt.prozent(s!.wert)}${s!.deltaBp != null ? ` (${fmt.bp(s!.deltaBp)})` : ""}`,
                }))}
            />
            {renditeAngebot != null && bauzinsStand ? (
              <Hinweis titel="Rendite gegen Zins">
                <Text style={{ fontSize: 8.5, lineHeight: 1.4 }}>
                  {t(
                    `Bruttorendite im aktuellen Angebot ${fmt.rendite(renditeAngebot)} gegenüber Bauzins ${fmt.prozent(bauzinsStand.wert)}. Liegt die Rendite über dem Zins, wirkt Fremdkapital positiv auf die Eigenkapitalrendite (Leverage).`,
                  )}
                </Text>
              </Hinweis>
            ) : null}
            <Text style={{ fontSize: 7, color: F.textHell }}>
              Monatswerte. Veränderung gegenüber Vorjahresmonat in Basispunkten
              (100 bp = 1 Prozentpunkt).
            </Text>
          </>
        }
      >
        <Linien
          pos={{ x: 0.35, y: 1.65, w: 7.0, h: 3.6 }}
          titel="Entwicklung in % (Monatswerte)"
          reihen={[
            ...(bauzins
              ? [{ label: bauzins.label, werte: bauzins.werte, farbe: F.navy }]
              : []),
            ...(bund
              ? [{ label: bund.label, werte: bund.werte, farbe: "#7FA6C6" }]
              : []),
          ]}
        />
        <Absatz text={x.rahmen} pos={{ x: 0.35, y: 5.55, w: 6.9 }} />
      </Rahmen>

      {/* Preise und Renditen */}
      <Rahmen
        titel="Preise und Renditen"
        untertitel="Kaufpreisfaktoren, Kaufpreise und Renditen für Mehrfamilienhäuser"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <>
            <Hinweis titel="So lesen Sie den Faktor">
              <Text style={{ fontSize: 8.5, lineHeight: 1.4 }}>
                Faktor = Kaufpreis geteilt durch die Jahresnettokaltmiete. Je
                höher der Faktor, desto teurer das Haus und desto niedriger die
                Bruttorendite (100 geteilt durch Faktor).
              </Text>
            </Hinweis>
            <Randliste
              titel="Faktor und Bruttorendite"
              eintraege={[16, 18, 20, 22, 25, 28].map((f) => ({
                label: `Faktor ${f}`,
                wert: fmt.rendite(bruttorendite(f)!),
              }))}
            />
          </>
        }
      >
        <Tabelle
          pos={{ x: 0.35, y: 1.6, w: 7.0 }}
          kopf={[
            "Standort",
            "Faktor Markt",
            "Preis je m²",
            "Faktor Angebote",
            "Rendite Angebote",
            "Liegenschafts- zins",
            "Spitzen- rendite",
          ]}
          breiten={[1.3, 0.85, 0.95, 0.95, 0.95, 1.0, 1.0]}
          rechts={[1, 2, 3, 4, 5, 6]}
          zeilen={standorte.map((z) => [
            z.standort,
            wertOder(z.markt.faktor),
            wertOder(z.markt.kaufpreis),
            z.angebotsfaktor ? fmt.faktor(z.angebotsfaktor) : "–",
            z.bruttorendite != null ? fmt.rendite(z.bruttorendite) : "–",
            wertOder(z.markt.liegenschaftszins),
            wertOder(z.markt.rendite),
          ])}
        />
        <Balken
          pos={{ x: 0.35, y: 2.15 + 0.27 * standorte.length, w: 6.9 }}
          titel="Faktor der aktuellen Angebote (Median)"
          werte={standorte
            .filter((z) => z.angebotsfaktor)
            .map((z) => ({ label: z.standort, wert: z.angebotsfaktor! }))}
          format={fmt.faktor}
        />
        <Absatz text={x.angebot} pos={{ x: 0.35, y: 4.5, w: 6.9 }} />
      </Rahmen>

      {/* Investmentmarkt und Mieten */}
      <Rahmen
        titel="Markt und Mieten"
        untertitel="Transaktionen, Mietentwicklung und Nachfrage der Investoren"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <>
            <Randliste
              titel="Gesuchte Strategien"
              eintraege={k.kaeufer.assetklassen
                .slice(0, 5)
                .map((a) => ({ label: a.label, wert: fmt.ganz(a.wert) }))}
            />
            <Randliste
              titel="Deutschland"
              eintraege={[
                ...(de.umsatz
                  ? [
                      {
                        label: "Wohninvestment",
                        wert: `${de.umsatz.text}${de.umsatz.veraenderung ? ` (${de.umsatz.veraenderung})` : ""}`,
                      },
                    ]
                  : []),
                ...(de.rendite
                  ? [
                      {
                        label: "Spitzenrendite Wohnen Top-7",
                        wert: de.rendite.text,
                      },
                    ]
                  : []),
              ]}
            />
            <Text style={{ fontSize: 7, color: F.textHell, lineHeight: 1.35 }}>
              {t(
                `Nachfrage: ${fmt.ganz(k.kaeufer.profile)} Ankaufsprofile aktiver Investoren, die Grenz & Co. betreut.`,
              )}
            </Text>
          </>
        }
      >
        <Tabelle
          pos={{ x: 0.35, y: 1.6, w: 7.0 }}
          kopf={[
            "Standort",
            "Angebotsmiete Wohnen",
            "Veränderung",
            "Umsatz Zinshäuser",
            "Veränderung",
          ]}
          breiten={[1.6, 1.45, 1.25, 1.45, 1.25]}
          rechts={[1, 2, 3, 4]}
          zeilen={standorte
            .filter((z) => z.standort !== "Übriges Rheinland")
            .map((z) => [
              z.standort,
              wertOder(z.markt.miete),
              z.markt.miete?.veraenderung ?? "–",
              wertOder(z.markt.umsatz),
              z.markt.umsatz?.veraenderung ?? "–",
            ])}
        />
        <Balken
          pos={{ x: 0.35, y: 3.05, w: 6.9 }}
          titel="Gesuchtes Investitionsvolumen je Investor (Anzahl Ankaufsprofile)"
          werte={k.kaeufer.volumenbaender}
          format={fmt.ganz}
        />
        <Absatz text={x.nachfrage} pos={{ x: 0.35, y: 4.6, w: 6.9 }} />
      </Rahmen>

      {/* Ausblick und Empfehlungen */}
      <Rahmen
        titel="Ausblick"
        untertitel="Unsere Erwartung für das nächste Halbjahr"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          x.ausblickTrends?.length ? (
            <View>
              <Randtitel>Trend · Prognose</Randtitel>
              {x.ausblickTrends.map((tr, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 5,
                    borderBottom: "0.75pt solid #FFFFFF",
                  }}
                >
                  <Text style={{ fontSize: 9, flex: 1 }}>{t(tr.kennzahl)}</Text>
                  <View style={{ width: 22 }}>{trendPfeil(tr.trend)}</View>
                  <View style={{ width: 14 }}>{trendPfeil(tr.prognose)}</View>
                </View>
              ))}
              <Text style={{ fontSize: 7, color: F.textHell, marginTop: 6 }}>
                Links: Entwicklung im Berichtszeitraum. Rechts: Erwartung für
                die kommenden sechs Monate.
              </Text>
            </View>
          ) : null
        }
      >
        <Absatz
          text={x.ausblick}
          pos={{ x: 0.35, y: 1.65, w: 6.9 }}
          groesse={10.5}
        />
        <Empfehlungen
          punkte={x.empfehlungen ?? []}
          pos={{ x: 0.35, y: 3.65, w: 6.9 }}
        />
      </Rahmen>

      {/* Über diesen Bericht, Kontakt */}
      <Rahmen
        titel="Über diesen Bericht"
        untertitel="Datengrundlage, Begriffe und Kontakt"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <View>
            <Randtitel>Ihr Ansprechpartner</Randtitel>
            {[
              "Sebastian Grenz",
              "Geschäftsführer",
              "s.grenz@grenz-co.de",
              "",
              "Grenz & Co. Immobilienberatungs-GmbH",
              "Friesenplatz 1, 50672 Köln",
              "Telefon: +49 221 669 948 50",
              "www.grenz-co.de",
            ].map((z, i) => (
              <Text
                key={i}
                style={{ fontSize: 9, color: F.navy, lineHeight: 1.4 }}
              >
                {z || " "}
              </Text>
            ))}
            <Text
              style={{
                fontSize: 8.5,
                color: F.navy,
                lineHeight: 1.4,
                marginTop: 14,
              }}
            >
              Sie möchten wissen, was Ihr Zinshaus heute wert ist? Wir erstellen
              Ihnen gern eine kostenfreie Markteinschätzung.
            </Text>
          </View>
        }
      >
        <View style={abs({ x: 0.35, y: 1.65, w: 6.9 })}>
          {[
            [
              "Grenz & Co. Research",
              "Grenz & Co. Research analysiert den Markt für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser im Rheinland. Grundlage sind eigene Angebots- und Investorendaten, laufende Marktbeobachtung sowie die Auswertung öffentlich zugänglicher Markt-, Transaktions- und Finanzdaten.",
            ],
            [
              "Aktuelle Angebote",
              `Zinshaus-Angebote, die Grenz & Co. erhalten hat${laufend ? ` (${laufend})` : ""}. Faktor = Angebotspreis geteilt durch Jahresnettokaltmiete (Ist), Median ab ${MINDEST_FALLZAHL} Angeboten. Angebotswerte, keine Kaufpreise.`,
            ],
            [
              "Marktwerte",
              "Kaufpreisfaktoren, Kaufpreise, Liegenschaftszinsen und Umsätze beziehen sich auf Mehrfamilienhäuser im Bestand der jeweiligen Stadt; Mieten auf Wohnungen in der Neuvermietung. Stand jeweils zum letzten verfügbaren Berichtszeitpunkt.",
            ],
            [
              "Rendite",
              "Bruttorendite = Jahresnettokaltmiete geteilt durch Kaufpreis (ohne Nebenkosten). Spitzenrendite = Nettoanfangsrendite für erstklassige Objekte in besten Lagen. Liegenschaftszins = marktüblicher Zins, mit dem Immobilien als Kapitalanlage verzinst werden.",
            ],
            [
              "Finanzierung",
              "Effektivzinssätze für Wohnungsbaukredite an private Haushalte mit Zinsbindung über 10 Jahre (Neugeschäft) und Rendite 10-jähriger Bundesanleihen, jeweils Monatswerte.",
            ],
            [
              "Nachfrage",
              "Ankaufsprofile der Investoren, die Grenz & Co. betreut, nach gesuchtem Volumen und Strategie.",
            ],
          ].map(([kopfzeile, inhalt]) => (
            <View key={kopfzeile} style={{ marginBottom: 7 }}>
              <Text style={{ fontSize: 9, fontFamily: FETT, color: F.navy }}>
                {t(kopfzeile)}
              </Text>
              <Text style={{ fontSize: 8.5, lineHeight: 1.35 }}>
                {t(inhalt)}
              </Text>
            </View>
          ))}
          <Text
            style={{
              fontSize: 9,
              fontFamily: FETT,
              color: F.navy,
              marginTop: 6,
            }}
          >
            Hinweis
          </Text>
          <Text style={{ fontSize: 7.5, lineHeight: 1.35, color: F.textHell }}>
            {t(DISCLAIMER)}
          </Text>
        </View>
      </Rahmen>
    </Document>
  );
}

export async function marktberichtAlsPdf(b: MarktberichtVoll): Promise<Buffer> {
  return renderToBuffer(<MarktberichtDokument b={b} />);
}
