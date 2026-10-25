/**
 * Live-Vorschau des Vermarktungsberichts im Layout der Grenz-Vorlage (A4 quer).
 * Maße in Zoll wie in PDF und PowerPoint, umgerechnet in Prozent der Folienbreite.
 */

import type { CSSProperties, ReactNode } from "react";

import logoWeiss from "@/assets/grenz-co-logo-weiss.png";
import wortmarkeWeiss from "@/assets/grenz-co-wortmarke-weiss.png";
import {
  BERICHT_FARBEN as F,
  tortenStuecke,
  type BerichtStand,
} from "@/lib/mandate/vermarktungsbericht";

const B = 11.69;
const H = 8.27;

/** Position in Zoll → absolute Prozentwerte. */
const pos = (x: number, y: number, w: number, h?: number): CSSProperties => ({
  position: "absolute",
  left: `${(x / B) * 100}%`,
  top: `${(y / H) * 100}%`,
  width: `${(w / B) * 100}%`,
  ...(h != null ? { height: `${(h / H) * 100}%` } : {}),
});

/** Schriftgröße in Punkt relativ zur Folienbreite (Container-Einheit). */
const pt = (n: number) => `${(n / (B * 72)) * 100}cqw`;

function Folie({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
      style={{
        aspectRatio: `${B} / ${H}`,
        containerType: "inline-size",
        fontFamily: "Roboto, 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 300,
        color: F.text,
      }}
    >
      {children}
    </div>
  );
}

function Foto({ url, style }: { url: string | null; style: CSSProperties }) {
  return url ? (
    <img src={url} alt="" style={{ ...style, objectFit: "cover" }} />
  ) : (
    <div
      style={{ ...style, background: F.grau, fontSize: pt(10) }}
      className="flex items-center justify-center text-neutral-500"
    >
      Foto hochladen
    </div>
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
    <Folie>
      <div style={{ ...pos(7.55, 0, B - 7.55, H), background: F.hellblau }} />
      <img src={wortmarkeWeiss} alt="" style={pos(9.97, 0.21, 1.48, 0.23)} />
      <div
        style={{
          ...pos(0.35, 0.43, 7.1),
          fontSize: pt(34),
          color: F.navy,
          lineHeight: 1.2,
        }}
      >
        {titel.toUpperCase()}
      </div>
      <div style={{ ...pos(0.35, 1.13, 7.1), fontSize: pt(10) }}>
        {untertitel}
      </div>
      {children}
      <div
        style={{
          ...pos(8.2, 8.0, 2.6),
          fontSize: pt(7),
          color: F.textHell,
          textAlign: "right",
        }}
      >
        {stempel
          ? `- ${stempel} · Streng vertraulich -`
          : "- Streng vertraulich -"}
      </div>
      <div
        style={{
          ...pos(10.88, 7.95, 0.36, 0.33),
          background: F.navy,
          color: "#fff",
          fontSize: pt(8),
        }}
        className="flex items-center justify-center"
      >
        {seite}
      </div>
    </Folie>
  );
}

