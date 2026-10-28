import { describe, expect, it } from "vitest";

import {
  checkNorm,
  datumAusTrello,
  datumNachTrello,
  formHash,
  gewuenschteLabels,
  istVerwaltetesLabel,
  posAusTrello,
  posNachTrello,
  prioAusLabels,
  richtung,
  rsAusLabels,
  type KartenForm,
} from "./trello-form";

const form: KartenForm = {
  titel: "Exposé Moltkestraße finalisieren",
  beschreibung: "",
  faellig: "2026-10-30",
  liste: "l1",
  pos: 1_001_000,
  mitglied: null,
  prio: "hoch",
  rs: "Jour fixe",
  check: [["Fotos", true]],
};

describe("Trello-Form", () => {
  it("Fälligkeit bleibt derselbe Kalendertag, auch in der Sommerzeit", () => {
    for (const d of ["2026-03-29", "2026-07-15", "2026-10-25", "2026-12-31"]) {
      expect(datumAusTrello(datumNachTrello(d))).toBe(d);
    }
    expect(datumAusTrello("2026-10-30T23:30:00.000Z")).toBe("2026-10-31");
    expect(datumAusTrello(null)).toBeNull();
  });

  it("Positionen sind in Trello positiv und kommen unverändert zurück", () => {
    expect(posNachTrello(-5000)).toBeGreaterThan(0);
    expect(posAusTrello(posNachTrello(1500))).toBe(1500);
  });

  it("Labels für Priorität und Rücksprache", () => {
    const labels = gewuenschteLabels(form);
    expect(labels).toEqual(["Priorität hoch", "Rücksprache: Jour fixe"]);
    expect(prioAusLabels(labels)).toBe("hoch");
    expect(rsAusLabels(labels)).toBe("Jour fixe");
    expect(prioAusLabels(["Marketing"])).toBe("normal");
    expect(istVerwaltetesLabel("Marketing")).toBe(false);
    expect(istVerwaltetesLabel("Rücksprache: Jour fixe")).toBe(true);
  });

  it("Checkliste ohne leere Punkte", () => {
    expect(
      checkNorm([
        { text: " Fotos ", erledigt: true },
        { text: "  ", erledigt: false },
      ]),
    ).toEqual([["Fotos", true]]);
  });

  it("Hash hängt am Inhalt", () => {
    expect(formHash(form)).toBe(formHash({ ...form }));
    expect(formHash(form)).not.toBe(formHash({ ...form, titel: "Anders" }));
    expect(formHash(form)).toHaveLength(16);
  });
});

describe("Richtung des Abgleichs", () => {
  const alt = formHash(form);
  const app = formHash({ ...form, titel: "In der App geändert" });
  const trello = formHash({ ...form, titel: "In Trello geändert" });
  const t1 = "2026-10-28T09:00:00Z";
  const t2 = "2026-10-28T10:00:00Z";

  it("nichts zu tun", () =>
    expect(richtung(alt, alt, alt, t1, t2)).toBe("gleich"));
  it("nur die App geändert", () =>
    expect(richtung(app, alt, alt, t1, t2)).toBe("nach_trello"));
  it("nur Trello geändert", () =>
    expect(richtung(alt, trello, alt, t2, t1)).toBe("aus_trello"));
  it("beide geändert: jüngere gewinnt", () => {
    expect(richtung(app, trello, alt, t1, t2)).toBe("aus_trello");
    expect(richtung(app, trello, alt, t2, t1)).toBe("nach_trello");
  });
  it("erster Abgleich ohne Stand: jüngere gewinnt", () => {
    expect(richtung(app, trello, null, t2, t1)).toBe("nach_trello");
  });
});
