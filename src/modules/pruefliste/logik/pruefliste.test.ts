import { describe, expect, it } from "vitest";
import { MockKlassifikator } from "@/lib/ai/klassifikation";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { ReviewItem } from "@/lib/db/typen";
import { ablageVorschlag, kontextAus } from "@/modules/ablage-v2/logik/ablage";
import { ABLAGE_MAILS } from "@/modules/ablage-v2/testset";
import { darlehenAuswerten } from "@/modules/darlehen/useDarlehen";
import { immobilienAuswerten } from "@/modules/immobilien/logik/objekte";
import { liquiditaetAuswerten } from "@/modules/liquiditaet/logik/liquiditaet";
import {
  ablagePruefFaelle,
  faelligDieseWoche,
  liquiditaetPruefFaelle,
  pruefFallZiel,
  prueflisteZusammenfuehren,
} from "./pruefliste";

const STICHTAG = "2026-10-07";
const d = erzeugeSeed(STICHTAG);
const dl = darlehenAuswerten(d);
const im = immobilienAuswerten(d, dl.staende);
const l = liquiditaetAuswerten(d, dl.staende, im.projekte);

const fall = (
  id: string,
  severity: "rot" | "gelb",
  dueDate: string | null,
): ReviewItem => ({
  id,
  source: "darlehen",
  severity,
  title: id,
  detail: "",
  companyId: null,
  refType: null,
  refId: null,
  dueDate,
  createdAt: STICHTAG,
  status: "offen",
  confidence: null,
});

describe("Gemeinsame Prüfliste", () => {
  it("sortiert offen vor erledigt, rot vor gelb, dann nach Fälligkeit und entfernt Dubletten", () => {
    const liste = prueflisteZusammenfuehren(
      [
        [fall("a", "gelb", "2026-10-01"), fall("b", "rot", "2026-12-01")],
        [
          fall("c", "rot", "2026-10-09"),
          fall("a", "gelb", "2026-10-01"),
          fall("d", "gelb", null),
        ],
      ],
      new Set(["c"]),
    );
    expect(liste.map((f) => f.id)).toEqual(["b", "a", "d", "c"]);
    expect(liste.at(-1)!.status).toBe("erledigt");
  });

  it("erzeugt Liquiditätsfälle: rot im 13-Wochen-Horizont, gelb später", () => {
    const f = liquiditaetPruefFaelle(l);
    const mbt = f.find((x) => x.companyId === "c-mbt")!;
    expect(mbt.severity).toBe("rot");
    expect(mbt.detail).toContain("Treiber");
    expect(f.find((x) => x.companyId === "c-mv")!.severity).toBe("gelb");
    expect(f.every((x) => x.source === "liquiditaet")).toBe(true);
  });

  it("legt jede unsichere Ablage als Prüffall mit Konfidenz an", () => {
    const k = kontextAus(d);
    const ki = new MockKlassifikator();
    const vs = ABLAGE_MAILS.map((m) =>
      ablageVorschlag(m, k, ki.klassifiziereSync(m, k)),
    );
    const f = ablagePruefFaelle(vs, STICHTAG);
    expect(f).toHaveLength(vs.filter((v) => v.pruefen).length);
    expect(f.every((x) => x.confidence !== null && x.confidence < 0.9)).toBe(
      true,
    );
  });

  it("verlinkt Prüffälle in das richtige Modul", () => {
    const rueck = im.pruefFaelle.find((x) =>
      x.id.startsWith("immobilien:rueckstand"),
    )!;
    const z = pruefFallZiel(rueck, d);
    expect(z.to).toBe("/board/immobilien");
    expect(z.search?.mietvertrag).toBe(rueck.refId);
    expect(z.search?.objekt).toMatch(/^IM-\d{4}-\d{3}$/);
    const frist = dl.pruefFaelle.find((x) =>
      x.id.startsWith("darlehen:frist"),
    )!;
    expect(pruefFallZiel(frist, d)).toEqual({
      to: "/board/darlehen",
      search: { darlehen: frist.refId },
    });
  });
});

describe("Cockpit: Fällig diese Woche", () => {
  it("zeigt überfällige Rechnungen und Ausgänge der nächsten 7 Tage, ohne interne Umlagen", () => {
    const f = faelligDieseWoche(d, l.bewegungen);
    const ueber = d.invoices.filter(
      (r) =>
        r.status === "offen" &&
        r.direction === "eingang" &&
        r.dueDate <= STICHTAG,
    );
    expect(f.filter((p) => p.ueberfaellig)).toHaveLength(ueber.length);
    expect(f.every((p) => p.datum <= "2026-10-14")).toBe(true);
    expect(f.every((p) => p.betrag < 0)).toBe(true);
    expect(f.some((p) => /Umlage/.test(p.label))).toBe(false);
  });
});
