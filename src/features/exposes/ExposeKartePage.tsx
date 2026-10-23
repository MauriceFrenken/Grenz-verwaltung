import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { euroKurz, prozent, zahl1 } from "@/features/kennzahlen/hilfen";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type {
  KartenObjekt,
  VergleichErgebnis,
} from "@/lib/expose-karte/server-fn";
import { formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Leaflet kommt zur Laufzeit vom CDN, damit kein Build-Abhängigkeit nötig ist. */
const LEAFLET_JS =
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const LEAFLET_CSS =
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";

/* Feste Kategorienfarben wie in der Exposé-Auswertung (--viz-1 … --viz-5). */
const FARBEN = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const FARBE_SONST = "#8a97ab";

// Minimaler Ausschnitt der Leaflet-API, den die Seite nutzt.
type LMarker = {
  bindPopup: (html: string, opt?: object) => LMarker;
  openPopup: () => void;
  addTo: (m: LMap) => LMarker;
  on: (ev: string, fn: () => void) => void;
};
type LMap = {
  setView: (c: [number, number], z: number) => LMap;
  flyTo: (c: [number, number], z: number) => void;
  fitBounds: (b: Array<[number, number]>, opt?: object) => void;
  removeLayer: (l: unknown) => void;
  remove: () => void;
};
type Leaflet = {
  map: (el: HTMLElement, opt?: object) => LMap;
  tileLayer: (url: string, opt: object) => { addTo: (m: LMap) => void };
  circleMarker: (c: [number, number], opt: object) => LMarker;
  layerGroup: () => {
    addTo: (m: LMap) => unknown;
    clearLayers: () => void;
    addLayer: (l: unknown) => void;
  };
};

let leafletLaden: Promise<Leaflet> | null = null;

function ladeLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  if (!leafletLaden) {
    leafletLaden = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = LEAFLET_JS;
      js.async = true;
      js.onload = () =>
        w.L ? resolve(w.L) : reject(new Error("Leaflet fehlt"));
      js.onerror = () => {
        leafletLaden = null;
        reject(new Error("Kartenbibliothek konnte nicht geladen werden."));
      };
      document.head.appendChild(js);
    });
  }
  return leafletLaden;
}