function Tabelle({
  style,
  kopf,
  zeilen,
  gesamt,
  rechts = true,
}: {
  style: CSSProperties;
  kopf?: string;
  zeilen: [string, string][];
  gesamt?: number;
  rechts?: boolean;
}) {
  const zelle: CSSProperties = {
    padding: `${pt(3)} ${pt(6)}`,
    borderBottom: `${pt(1.5)} solid #fff`,
  };
  return (
    <table style={{ ...style, borderCollapse: "collapse", fontSize: pt(9) }}>
      <tbody>
        {kopf ? (
          <tr style={{ background: F.navy, color: "#fff" }}>
            <td style={zelle} colSpan={2}>
              {kopf}
            </td>
          </tr>
        ) : null}
        {zeilen.map(([l, w], i) => (
          <tr key={i} style={{ background: F.zeile }}>
            <td style={zelle}>{l}</td>
            <td style={{ ...zelle, textAlign: rechts ? "right" : "left" }}>
              {w}
            </td>
          </tr>
        ))}
        {gesamt != null ? (
          <tr style={{ fontWeight: 700 }}>
            <td style={zelle}>Gesamt</td>
            <td style={{ ...zelle, textAlign: "right" }}>
              {gesamt.toLocaleString("de-DE")}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function Torte({
  titel,
  werte,
  style,
  legende,
}: {
  titel: string;
  werte: { label: string; wert: number }[];
  style: CSSProperties;
  legende: "rechts" | "unten";
}) {
  const palette = legende === "unten" ? F.diagrammPanel : F.diagramm;
  const stuecke = tortenStuecke(werte, 50, 50, 49, palette);
  if (!stuecke.length)
    return (
      <div style={{ ...style, fontSize: pt(9), color: F.textHell }}>
        {titel}: noch keine Werte
      </div>
    );
  return (
    <div style={style}>
      <div
        style={{
          fontSize: pt(9),
          color: F.textHell,
          textAlign: legende === "unten" ? "center" : "left",
          marginBottom: pt(8),
        }}
      >
        {titel}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: legende === "rechts" ? "row" : "column",
          alignItems: legende === "rechts" ? "center" : "stretch",
          gap: pt(14),
        }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{
            width: legende === "rechts" ? "48%" : "100%",
            flexShrink: 0,
          }}
        >
          {stuecke.map((s) => (
            <path
              key={s.label}
              d={s.pfad}
              fill={s.farbe}
              stroke="#fff"
              strokeWidth={0.6}
            >
              <title>
                {s.label}: {s.wert} ({Math.round(s.anteil * 100)} %)
              </title>
            </path>
          ))}
        </svg>
        <div
          style={{
            fontSize: pt(8.5),
            display: "flex",
            flexDirection: "column",
            gap: pt(4),
          }}
        >
          {stuecke.map((s) => (
            <div
              key={s.label}
              style={{ display: "flex", alignItems: "center", gap: pt(5) }}
            >
              <span
                style={{
                  width: pt(6),
                  height: pt(6),
                  background: s.farbe,
                  flexShrink: 0,
                }}
              />
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Punkte({ titel, punkte }: { titel: string; punkte: string[] }) {
  if (!punkte.length) return null;
  return (
    <div style={{ marginBottom: pt(10) }}>
      <div style={{ fontStyle: "italic", marginBottom: pt(4) }}>{titel}</div>
      <ul style={{ listStyle: "disc", paddingLeft: pt(14), margin: 0 }}>
        {punkte.map((p, i) => (
          <li key={i} style={{ marginBottom: pt(2) }}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BerichtVorschau({
  b,
  fotos,
}: {
  b: BerichtStand;
  fotos: { titel: string | null; objekt: string | null };
}) {
  const zeilen = Math.max(b.status.length, b.absagegruende.length) + 2;
  const textY = Math.max(5.03, 1.61 + 0.31 * zeilen + 0.3);
  return (
    <div className="flex flex-col gap-4">
      <Folie>
        <div style={{ ...pos(0, 0, 7.4, 6.05), background: F.hellblau }} />
        <Foto
          url={fotos.titel ?? fotos.objekt}
          style={pos(0.45, 0.87, 10.79, 6.53)}
        />
        <div
          style={{
            ...pos(5.69, 4.04, 6.01, 2.48),
            background: F.navy,
            color: "#fff",
            padding: `${pt(30)} ${pt(17)} 0`,
          }}
        >
          <div style={{ fontSize: pt(20), marginBottom: pt(6) }}>
            {b.titel.toUpperCase()}
          </div>
          <div style={{ fontSize: pt(11), lineHeight: 1.35, height: pt(54) }}>
            {b.objektbezeichnung}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: pt(11),
            }}
          >
            <span>{b.auftraggeber}</span>
            <span style={{ fontSize: pt(10) }}>{b.berichtsdatum}</span>
          </div>
        </div>
        <div style={{ ...pos(0, 6.61, 3.04, 1.09), background: F.navy }} />
        <img src={logoWeiss} alt="" style={pos(0.27, 6.8, 2.5, 0.716)} />
        <div
          style={{
            ...pos(8.6, 7.5, 2.64),
            fontSize: pt(7),
            color: F.textHell,
            textAlign: "right",
          }}
        >
          {b.stempel
            ? `- ${b.stempel} · Streng vertraulich -`
            : "- Streng vertraulich -"}
        </div>
      </Folie>

      <Rahmen
        titel="Zielgruppe"
        untertitel="Angesprochene Investoren"
        seite={2}
        stempel={b.stempel}
      >
        <Foto
          url={fotos.objekt ?? fotos.titel}
          style={pos(7.03, 1.43, 4.24, 5.39)}
        />
        <Tabelle
          style={pos(0.35, 1.57, 6.33)}
          rechts={false}
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
          style={pos(0.6, 3.85, 6.2)}
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
          style={pos(0.35, 1.61, 3.33)}
          kopf="Status"
          zeilen={b.status.map((s) => [
            s.label,
            s.wert.toLocaleString("de-DE"),
          ])}
          gesamt={b.angesprochen}
        />
        {b.absagegruende.length ? (
          <Tabelle
            style={pos(3.98, 1.61, 3.23)}
            kopf="Absagegründe"
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
          style={pos(7.95, 1.61, 3.3)}
          legende="unten"
        />
        <div style={{ ...pos(0.35, textY, 6.86), fontSize: pt(9.5) }}>
          <Punkte
            titel="Bisherige Herausforderungen bei der Vermarktung:"
            punkte={b.herausforderungen}
          />
          <Punkte titel="Weiteres Vorgehen:" punkte={b.weiteresVorgehen} />
        </div>
      </Rahmen>
    </div>
  );
}
