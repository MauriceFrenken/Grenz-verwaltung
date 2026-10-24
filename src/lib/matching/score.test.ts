import { describe, expect, it } from "vitest";

import {
  bewerteProfil,
  rangliste,
  type ObjektMerkmale,
  type ProfilZeile,
} from "./score";

const objekt: ObjektMerkmale = {
  objektart: "Mehrfamilienhaus",
  orte: ["Düsseldorf", "Unterbilk"],
  preis: 2_150_000,
  jahresmiete: 89_832,
  einheiten: 11,
  baujahr: 1953,
  objektklasse: "Core+",
};

const profil = (p: Partial<ProfilZeile>): ProfilZeile => ({
  sf_id: "a08X",
  name: "Profil",
  kontakt_sf_id: "003X",
  account_sf_id: null,
  assetklassen: null,
  nutzungsarten: null,
  regionen: null,
  volumen_min: null,
  volumen_max: null,
  faktor_max: null,
  einheiten_min: null,
  baujahr_ab: null,
  baujahr_bis: null,
  investor_typ: null,
  ...p,
});

describe("bewerteProfil", () => {
  it("volle Übereinstimmung ergibt 100 mit Begründungen", () => {
    const e = bewerteProfil(
      objekt,
      profil({
        nutzungsarten: ["Wohnen", "Wohn-/ Geschäftshaus"],
        regionen: ["Köln", "Düsseldorf", "Rhein-Kreis Neuss"],
        volumen_min: 750_000,
        volumen_max: 3_000_000,
        faktor_max: 25,
        assetklassen: ["Core+ (fertiges Produkt)", "Value Add"],
        einheiten_min: 6,
      }),
    );
    expect(e.score).toBe(100);
    expect(e.ausschluss).toBe(false);
    expect(e.kriterien.find((k) => k.id === "region")?.begruendung).toContain(
      "Düsseldorf",
    );
    expect(e.kriterien.find((k) => k.id === "baujahr")?.punkte).toBeNull();
  });

  it("Volumen knapp außerhalb wird anteilig bewertet, falsche Nutzung schließt aus", () => {
    const e = bewerteProfil(
      objekt,
      profil({ nutzungsarten: ["Büro"], volumen_max: 2_000_000 }),
    );
    const volumen = e.kriterien.find((k) => k.id === "volumen")!;
    expect(volumen.punkte).toBe(70); // 7,5 % über Max bei 25 % Toleranz
    expect(e.ausschluss).toBe(true);
  });

  it("Core und Core+ werden unterschieden", () => {
    const nurCore = bewerteProfil(
      { ...objekt, objektklasse: "Core" },
      profil({ assetklassen: ["Core+ (fertiges Produkt)"] }),
    );
    expect(nurCore.kriterien.find((k) => k.id === "objektklasse")?.punkte).toBe(
      0,
    );
  });

  it("Profile ohne Angaben haben geringe Abdeckung und keinen Ausschluss", () => {
    const e = bewerteProfil(objekt, profil({}));
    expect(e.abdeckung).toBe(0);
    expect(e.ausschluss).toBe(false);
  });
});

describe("rangliste", () => {
  it("sortiert Ausschlüsse nach hinten", () => {
    const r = rangliste(objekt, [
      profil({ sf_id: "a", nutzungsarten: ["Büro"] }),
      profil({
        sf_id: "b",
        nutzungsarten: ["Wohnen"],
        regionen: ["Düsseldorf"],
      }),
    ]);
    expect(r.map((x) => x.profilSfId)).toEqual(["b", "a"]);
  });

  it("zieht bei gleichem Score Investoren mit Reaktionen vor", () => {
    const gleich = { nutzungsarten: ["Wohnen"], regionen: ["Düsseldorf"] };
    const r = rangliste(
      objekt,
      [
        // c hat mehr Angaben (Abdeckung), b hat bei Grenz schon reagiert
        profil({ sf_id: "c", ...gleich, einheiten_min: 5 }),
        profil({ sf_id: "b", ...gleich }),
      ],
      new Map([["b", 4]]),
    );
    expect(r.map((x) => x.profilSfId)).toEqual(["b", "c"]);
  });
});
