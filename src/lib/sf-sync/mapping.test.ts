import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";

import { erzeugeJwtAssertion, privaterSchluesselAusEnv } from "./jwt";
import {
  liste,
  mandatFuerBezug,
  mappeAktivitaet,
  mappeAnkaufsprofil,
  mappeDeal,
  mappeKampagne,
  mappeKampagnenMitglied,
  mappeKontakt,
  mappeMandat,
  mappeRealEstate,
} from "./mapping";

const kontext = {
  mandatJeRealEstate: new Map([["a01RE", "a06M1"]]),
  mandatJeDeal: new Map([["006D1", "a06M1"]]),
};

describe("Mandat", () => {
  it("nimmt den Exposépreis, wenn Price__c leer ist, und 0 als nicht gepflegt", () => {
    const z = mappeMandat({
      Id: "a06M1",
      attributes: { type: "Mandate__c" },
      Name: "M-10053",
      Stage__c: "Beauftragung",
      Price__c: null,
      Expose_preis__c: 2175000,
      Commission_in__c: 5,
      Start_date__c: "2026-03-03",
      Type_of_commissioning__c: "Lose Beauftragung",
      Account__c: "001A",
      Contact_Person__c: "003C",
      Real_Estate__c: "a01RE",
      CreatedById: "005J5000001Uue4IAC",
      SystemModstamp: "2026-10-20T08:00:00.000+0000",
    });
    expect(z).toMatchObject({
      sf_id: "a06M1",
      name: "M-10053",
      status: "Beauftragung",
      art: "Lose Beauftragung",
      angebotspreis: 2175000,
      provision_prozent: 5,
      beauftragt_am: "2026-03-03",
      eigentuemer_account_sf_id: "001A",
      eigentuemer_kontakt_sf_id: "003C",
      real_estate_sf_id: "a01RE",
    });
    expect((z.sf_daten as Record<string, unknown>).attributes).toBeUndefined();
    expect(mappeMandat({ Id: "x", Expose_preis__c: 0 }).angebotspreis).toBeNull();
  });
});

describe("Ankaufsprofil", () => {
  it("bereinigt Regionen aus Freitext, Komma/Semikolon-Mischung und Search Locations", () => {
    const z = mappeAnkaufsprofil({
      Id: "a08P",
      Objektvolumen_Min_Mio__c: 500000,
      Objektvolumen_Max_Mio__c: 3000000,
      Multiplikator_bis_fach__c: 22,
      Objektklassen__c: "Core+ (fertiges Produkt);Value Add",
      Nutzungsarten__c: "Wohnen;Wohn-/ Geschäftshaus",
      Search_Kreis_kreisfreie_Stadt__c: "Köln, Düsseldorf; köln\nRhein-Erft-Kreis",
      Search_Stadt_Gemeinde__c: "all;Pulheim",
      AnzahlEinheitenMin__c: 8,
      Search_Locations__r: {
        records: [{ Id: "s1", Location__r: { Name: "Leverkusen" } }, { Id: "s2", Location__r: { Name: "Düsseldorf" } }],
      },
    });
    expect(z.regionen).toEqual(["Köln", "Düsseldorf", "Rhein-Erft-Kreis", "Pulheim", "Leverkusen"]);
    expect(z.assetklassen).toEqual(["Core+ (fertiges Produkt)", "Value Add"]);
    expect(z.nutzungsarten).toEqual(["Wohnen", "Wohn-/ Geschäftshaus"]);
    expect(z).toMatchObject({ volumen_min: 500000, volumen_max: 3000000, faktor_max: 22, einheiten_min: 8 });
  });

  it("verwirft unplausible Volumen und Faktoren (echte Fälle IP-00002, IP-00006)", () => {
    const z = mappeAnkaufsprofil({
      Id: "a08Q",
      Objektvolumen_Min_Mio__c: 50000,
      Objektvolumen_Max_Mio__c: 100000,
      Multiplikator_bis_fach__c: 2,
    });
    expect(z).toMatchObject({ volumen_min: null, volumen_max: null, faktor_max: null });
  });

  it("liste entfernt Duplikate ohne Rücksicht auf Groß-/Kleinschreibung", () => {
    expect(liste(" a ; A,b\n\nb ")).toEqual(["a", "b"]);
    expect(liste(null)).toEqual([]);
  });
});