function esc(t: string | null | undefined): string {
  return (t ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function euro(n: number | null): string {
  return n ? euroKurz(n) : "–";
}

function zeilen(o: KartenObjekt): Array<[string, string]> {
  return [
    ["Objektart", o.objektart ?? "–"],
    ["Baujahr", o.baujahr ? String(o.baujahr) : "–"],
    ["Einheiten", o.einheiten ? formatInt(o.einheiten) : "–"],
    ["Fläche", o.flaeche ? `${formatInt(Math.round(o.flaeche))} m²` : "–"],
    ["Jahresmiete (IST)", euro(o.miete)],
    ["Miete je m²", o.mieteQm ? `${zahl1(o.mieteQm)} €` : "–"],
    ["Kaufpreis", euro(o.preis)],
    ["Preis je m²", o.preisQm ? `${formatInt(o.preisQm)} €` : "–"],
    ["Faktor", o.faktor ? `${zahl1(o.faktor)}-fach` : "–"],
    ["Bruttorendite", o.rendite ? prozent(o.rendite, 1) : "–"],
    ["Energieklasse", o.energieklasse ?? "–"],
    ["Makler", o.makler ?? "–"],
    ["Eingang", formatDate(o.eingegangenAm)],
  ];
}

function popupHtml(o: KartenObjekt): string {
  const titel = esc(o.adresse ?? "Adresse unbekannt");
  const ort = esc([o.plz, o.stadt].filter(Boolean).join(" "));
  const tabelle = zeilen(o)
    .map(
      ([k, v]) =>
        `<tr><td style="color:#5a6a85;padding:1px 12px 1px 0">${esc(k)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${esc(v)}</td></tr>`,
    )
    .join("");
  const hinweis = o.genau
    ? ""
    : `<div style="margin-top:6px;color:#b45309;font-size:11px">Lage ungefähr (nur Ort bekannt)</div>`;
  return `<div style="font-size:12px;min-width:220px"><div style="font-weight:600;font-size:13px">${titel}</div><div style="color:#5a6a85;margin-bottom:6px">${ort}</div><table style="width:100%;border-collapse:collapse">${tabelle}</table>${hinweis}</div>`;
}

/** Karte aller Exposés mit Eckdaten — Grundlage für Vergleichsobjekte im Kundengespräch. */
export function ExposeKartePage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [objekte, setObjekte] = useState<KartenObjekt[] | null>(null);
  const [offen, setOffen] = useState(0);
  const [art, setArt] = useState<string>("alle");
  const [suche, setSuche] = useState("");
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [projektText, setProjektText] = useState("");
  const [vergleich, setVergleich] = useState<VergleichErgebnis | null>(null);
  const [sucht, setSucht] = useState(false);

  const kartenEl = useRef<HTMLDivElement>(null);
  const karte = useRef<{
    L: Leaflet;
    map: LMap;
    ebene: ReturnType<Leaflet["layerGroup"]>;
  } | null>(null);
  const marker = useRef(new Map<string, LMarker>());
  const ersterZuschnitt = useRef(true);

  // Daten laden; fehlende Koordinaten werden serverseitig in kleinen Portionen ergänzt.
  useEffect(() => {
    if (!token) return;
    let aktiv = true;
    void (async () => {
      try {
        const { exposeKarteLadenFn } =
          await import("@/lib/expose-karte/server-fn");
        for (let runde = 0; runde < 20 && aktiv; runde++) {
          const d = await exposeKarteLadenFn({
            data: { supabaseAccessToken: token },
          });
          if (!aktiv) return;
          setObjekte(d.objekte);
          setOffen(d.offen);
          if (d.offen === 0) break;
        }
      } catch (err) {
        toast.error(apiFehlermeldung(err));
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [token]);

  // Karte einmalig aufbauen.
  useEffect(() => {
    let abbruch = false;
    void ladeLeaflet()
      .then((L) => {
        if (abbruch || !kartenEl.current || karte.current) return;
        const map = L.map(kartenEl.current, { scrollWheelZoom: true }).setView(
          [51.0, 7.0],
          8,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap-Mitwirkende",
        }).addTo(map);
        const ebene = L.layerGroup();
        ebene.addTo(map);
        karte.current = { L, map, ebene };
        setObjekte((o) => (o ? [...o] : o)); // Marker zeichnen, falls Daten schon da sind
      })
      .catch((err) => toast.error(apiFehlermeldung(err)));
    return () => {
      abbruch = true;
      karte.current?.map.remove();
      karte.current = null;
    };
  }, []);

  const arten = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of objekte ?? []) {
      if (o.objektart) m.set(o.objektart, (m.get(o.objektart) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [objekte]);

  const farbeVon = (a: string | null) => {
    const i = a ? arten.indexOf(a) : -1;
    return i >= 0 && i < FARBEN.length ? FARBEN[i] : FARBE_SONST;
  };

  const vergleichInfo = useMemo(
    () => new Map((vergleich?.treffer ?? []).map((t) => [t.id, t])),
    [vergleich],
  );

  const sichtbar = useMemo(() => {
    if (vergleich) {
      const nachId = new Map((objekte ?? []).map((o) => [o.id, o]));
      return vergleich.treffer.flatMap((t) => {
        const o = nachId.get(t.id);
        return o ? [o] : [];
      });
    }
    const q = suche.trim().toLowerCase();
    return (objekte ?? []).filter(
      (o) =>
        o.lat !== null &&
        o.lng !== null &&
        (art === "alle" || o.objektart === art) &&
        (!q ||
          [o.adresse, o.plz, o.stadt, o.makler]
            .filter(Boolean)
            .some((t) => t!.toLowerCase().includes(q))),
    );
  }, [objekte, art, suche, vergleich]);

  const ohneLage = (objekte ?? []).filter((o) => o.lat === null).length;

  // Marker neu zeichnen, wenn sich Daten oder Filter ändern.
  useEffect(() => {
    const k = karte.current;
    if (!k) return;
    k.ebene.clearLayers();
    marker.current.clear();
    const projekt = vergleich?.projekt;
    const punkte: Array<[number, number]> = [];
    if (projekt?.lat != null && projekt.lng != null) {
      const p = k.L.circleMarker([projekt.lat, projekt.lng], {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: "#1a2b4b",
        fillOpacity: 1,
      }).bindPopup(
        `<div style="font-size:12px"><b>Ihr Projekt</b><br>${esc(
          [projekt.strasse, projekt.plz, projekt.ort]
            .filter(Boolean)
            .join(", "),
        )}</div>`,
      );
      k.ebene.addLayer(p);
      punkte.push([projekt.lat, projekt.lng]);
    }
    for (const o of sichtbar) {
      if (o.lat === null || o.lng === null) continue;
      punkte.push([o.lat, o.lng]);
      const m = k.L.circleMarker([o.lat, o.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 1.5,
        fillColor: farbeVon(o.objektart),
        fillOpacity: o.genau ? 0.9 : 0.45,
        dashArray: o.genau ? undefined : "3",
      }).bindPopup(popupHtml(o), { maxWidth: 320 });
      m.on("click", () => setAuswahl(o.id));
      k.ebene.addLayer(m);
      marker.current.set(o.id, m);
    }
    if (
      punkte.length > 0 &&
      (ersterZuschnitt.current || art !== "alle" || suche || vergleich)
    ) {
      k.map.fitBounds(punkte, { padding: [30, 30], maxZoom: 14 });
      ersterZuschnitt.current = false;
    }
    // farbeVon hängt nur an arten, das in sichtbar schon steckt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sichtbar, vergleich]);

  const vergleichSuchen = async () => {
    if (!projektText.trim() || !token) return;
    setSucht(true);
    try {
      const { exposeVergleichSuchenFn } =
        await import("@/lib/expose-karte/server-fn");
      const e = await exposeVergleichSuchenFn({
        data: { supabaseAccessToken: token, text: projektText },
      });
      setVergleich(e);
      setAuswahl(null);
      if (e.treffer.length === 0)
        toast.info("Keine passenden Vergleichsobjekte gefunden.");
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setSucht(false);
    }
  };

  const zeige = (o: KartenObjekt) => {
    const k = karte.current;
    if (!k || o.lat === null || o.lng === null) return;
    setAuswahl(o.id);
    k.map.flyTo([o.lat, o.lng], 15);
    marker.current.get(o.id)?.openPopup();
  };

  return (
    <>
      <PageHeader
        titel="Exposé-Karte"
        beschreibung="Lage und Eckdaten aller eingegangenen Exposés, z. B. als Vergleichsobjekte im Kundengespräch"
      />
      <PageWrapper>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4">
            <div>
              <h2 className="text-sm font-semibold text-heading">
                Vergleichsobjekte für ein Projekt
              </h2>
              <p className="text-xs text-text-muted">
                Beschreibe das Objekt deines Kunden, z. B. „MFH in Neuss, Am
                Baldhof 12, 14 WE, ca. 950 m², Baujahr 1965, IST-Miete 92 T€ p.
                a., Preisvorstellung 2,1 Mio“. Die KI sucht passende Exposés
                heraus.
              </p>
            </div>
            <Textarea
              value={projektText}
              onChange={(e) => setProjektText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void vergleichSuchen();
                }
              }}
              rows={3}
              placeholder="Projekt beschreiben…"
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void vergleichSuchen()}
                disabled={sucht || !projektText.trim() || objekte === null}
              >
                {sucht
                  ? "Suche Vergleichsobjekte…"
                  : "Vergleichsobjekte suchen"}
              </Button>
              {vergleich ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setVergleich(null)}
                >
                  Alle Exposés zeigen
                </Button>
              ) : null}
            </div>
            {vergleich ? (
              <div className="rounded-md bg-surface-muted p-3 text-sm text-heading">
                <p className="mb-1 text-xs text-text-muted">
                  {vergleich.treffer.length} Vergleichsobjekte
                  {vergleich.projekt.lat === null
                    ? " · Lage des Projekts nicht gefunden, Entfernungen fehlen"
                    : ""}
                </p>
                <p className="whitespace-pre-line">{vergleich.einschaetzung}</p>
              </div>
            ) : null}
          </section>

          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              vergleich && "pointer-events-none opacity-40",
            )}
          >
            <button
              type="button"
              onClick={() => setArt("alle")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                art === "alle"
                  ? "border-heading bg-heading text-surface"
                  : "border-hairline bg-surface text-heading",
              )}
            >
              Alle
            </button>
            {arten.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArt(a)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                  art === a
                    ? "border-heading bg-heading text-surface"
                    : "border-hairline bg-surface text-heading",
                )}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: farbeVon(a) }}
                />
                {a}
              </button>
            ))}
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Ort, PLZ, Straße oder Makler"
              className="ml-auto h-8 w-64 text-sm"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div
              ref={kartenEl}
              className="z-0 h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-hairline bg-surface"
            />
            <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-lg border border-hairline bg-surface">
              <div className="border-b border-hairline px-4 py-3 text-xs text-text-muted">
                {objekte === null
                  ? "Lädt…"
                  : vergleich
                    ? `${sichtbar.length} Vergleichsobjekte`
                    : `${sichtbar.length} Objekte auf der Karte`}
                {offen > 0 ? ` · ${offen} Adressen werden noch gesucht…` : ""}
                {ohneLage > 0 && offen === 0
                  ? ` · ${ohneLage} ohne erkennbare Adresse`
                  : ""}
              </div>
              <ul className="flex-1 overflow-y-auto">
                {sichtbar.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => zeige(o)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-hairline px-4 py-2.5 text-left hover:bg-muted/50",
                        auswahl === o.id && "bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-heading">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: farbeVon(o.objektart) }}
                        />
                        <span className="truncate">
                          {o.adresse ?? "Adresse unbekannt"}
                        </span>
                      </span>
                      <span className="text-xs text-text-muted">
                        {[o.plz, o.stadt].filter(Boolean).join(" ")}
                        {o.objektart ? ` · ${o.objektart}` : ""}
                      </span>
                      <span className="text-xs tabular-nums text-text-muted">
                        {[
                          o.einheiten ? `${formatInt(o.einheiten)} WE` : null,
                          o.flaeche
                            ? `${formatInt(Math.round(o.flaeche))} m²`
                            : null,
                          o.miete ? `${euroKurz(o.miete)} p. a.` : null,
                          o.preis ? `KP ${euroKurz(o.preis)}` : null,
                          o.faktor ? `${zahl1(o.faktor)}-fach` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Keine Eckdaten"}
                      </span>
                      {vergleichInfo.get(o.id) ? (
                        <span className="text-xs text-heading">
                          {vergleichInfo.get(o.id)!.km !== null
                            ? `${zahl1(vergleichInfo.get(o.id)!.km!)} km · `
                            : ""}
                          {vergleichInfo.get(o.id)!.begruendung}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Werte wie im Exposé angegeben. Blasse, gestrichelte Punkte: nur der
            Ort war erkennbar, die Lage ist ungefähr. Kartendaten ©
            OpenStreetMap.
          </p>
        </div>
      </PageWrapper>
    </>
  );
}
