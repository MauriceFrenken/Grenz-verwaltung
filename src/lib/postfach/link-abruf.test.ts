import { describe, expect, it } from "vitest";

import {
  direktDownloadUrl,
  entpackeUmleitung,
  exposeLinksAusMail,
  pdfLinksAufSeite,
  sperreAufSeite,
} from "./link-abruf";

describe("exposeLinksAusMail", () => {
  it("findet den Exposé-Button und ignoriert Impressum, Social, DSGVO", () => {
    const html = `
      <a href="https://crm.propstack.de/public/pd/abc/def/exposee">Zum Exposé </a>
      <a href="https://crm.propstack.de/public/dsgvo?document=art_13_14&amp;id=x">Hier klicken</a>
      <a href="https://www.linkedin.com/company/x/">LinkedIn</a>
      <a href="https://www.makler.de/impressum/">Impressum</a>
      <a href="https://www.makler.de/">www.makler.de</a>
      <a href="mailto:info@makler.de">info@makler.de</a>`;
    const links = exposeLinksAusMail(html);
    expect(links.map((l) => l.url)).toEqual([
      "https://crm.propstack.de/public/pd/abc/def/exposee",
    ]);
  });

  it("lässt Widerrufs-Seiten mit Exposé-Button zu (Bestätigung wird später erkannt)", () => {
    const html = `<a href="https://hammersheinz.my.salesforce-sites.com/widerrufsbelehrung?cmid=1&amp;t=2">Zum Exposé</a>`;
    expect(exposeLinksAusMail(html)[0]?.url).toBe(
      "https://hammersheinz.my.salesforce-sites.com/widerrufsbelehrung?cmid=1&t=2",
    );
  });

  it("entpackt Outlook-SafeLinks und liest Text-Mails", () => {
    const ziel = "https://www.dropbox.com/s/abc/Expose.pdf?dl=0";
    const text = `Exposé: https://eur01.safelinks.protection.outlook.com/?url=${encodeURIComponent(ziel)}&data=x.`;
    expect(exposeLinksAusMail("", text)[0]?.url).toBe(ziel);
  });
});

describe("sperreAufSeite", () => {
  it("erkennt Widerrufsbestätigung mit Checkbox", () => {
    const html = `<form method="post"><p>Hiermit bestätige ich den Empfang der Widerrufsbelehrung.</p>
      <input type="checkbox" name="ok" /><input type="submit" value="Jetzt bestätigen" /></form>`;
    expect(sperreAufSeite(html)).toMatch(/Widerrufsbelehrung/);
  });

  it("erkennt Login, Captcha und NDA", () => {
    expect(
      sperreAufSeite(`<form><input type="password" name="pw"></form>`),
    ).toMatch(/Login/);
    expect(sperreAufSeite(`<div class="g-recaptcha"></div>`)).toMatch(
      /Captcha/,
    );
    expect(
      sperreAufSeite(
        `<form><input type="checkbox"> Ich akzeptiere die Vertraulichkeitsvereinbarung</form>`,
      ),
    ).toMatch(/NDA/);
  });

  it("lässt einfache Download-Seiten durch", () => {
    expect(
      sperreAufSeite(
        `<h1>Ihr Exposé</h1><a href="/files/expose.pdf">Download</a>`,
      ),
    ).toBeNull();
  });
});

describe("pdfLinksAufSeite", () => {
  it("findet PDF-Downloads, aber keine Rechtstexte", () => {
    const html = `
      <a href="/files/Expose_Musterstr.pdf">Exposé herunterladen</a>
      <a href="/agb.pdf">AGB</a>
      <a href="https://x.de/widerruf.pdf">Widerrufsbelehrung (PDF)</a>`;
    expect(pdfLinksAufSeite(html, "https://portal.de/objekt/1")).toEqual([
      "https://portal.de/files/Expose_Musterstr.pdf",
    ]);
  });
});

describe("direktDownloadUrl", () => {
  it("biegt Dropbox und Google Drive auf den Download um", () => {
    expect(direktDownloadUrl("https://www.dropbox.com/s/abc/x.pdf?dl=0")).toBe(
      "https://www.dropbox.com/s/abc/x.pdf?dl=1",
    );
    expect(
      direktDownloadUrl(
        "https://drive.google.com/file/d/ID123/view?usp=sharing",
      ),
    ).toBe("https://drive.google.com/uc?export=download&id=ID123");
  });

  it("lässt andere Links unverändert", () => {
    expect(entpackeUmleitung("https://a.de/x")).toBe("https://a.de/x");
  });
});