describe("Real Estate", () => {
  it("baut die Adresse aus Straße und Hausnummer und liest Flächen", () => {
    const z = mappeRealEstate({
      Id: "a01RE",
      Name: "Kalkumer Str. 78",
      Street_Name__c: "Kalkumer Str.",
      Street_Number__c: "78",
      ZIP_Code__c: "40468",
      City__c: "Düsseldorf",
      Construction_Year__c: "1962",
      Wohnfl_che__c: 820,
      Rental_income__c: 98000,
      Anzahl_Wohnungen__c: 12,
    });
    expect(z).toMatchObject({
      strasse: "Kalkumer Str. 78",
      plz: "40468",
      ort: "Düsseldorf",
      baujahr: 1962,
      wohnflaeche_m2: 820,
      jahresnettokaltmiete: 98000,
      einheiten: 12,
    });
  });
});

describe("Kontakte", () => {
  it("mappt Contact, Account und Lead", () => {
    expect(
      mappeKontakt(
        { Id: "003C", Name: "Erika Muster", AccountId: "001A", Account: { Name: "Muster GmbH" }, Email: "E@X.de", MailingCity: "Köln" },
        "Contact",
      ),
    ).toMatchObject({ sf_typ: "Contact", name: "Erika Muster", firma: "Muster GmbH", email: "e@x.de", ort: "Köln" });
    expect(mappeKontakt({ Id: "001A", Name: "Muster GmbH", BillingCity: "Bonn" }, "Account")).toMatchObject({
      sf_typ: "Account",
      firma: "Muster GmbH",
      account_sf_id: "001A",
    });
    expect(mappeKontakt({ Id: "00QL", FirstName: "Max", LastName: "Lead", Company: "L AG" }, "Lead")).toMatchObject({
      name: "Max Lead",
      firma: "L AG",
      account_sf_id: null,
    });
  });
});

describe("Bezug zum Mandat", () => {
  it("findet das Mandat über Real Estate oder Deal", () => {
    expect(mandatFuerBezug("a06X", kontext)).toBe("a06X");
    expect(mandatFuerBezug("a01RE", kontext)).toBe("a06M1");
    expect(mandatFuerBezug("006D1", kontext)).toBe("a06M1");
    expect(mandatFuerBezug("001A", kontext)).toBeNull();
  });

  it("Kampagne, Deal und Aktivität bekommen das Mandat", () => {
    expect(mappeKampagne({ Id: "701K", Name: "Vermarktung X", Real_Estate__c: "a01RE", NumberOfContacts: 30, NumberOfLeads: 2 }, kontext))
      .toMatchObject({ mandat_sf_id: "a06M1", anzahl_mitglieder: 32 });
    expect(mappeDeal({ Id: "006D1", Name: "Deal", Real_Estate__c: "a01RE", Amount: 0, RecordType: { DeveloperName: "Real_Estate_Broker" } }, kontext))
      .toMatchObject({ mandat_sf_id: "a06M1", betrag: null, record_type: "Real_Estate_Broker" });
    expect(mappeAktivitaet({ Id: "00T1", TaskSubtype: "Email", WhatId: "a01RE", ActivityDate: "2026-10-01", Status: "Completed" }, "Task", kontext))
      .toMatchObject({ art: "E-Mail", mandat_sf_id: "a06M1", datum: "2026-10-01T12:00:00Z" });
    expect(mappeAktivitaet({ Id: "00U1", WhatId: "701K", StartDateTime: "2026-10-02T09:00:00.000+0000" }, "Event", kontext))
      .toMatchObject({ art: "Termin", kampagne_sf_id: "701K", mandat_sf_id: null });
    expect(mappeKampagnenMitglied({ Id: "00v1", CampaignId: "701K", LeadId: "00QL", HasResponded: true }))
      .toMatchObject({ kontakt_sf_id: "00QL", geantwortet: true });
  });
});

describe("JWT", () => {
  it("signiert die Assertion mit RS256 und liest PEM mit \\n aus der Env", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const envForm = pem.replace(/\n/g, "\\n");
    const jwt = erzeugeJwtAssertion({
      clientId: "cid",
      username: "integration@grenz-co.de",
      audience: "https://login.salesforce.com",
      privateKeyPem: privaterSchluesselAusEnv(envForm),
      jetztSekunden: 1000,
    });
    const [kopf, inhalt, signatur] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(inhalt, "base64url").toString());
    expect(claims).toEqual({ iss: "cid", sub: "integration@grenz-co.de", aud: "https://login.salesforce.com", exp: 1180 });
    const pruefer = createVerify("RSA-SHA256");
    pruefer.update(`${kopf}.${inhalt}`);
    expect(pruefer.verify(publicKey, Buffer.from(signatur, "base64url"))).toBe(true);
  });
});
