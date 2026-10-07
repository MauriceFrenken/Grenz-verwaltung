import { describe, expect, it } from "vitest";
import {
  MockKlassifikator,
  kiAntwortSchema,
  type EingangsMail,
} from "@/lib/ai/klassifikation";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import { ABLAGE_ERWARTUNGEN, ABLAGE_MAILS } from "../testset";
import {
  ablageVorschlag,
  AUTO_SCHWELLE,
  dateiname,
  kontextAus,
  messen,
  ordnerFuer,
  ordnerGruppe,
  quoten,
  regelStufe,
} from "./ablage";

const d = erzeugeSeed("2026-10-07");
const k = kontextAus(d);
const ki = new MockKlassifikator();
const mail = (teil: Partial<EingangsMail>): EingangsMail => ({
  id: "T1",
  empfangen: "2026-10-01T09:00:00",
  absender: "a@b.example",
  betreff: "",
  text: "",
  anhang: "",
  ...teil,
});
const vorschlag = (m: EingangsMail) =>
  ablageVorschlag(m, k, ki.klassifiziereSync(m, k));

describe("Ablage v2: Benennung und Ordner", () => {
  it("benennt nach JJJJ-MM-TT_Dokumenttyp_Objekt-ID_Kurzbeschreibung", () => {
    expect(
      dateiname(
        "2026-09-12",
        "Rechnung",
        "IM-2018-002",
        "Dachrinnenreinigung Lindenhof",
      ),
    ).toBe("2026-09-12_Rechnung_IM-2018-002_Dachrinnenreinigung-Lindenhof.pdf");
    expect(
      dateiname(
        "2026-07-24",
        "Kündigung",
        "IM-2018-002",
        "Kündigung meiner Wohnung",
      ),
    ).toBe("2026-07-24_Kuendigung_IM-2018-002_Kuendigung-meiner-Wohnung.pdf");
    expect(
      dateiname(
        "2026-09-10",
        "Steuerbescheid",
        "MH",
        "Bescheid: KSt/2025 <final>",
      ),
    ).toBe("2026-09-10_Steuerbescheid_MH_Bescheid-KSt-2025-final.pdf");
  });

  it("ordnet Ordner nach Dokumenttyp, Bezug und Jahr", () => {
    expect(ordnerFuer("Rechnung", "IM-2018-002", "2026-09-12")).toBe(
      "Objekte/IM-2018-002/Rechnungen/2026",
    );
    expect(ordnerFuer("Rechnung", null, "2025-12-30")).toBe(
      "Buchhaltung/Eingangsrechnungen/2025",
    );
    expect(ordnerFuer("Zinsmitteilung", "DL-2018-002", "2026-09-30")).toBe(
      "Finanzen/Darlehen/DL-2018-002",
    );
    expect(ordnerFuer("Kündigung", null, "2026-09-30")).toBe(
      "Eingang/Zu klären",
    );
    expect(ordnerGruppe("Objekte/IM-2018-002/Rechnungen/2026")).toBe(
      "Objekte/…/Rechnungen",
    );
  });
});

describe("Ablage v2: Regeln und KI", () => {
  it("löst Bank-Referenzen über das Darlehensregister auf", () => {
    const r = regelStufe(
      mail({
        betreff: "Zinsmitteilung BK-2018-014",
        text: "fällig zum 30.09.2026: 9.412,77 €",
      }),
      k,
    );
    expect(r.bezugId?.wert).toBe("DL-2018-002");
    expect(r.gesellschaftId?.wert).toBe("c-mi");
    expect(r.dokumenttyp?.wert).toBe("Zinsmitteilung");
    expect(r.datum?.wert).toBe("2026-09-30");
    expect(r.betrag?.wert).toBe(9412.77);
  });

  it("liefert strukturierte Ausgabe nach Schema, deterministisch", () => {
    const m = ABLAGE_MAILS[1];
    const a = ki.klassifiziereSync(m, k);
    expect(() => kiAntwortSchema.parse(a)).not.toThrow();
    expect(ki.klassifiziereSync(m, k)).toEqual(a);
  });

  it("legt eindeutige Fälle automatisch ab, unsichere kommen auf die Prüfliste", () => {
    const sicher = vorschlag(
      mail({
        betreff: "Rechnung 4411 IM-2018-002",
        text: "Rechnung vom 12.09.2026 über 1.428,00 €",
        anhang: "Rechnung_4411.pdf",
      }),
    );
    expect(sicher.pruefen).toBe(false);
    expect(sicher.konfidenz).toBeGreaterThanOrEqual(AUTO_SCHWELLE);
    expect(sicher.gesellschaftId.quelle).toBe("regel");
    expect(sicher.dokumenttyp.quelle).toBe("regel+ki");
    expect(sicher.dateiname).toBe(
      "2026-09-12_Rechnung_IM-2018-002_Rechnung-4411.pdf",
    );

    const unsicher = vorschlag(
      mail({
        betreff: "Rechnung Dachrinne",
        text: "Reparatur an Ihrem Haus in Düsseldorf, Datum 29.09.2026",
      }),
    );
    expect(unsicher.pruefen).toBe(true);
    expect(unsicher.unsicher).toContain("Gesellschaft");
  });

  it("verlangt bei Mietdokumenten einen Objektbezug", () => {
    const v = vorschlag(
      mail({
        betreff: "Kündigung",
        text: "Ich kündige meine Wohnung zum 31.12.2026.",
      }),
    );
    expect(v.ordner).toBe("Eingang/Zu klären");
    expect(v.pruefen).toBe(true);
    expect(v.unsicher).toContain("Bezug");
  });
});

describe("Ablage v2: Messung gegen das Testset", () => {
  const vs = ABLAGE_MAILS.map(vorschlag);
  const kurz = (id: string | null) =>
    d.companies.find((c) => c.id === id)?.shortName ?? null;
  const erg = messen(vs, ABLAGE_ERWARTUNGEN, kurz);

  it("umfasst 30 Mails über alle Gesellschaften", () => {
    expect(ABLAGE_MAILS).toHaveLength(30);
    expect(
      new Set([...ABLAGE_ERWARTUNGEN.values()].map((e) => e.gesellschaft)).size,
    ).toBeGreaterThanOrEqual(9);
  });

  it("legt nichts falsch ab, ohne es zur Prüfung vorzulegen", () => {
    expect(erg.filter((e) => e.fehlablage)).toEqual([]);
    const q = quoten(erg, () => "alle")[0];
    expect(q.quote).toBeGreaterThanOrEqual(0.9);
  });

  it("rechnet Quoten je Gesellschaft", () => {
    const q = quoten(erg, (e) => e.erwartet.gesellschaft ?? "(keine)");
    expect(q.reduce((s, x) => s + x.anzahl, 0)).toBe(30);
    expect(q.every((x) => x.quote >= 0 && x.quote <= 1)).toBe(true);
  });
});
