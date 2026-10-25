import { describe, expect, it } from "vitest";

import { musterInhalt as muster } from "./muster";
import {
  abschnitteNachVorlage,
  standardVorlage,
  vorlageZusammenfuehren,
} from "./standard";

describe("Vorlage", () => {
  it("legt gespeicherte Werte über den Standard und behält neue Standardabschnitte", () => {
    const v = vorlageZusammenfuehren("eigentuemer_report", {
      id: "x",
      design: { farben: { akzent: "#ff0000" } },
      abschnitte: [
        { id: "marktfeedback", titel: "Feedback", sichtbar: true },
        { id: "funnel", titel: "Funnel", sichtbar: false },
      ],
    });
    expect(v.design.farben.akzent).toBe("#ff0000");
    expect(v.design.farben.primaer).toBe("#233567");
    expect(v.abschnitte.map((a) => a.id).slice(0, 3)).toEqual([
      "marktfeedback",
      "funnel",
      "ueberblick",
    ]);
  });

  it("ordnet Inhalte nach Vorlage und blendet aus", () => {
    const v = vorlageZusammenfuehren("eigentuemer_report", {
      abschnitte: [
        { id: "funnel", titel: "Funnel", sichtbar: false },
        { id: "angebote", titel: "Kaufangebote", sichtbar: true },
      ],
    });
    const inhalt = abschnitteNachVorlage(
      [
        { id: "funnel", titel: "a", bloecke: [] },
        { id: "angebote", titel: "b", bloecke: [] },
        { id: "ueberblick", titel: "c", bloecke: [] },
      ],
      v,
    );
    expect(inhalt.map((a) => `${a.id}:${a.titel}`)).toEqual([
      "angebote:Kaufangebote",
      "ueberblick:Überblick",
    ]);
  });
});

describe("Rendering", () => {
  it("erzeugt PDF und PPTX aus derselben Definition", async () => {
    const { dokumentAlsPdf } = await import("./pdf");
    const { dokumentAlsPptx } = await import("./pptx");
    const pdf = await dokumentAlsPdf(muster(), standardVorlage("allgemein"));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const pptx = await dokumentAlsPptx(muster(), standardVorlage("allgemein"));
    expect(pptx.subarray(0, 2).toString()).toBe("PK");
    if (process.env.VORLAGE_AUSGABE) {
      const fs = await import("node:fs");
      fs.writeFileSync(`${process.env.VORLAGE_AUSGABE}/muster.pdf`, pdf);
      fs.writeFileSync(`${process.env.VORLAGE_AUSGABE}/muster.pptx`, pptx);
    }
  }, 30_000);
});
