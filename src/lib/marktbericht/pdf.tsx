/**
 * Marktbericht als PDF im Layout der Grenz-Einschätzungen (A4 quer, hellblaue Randfläche rechts,
 * Wortmarke oben rechts, Seitenzahl im navy Kasten). Maße in Zoll wie in den PowerPoint-Vorlagen.
 */

import {
  Document,
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

import logoWeiss from "@/assets/grenz-co-logo-weiss.png?inline";
import wortmarkeWeiss from "@/assets/grenz-co-wortmarke-weiss.png?inline";

import { fmt, kacheln, median, spanne, type Kachel } from "./bericht";
import { zinsStand } from "./bundesbank";
import type { MarktberichtVoll } from "./server-fn";
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
const SCHRIFT = "Helvetica";
const FETT = "Helvetica-Bold";

/** Helvetica kennt nur WinAnsi: Zeichen außerhalb ersetzen, sonst fehlen sie im PDF. */
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
      <Text style={{ fontSize: 24, color: F.navy }}>{t(k.wert)}</Text>
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
  "Dieser Bericht von Grenz & Co. dient ausschließlich der allgemeinen Information über den Markt für Zinshäuser im Rheinland. Er stellt keine Anlageberatung, kein Wertgutachten und keine Empfehlung für Investitions-, Verkaufs- oder Anmietungsentscheidungen dar. Eigene Auswertungen beruhen auf den bei Grenz & Co. eingegangenen Angeboten sowie auf eigenen Vermarktungs- und Investorendaten; sie bilden Angebotswerte ab, keine notariell beurkundeten Kaufpreise. Zitierte Werte anderer Häuser und öffentlicher Stellen sind als solche gekennzeichnet und urheberrechtlich deren Eigentum. Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen.";

function MarktberichtDokument({ b }: { b: MarktberichtVoll }) {
  const k = b.kennzahlen;
  const x = b.inhalt.texte;
  const stempel = b.status === "entwurf" ? "ENTWURF" : null;
  const periode = periodeText(k.periode);
  const kopf = `Grenz & Co. · Marktbericht Zinshäuser Rheinland · ${periode}`;
  const benchmarks = b.inhalt.benchmarks.filter((x) => x.geprueft);
  const gesamt = k.angebot.zeilen.find((z) => z.teilmarkt === "Gesamt");
  const teilmaerkte = k.angebot.zeilen.filter((z) => z.teilmarkt !== "Gesamt");
  const bauzins = k.zinsen.reihen.find((r) => r.id === "bauzins");
  const bund = k.zinsen.reihen.find((r) => r.id === "bund10");
  const stand = fmt.datum(k.stichtag);
  let seite = 1;
  const naechste = () => ++seite;

  return (
    <Document
      title={b.titel}
      author="Grenz & Co."
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
        <View
          style={{
            ...abs({ x: 5.69, y: 4.04, w: 6.01, h: 2.48 }),
            backgroundColor: F.navy,
            paddingHorizontal: 0.23 * Z,
            paddingTop: 0.36 * Z,
          }}
        >
          <Text style={{ fontSize: 26, color: "#FFFFFF", marginBottom: 8 }}>
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
              marginBottom: 14,
            }}
          >
            {t(periode)}
          </Text>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
              {k.vorlaeufig
                ? `Vorläufiger Stand ${stand}`
                : `Stichtag ${stand}`}
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
            ...abs({ x: 0.35, y: 1.75, w: 7.1 }),
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
          pos={{ x: 0.35, y: 4.55, w: 6.9 }}
          groesse={10}
        />
      </Rahmen>

      {/* Rahmenbedingungen */}
      <Rahmen
        titel="Rahmenbedingungen"
        untertitel="Zins- und Finanzierungsumfeld"
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
                  label: `${r!.label} (${s!.monat})`,
                  wert: `${fmt.prozent(s!.wert)}${s!.deltaBp != null ? ` (${fmt.bp(s!.deltaBp)})` : ""}`,
                }))}
            />
            <Text style={{ fontSize: 7, color: F.textHell }}>
              Quelle: Deutsche Bundesbank, Zeitreihen-Datenbank. Veränderung
              gegenüber Vorjahresmonat in Basispunkten.
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

      {/* Angebotsmarkt */}
      <Rahmen
        titel="Angebotsmarkt"
        untertitel="Bei Grenz & Co. eingegangene Zinshaus-Angebote nach Teilmarkt"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <>
            <Randliste
              titel="Objektarten"
              eintraege={k.angebot.objektarten.map((o) => ({
                label: o.label,
                wert: fmt.ganz(o.wert),
              }))}
            />
            <Text style={{ fontSize: 7, color: F.textHell, lineHeight: 1.35 }}>
              {t(
                `Faktor = Angebotspreis / Jahresnettokaltmiete (Ist). Spanne = mittlere 50 % der Angebote. Werte erst ab ${MINDEST_FALLZAHL} Angeboten je Zelle. Erfassung seit ${k.angebot.ersterEingang ? fmt.datum(k.angebot.ersterEingang) : "–"}.`,
              )}
            </Text>
          </>
        }
      >
        <Tabelle
          pos={{ x: 0.35, y: 1.6, w: 7.0 }}
          kopf={[
            "Teilmarkt",
            "Angebote",
            "Faktor Median",
            "Faktor Spanne",
            "€/m² Median",
            "Miete €/m²",
          ]}
          breiten={[1.45, 0.75, 1.0, 1.3, 1.25, 1.25]}
          rechts={[1, 2, 3, 4, 5]}
          fettLetzte
          zeilen={[...teilmaerkte, ...(gesamt ? [gesamt] : [])].map((z) => [
            z.teilmarkt,
            fmt.ganz(z.angebote),
            median(z.faktor, fmt.faktor),
            spanne(z.faktor, fmt.faktor),
            z.preisM2 ? fmt.euroM2(z.preisM2.median) : "–",
            z.mieteM2 ? fmt.mieteM2(z.mieteM2.median) : "–",
          ])}
        />
        <Balken
          pos={{ x: 0.35, y: 1.95 + 0.27 * (teilmaerkte.length + 1), w: 6.9 }}
          titel="Angebotsfaktor (Median) nach Teilmarkt"
          werte={teilmaerkte
            .filter((z) => z.faktor)
            .map((z) => ({ label: z.teilmarkt, wert: z.faktor!.median }))}
          format={fmt.faktor}
        />
        <Absatz text={x.angebot} pos={{ x: 0.35, y: 5.55, w: 6.9 }} />
      </Rahmen>

      {/* Nachfrage */}
      <Rahmen
        titel="Nachfrage"
        untertitel="Grenz-Käuferindex aus den Ankaufsprofilen der Bestandsinvestoren"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <>
            <Randliste
              titel="Strategien"
              eintraege={k.kaeufer.assetklassen
                .slice(0, 6)
                .map((a) => ({ label: a.label, wert: fmt.ganz(a.wert) }))}
            />
            <Randliste
              titel="Investorentypen"
              eintraege={k.kaeufer.investorTypen
                .slice(0, 6)
                .map((a) => ({ label: a.label, wert: fmt.ganz(a.wert) }))}
            />
            <Text style={{ fontSize: 7, color: F.textHell }}>
              {t(
                `${fmt.ganz(k.kaeufer.profile)} Ankaufsprofile, ${fmt.ganz(k.kaeufer.mitVolumen)} mit Volumenangabe. Quelle: Grenz & Co., Salesforce.`,
              )}
            </Text>
          </>
        }
      >
        <Balken
          pos={{ x: 0.35, y: 1.65, w: 3.4 }}
          titel="Gesuchtes Volumen je Profil"
          werte={k.kaeufer.volumenbaender}
          format={fmt.ganz}
        />
        <Balken
          pos={{ x: 3.95, y: 1.65, w: 3.4 }}
          titel="Profile mit Suchregion"
          werte={k.kaeufer.regionen}
          format={fmt.ganz}
        />
        <Absatz text={x.nachfrage} pos={{ x: 0.35, y: 4.4, w: 6.9 }} />
      </Rahmen>

      {/* Vermarktung und Marktgeschehen */}
      <Rahmen
        titel="Vermarktung"
        untertitel="Grenz & Co. im Markt und Meldungen aus dem Markt-Radar"
        seite={naechste()}
        kopf={kopf}
        stempel={stempel}
        rand={
          <Randliste
            titel="Markt-Radar"
            eintraege={[
              {
                label: "Meldungen aktive Käufer",
                wert: fmt.ganz(k.radar.kaeufer),
              },
              {
                label: "Meldungen mögliche Verkäufer",
                wert: fmt.ganz(k.radar.verkaeufer),
              },
            ]}
          />
        }
      >
        <Tabelle
          pos={{ x: 0.35, y: 1.6, w: 7.0 }}
          kopf={["Kennzahl", periode, "Vorjahreszeitraum"]}
          breiten={[3.6, 1.7, 1.7]}
          rechts={[1, 2]}
          zeilen={[
            ["Neue Mandate", "neueMandate", fmt.ganz],
            ["Abschlüsse", "abschluesse", fmt.ganz],
            [
              "Abschlussvolumen",
              "abschlussVolumen",
              (w: number) => (w ? fmt.mio(w) : "–"),
            ],
            ["Verlorene Interessenten", "verloren", fmt.ganz],
          ].map(([l, f, format]) => {
            const feld = f as keyof typeof k.vermarktung;
            const fm = format as (w: number) => string;
            return [
              l as string,
              fm(k.vermarktung[feld]),
              fm(k.vermarktungVorperiode[feld]),
            ];
          })}
        />
        {k.radar.auswahl.length ? (
          <Tabelle
            pos={{ x: 0.35, y: 3.25, w: 7.0 }}
            kopf={["Akteur", "Meldung", "Ort", "Volumen"]}
            breiten={[1.6, 3.6, 0.9, 0.9]}
            rechts={[3]}
            zeilen={k.radar.auswahl
              .slice(0, 5)
              .map((m) => [
                m.akteur,
                m.ereignis.length > 110
                  ? `${m.ereignis.slice(0, 107)}…`
                  : m.ereignis,
                m.ort ?? "–",
                m.volumen ? fmt.mio(m.volumen) : "–",
              ])}
          />
        ) : null}
        <Absatz text={x.vermarktung} pos={{ x: 0.35, y: 5.75, w: 6.9 }} />
      </Rahmen>

      {/* Vergleichswerte anderer Häuser */}
      {benchmarks.length ? (
        <Rahmen
          titel="Marktdaten im Vergleich"
          untertitel="Zitierte Kennzahlen anderer Häuser und öffentlicher Stellen"
          seite={naechste()}
          kopf={kopf}
          stempel={stempel}
          rand={
            <Text style={{ fontSize: 8, color: F.navy, lineHeight: 1.4 }}>
              Die Werte stammen aus den genannten Veröffentlichungen und werden
              mit Quelle und Stand zitiert. Abgrenzungen und Methodik der Häuser
              unterscheiden sich; die Werte sind daher nur eingeschränkt
              vergleichbar.
            </Text>
          }
        >
          <Tabelle
            pos={{ x: 0.35, y: 1.6, w: 7.0 }}
            kopf={[
              "Kennzahl",
              "Region",
              "Wert",
              "Veränderung",
              "Quelle",
              "Stand",
            ]}
            breiten={[1.75, 0.9, 0.95, 0.9, 1.75, 0.75]}
            rechts={[2]}
            zeilen={benchmarks
              .slice(0, 16)
              .map((bm) => [
                bm.kennzahl,
                bm.region || "–",
                fmt.wert(bm.wert, bm.einheit),
                bm.veraenderung ?? "–",
                `${bm.quelle}${bm.seite ? `, S. ${bm.seite}` : ""}`,
                fmt.datum(bm.stichtag),
              ])}
          />
        </Rahmen>
      ) : null}

      {/* Ausblick */}
      <Rahmen
        titel="Ausblick"
        untertitel="Trend der Periode und Erwartung für das nächste Halbjahr"
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
            </View>
          ) : null
        }
      >
        <Absatz
          text={x.ausblick}
          pos={{ x: 0.35, y: 1.7, w: 6.9 }}
          groesse={11}
        />
      </Rahmen>

      {/* Methodik, Quellen, Kontakt */}
      <Rahmen
        titel="Methodik und Quellen"
        untertitel="Datengrundlage, Begriffe und Hinweise"
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
          </View>
        }
      >
        <View style={abs({ x: 0.35, y: 1.65, w: 6.9 })}>
          {[
            [
              "Angebotsmarkt",
              "Alle bei Grenz & Co. eingegangenen Exposés für Zinshäuser, Mehrfamilien- und Wohn- und Geschäftshäuser. Preis, Ist-Miete und Fläche werden per KI mit Belegzitat aus dem Exposé gelesen. Faktor = Angebotspreis / Jahresnettokaltmiete. Angebotswerte, keine Kaufpreise.",
            ],
            [
              "Teilmärkte",
              "Köln, Düsseldorf und Bonn nach Stadtgebiet; übriges Rheinland = Regierungsbezirke Köln und Düsseldorf; übriges NRW = Westfalen und östliches Ruhrgebiet.",
            ],
            [
              "Fallzahlen",
              `Median und Spanne (25. bis 75. Perzentil) werden erst ab ${MINDEST_FALLZAHL} Fällen je Zelle ausgewiesen.`,
            ],
            [
              "Nachfrage",
              "Ankaufsprofile der Investoren in der Grenz-Datenbank (Salesforce). Volumenband nach Höchstvolumen, sonst Mindestvolumen.",
            ],
            [
              "Zinsumfeld",
              "Deutsche Bundesbank: Effektivzinssätze für Wohnungsbaukredite an private Haushalte mit Zinsbindung über 10 Jahre (Neugeschäft) und Rendite börsennotierter Bundeswertpapiere mit 10 Jahren Restlaufzeit.",
            ],
            [
              "Zitierte Werte",
              "Kennzahlen anderer Häuser werden mit Herausgeber, Seite und Stand zitiert und nicht verändert.",
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
            Disclaimer
          </Text>
          <Text style={{ fontSize: 7.5, lineHeight: 1.35, color: F.textHell }}>
            {t(DISCLAIMER)}
          </Text>
          {k.zinsen.fehler ? (
            <Text style={{ fontSize: 7, color: F.runter, marginTop: 4 }}>
              {t(k.zinsen.fehler)}
            </Text>
          ) : null}
        </View>
      </Rahmen>
    </Document>
  );
}

export async function marktberichtAlsPdf(b: MarktberichtVoll): Promise<Buffer> {
  return renderToBuffer(<MarktberichtDokument b={b} />);
}
