import { describe, expect, it } from "vitest";

import type { ObjektMerkmale, ProfilZeile } from "./score";
import { listeAlsProfil, qualifizierteTreffer } from "./vermarktung";

const objekt: ObjektMerkmale = {
  objektart: "Mehrfamilienhaus",
  orte: ["Düsseldorf"],
  preis: 4_000_000,
  jahresmiete: null,
  einheiten: 20,
  baujahr: null,
  objektklasse: null,
};

const profil = (id: string, teil: Partial<ProfilZeile>): ProfilZeile => ({
  sf_id: id,
  name: id,
  kontakt_sf_id: `003${id}`,
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
  ...teil,
});

describe("qualifizierteTreffer", () => {
  const profile = [
    profil("passt", {
      nutzungsarten: ["Wohnen"],
      regionen: ["Düsseldorf"],
      volumen_min: 2_000_000,
      volumen_max: 10_000_000,
    }),
    profil("nurNutzung", { nutzungsarten: ["Wohnen"] }),
    profil("falscheRegion", {
      nutzungsarten: ["Wohnen"],
      regionen: ["München"],
      volumen_max: 10_000_000,
    }),
    profil("angesprochen", {
      nutzungsarten: ["Wohnen"],
      regionen: ["NRW"],
      volumen_max: 10_000_000,
    }),
  ];

  it("nimmt nur belegte, passende Profile ohne die schon angesprochenen", () => {
    const t = qualifizierteTreffer(objekt, profile, {
      ausschliessen: (p) => p.sf_id === "angesprochen",
    });
    expect(t.map((x) => x.profilSfId)).toEqual(["passt"]);
    expect(t[0].gruende.join(" ")).toContain("Düsseldorf");
  });

  it("bildet Listeneinträge als Profil ab", () => {
    const p = listeAlsProfil({
      schluessel: "7plus:1",
      firma: "ABC Wohnen",
      person: null,
      typ: "Family Office",
      nutzungen: ["Wohnen"],
      objektklassen: [],
      regionen: ["NRW"],
      volumen_min: "1000000",
      volumen_max: null,
      einheiten_min: null,
    });
    expect(p).toMatchObject({
      sf_id: "quelle:7plus:1",
      name: "ABC Wohnen",
      volumen_min: 1_000_000,
      kontakt_sf_id: null,
    });
    expect(qualifizierteTreffer(objekt, [p])).toHaveLength(1);
  });
});
