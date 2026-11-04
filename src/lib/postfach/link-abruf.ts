/**
 * Exposés hinter Links: Viele Makler schicken kein PDF, sondern einen Button
 * „Zum Exposé“ (Propstack, onOffice, Datenraum, Dropbox …). Hier werden die
 * Links aus der Mail gelesen und — nur wenn das ohne Zutun geht — das PDF
 * geladen. Login, Captcha und Bestätigungen (Widerrufsbelehrung, Provision,
 * NDA) werden bewusst nicht bedient: Das sind rechtliche Erklärungen, die ein
 * Mensch abgeben muss. Server-only.
 */

import { LINK_MANUELL_PRAEFIX } from "./typen";

export { istLinkManuell, LINK_MANUELL_PRAEFIX } from "./typen";

export const MAX_LINK_PDF_BYTES = 40 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_WEITERLEITUNGEN = 8;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

export type ExposeLink = { url: string; text: string; punkte: number };

export type LinkAbrufErgebnis =
  | {
      art: "pdf";
      url: string;
      dateiname: string;
      bytes: Uint8Array;
    }
  | { art: "manuell"; url: string; grund: string };

function htmlEntitaeten(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function textAusHtml(s: string): string {
  return htmlEntitaeten(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Outlook-SafeLinks und ähnliche Umleitungen auf die Ziel-URL zurückführen. */
export function entpackeUmleitung(url: string): string {
  try {
    const u = new URL(url);
    if (/safelinks\.protection\.outlook\.com$/i.test(u.hostname)) {
      const ziel = u.searchParams.get("url");
      if (ziel) return ziel;
    }
  } catch {
    // ungültige URL — unten verworfen
  }
  return url;
}

const AUSSCHLUSS_HOSTS =
  /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|xing\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl|apple\.com|microsoft\.com|office\.com|outlook\.office365\.com|aka\.ms)$/i;

// Mail-Links: „widerrufsbelehrung“ bleibt erlaubt — dahinter steckt oft der
// Exposé-Button (Hammers & Heinz); die Seite wird dann als Bestätigung erkannt.
const AUSSCHLUSS_PFAD =
  /(impressum|datenschutz|privacy|dsgvo|unsubscribe|abmelden|abbestellen|newsletter|kontakt|contact|karriere|jobs|vcard|\.(png|jpe?g|gif|svg|webp|ico)(\?|$))/i;
// Auf Download-Seiten: Rechtstexte nie als Exposé laden.
const AUSSCHLUSS_SEITE =
  /(impressum|datenschutz|privacy|dsgvo|agb|widerruf|unsubscribe|\.(png|jpe?g|gif|svg|webp|ico)(\?|$))/i;

const EXPOSE_WORT =
  /(expos[eéè]|exposee|download|herunterladen|unterlagen|datenraum|data ?room|dokument|teaser|objektdaten|angebot ansehen|zum angebot|objekt ansehen|details|\.pdf\b)/i;

const PORTAL_HOST =
  /(propstack\.de|onoffice\.(de|com)|flowfact|salesforce-sites\.com|force\.com|dropbox\.com|wetransfer\.com|we\.tl|drive\.google\.com|docs\.google\.com|sharepoint\.com|1drv\.ms|onedrive\.live\.com|box\.com|immoware24|estatepro|justimmo|ftp|datenraum|dataroom|drooms|brainloop|idgard|intralinks)/i;

function punkteFuer(url: URL, text: string): number {
  let p = 0;
  if (EXPOSE_WORT.test(text)) p += 3;
  if (EXPOSE_WORT.test(url.pathname + url.search)) p += 2;
  if (PORTAL_HOST.test(url.hostname)) p += 2;
  if (/\.pdf$/i.test(url.pathname)) p += 3;
  return p;
}

function linkZulassen(roh: string, text: string): ExposeLink | null {
  const url = entpackeUmleitung(htmlEntitaeten(roh.trim()));
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (AUSSCHLUSS_HOSTS.test(u.hostname)) return null;
  if (AUSSCHLUSS_PFAD.test(u.pathname + u.search)) return null;
  if (/^(\/|)$/.test(u.pathname) && !u.search) return null; // reine Startseite
  const punkte = punkteFuer(u, text);
  if (punkte <= 0) return null;
  return { url: u.toString(), text, punkte };
}

/**
 * Kandidaten für Exposé-Links aus dem Mail-Body, beste zuerst.
 * HTML: <a href>; Text-Mails: nackte URLs.
 */
export function exposeLinksAusMail(html: string, text = ""): ExposeLink[] {
  const treffer: ExposeLink[] = [];
  if (html) {
    const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(re)) {
      const link = linkZulassen(m[2], textAusHtml(m[3]));
      if (link) treffer.push(link);
    }
  }
  const quelle = html ? "" : text;
  for (const m of quelle.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const link = linkZulassen(m[0].replace(/[.,;:]+$/, ""), "");
    if (link) treffer.push(link);
  }

  const gesehen = new Map<string, ExposeLink>();
  for (const t of treffer) {
    const alt = gesehen.get(t.url);
    if (!alt || alt.punkte < t.punkte) gesehen.set(t.url, t);
  }
  return [...gesehen.values()].sort((a, b) => b.punkte - a.punkte).slice(0, 5);
}

/** Bekannte Freigabe-Links direkt auf den Download umbiegen. */
export function direktDownloadUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)dropbox\.com$/i.test(u.hostname)) {
      u.searchParams.set("dl", "1");
      return u.toString();
    }
    if (/^drive\.google\.com$/i.test(u.hostname)) {
      const id =
        u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get("id");
      if (id) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
      }
    }
    if (/sharepoint\.com$|onedrive\.live\.com$/i.test(u.hostname)) {
      u.searchParams.set("download", "1");
      return u.toString();
    }
  } catch {
    // unverändert
  }
  return url;
}

function istPrivaterHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  if (h.endsWith(".internal")) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (h.includes(":")) {
    return (
      h === "::1" ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80")
    );
  }
  return false;
}

function pruefeUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Nur http(s)-Links werden abgerufen.");
  }
  if (istPrivaterHost(u.hostname)) {
    throw new Error("Interne Adressen werden nicht abgerufen.");
  }
  return u;
}

async function leseBegrenzt(res: Response, max: number): Promise<Uint8Array> {
  const laenge = Number(res.headers.get("content-length") ?? "0");
  if (laenge > max) {
    await res.body?.cancel().catch(() => undefined);
    throw new GroesseFehler();
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const teile: Uint8Array[] = [];
  let summe = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    summe += value.byteLength;
    if (summe > max) {
      await reader.cancel().catch(() => undefined);
      throw new GroesseFehler();
    }
    teile.push(value);
  }
  const out = new Uint8Array(summe);
  let pos = 0;
  for (const t of teile) {
    out.set(t, pos);
    pos += t.byteLength;
  }
  return out;
}

class GroesseFehler extends Error {
  constructor() {
    super("Datei ist größer als 40 MB.");
  }
}

/** GET mit manuell verfolgten Weiterleitungen (jedes Ziel wird geprüft). */
async function holeMitWeiterleitung(
  start: string,
): Promise<{ res: Response; url: string }> {
  let url = start;
  for (let i = 0; i <= MAX_WEITERLEITUNGEN; i++) {
    pruefeUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9",
      },
    });
    const ziel = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && ziel) {
      await res.body?.cancel().catch(() => undefined);
      url = new URL(ziel, url).toString();
      continue;
    }
    return { res, url };
  }
  throw new Error("Zu viele Weiterleitungen.");
}

function istPdf(bytes: Uint8Array): boolean {
  // %PDF kann nach ein paar Füllbytes stehen.
  const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return kopf.includes("%PDF-");
}

function dateinameAus(res: Response, url: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const stern = cd.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  const einfach = cd.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  let name = "";
  try {
    name = decodeURIComponent((stern ?? einfach ?? "").trim());
  } catch {
    name = (stern ?? einfach ?? "").trim();
  }
  if (!name) {
    try {
      const u = new URL(url);
      name =
        decodeURIComponent(u.pathname.split("/").pop() ?? "") ||
        u.searchParams.get("filename") ||
        "";
    } catch {
      name = "";
    }
  }
  name = name.replace(/[\\/:*?"<>|]+/g, " ").trim();
  if (!name) name = "Expose.pdf";
  if (!/\.pdf$/i.test(name))
    name = `${name.replace(/\.[a-z0-9]{1,5}$/i, "")}.pdf`;
  return name.normalize("NFC");
}

/**
 * Seite verlangt eine menschliche Handlung? Dann nichts absenden, sondern den
 * Grund zurückgeben.
 */
export function sperreAufSeite(html: string): string | null {
  const klein = html.toLowerCase();
  if (/<input[^>]+type\s*=\s*["']?password/i.test(html)) {
    return "Portal verlangt eine Anmeldung (Login).";
  }
  if (/(g-recaptcha|grecaptcha|hcaptcha|cf-turnstile|captcha)/i.test(klein)) {
    return "Seite verlangt ein Captcha.";
  }
  const hatFormular = /<form\b/i.test(html);
  const hatHaken = /<input[^>]+type\s*=\s*["']?checkbox/i.test(html);
  const text = textAusHtml(
    html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " "),
  ).toLowerCase();
  const erklaerung =
    /(widerruf|provision|maklervertrag|vertraulichkeit|geheimhaltung|\bnda\b|verschwiegenheit|ich bestätige|hiermit bestätige|einverstanden|akzeptiere|zustimm)/i;
  if ((hatFormular || hatHaken) && erklaerung.test(text)) {
    if (/widerruf/.test(text)) {
      return "Makler verlangt die Bestätigung der Widerrufsbelehrung (Maklervertrag).";
    }
    if (/(vertraulich|geheimhaltung|\bnda\b|verschwiegenheit)/.test(text)) {
      return "Makler verlangt eine Vertraulichkeitserklärung (NDA).";
    }
    if (/provision/.test(text)) {
      return "Makler verlangt eine Provisionsbestätigung.";
    }
    return "Seite verlangt eine Bestätigung vor dem Download.";
  }
  if (hatFormular && /<input[^>]+type\s*=\s*["']?email/i.test(html)) {
    return "Seite verlangt Kontaktdaten vor dem Download.";
  }
  return null;
}

/** PDF-Links auf einer Download-Seite (z. B. „Exposé herunterladen“). */
export function pdfLinksAufSeite(html: string, basis: string): string[] {
  const urls: Array<{ url: string; punkte: number }> = [];
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let u: URL;
    try {
      u = new URL(htmlEntitaeten(m[2].trim()), basis);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const text = textAusHtml(m[3]);
    if (AUSSCHLUSS_SEITE.test(u.pathname + u.search + " " + text)) continue;
    let punkte = 0;
    if (/\.pdf$/i.test(u.pathname)) punkte += 3;
    if (/(expos|download|herunterladen|pdf)/i.test(text)) punkte += 3;
    if (/(download|expos|\.pdf|getfile|file)/i.test(u.pathname + u.search))
      punkte += 1;
    if (punkte >= 3) urls.push({ url: u.toString(), punkte });
  }
  // <iframe>/<embed>/<object> mit PDF
  for (const m of html.matchAll(
    /<(?:iframe|embed)\b[^>]*?src\s*=\s*(["'])(.*?)\1|<object\b[^>]*?data\s*=\s*(["'])(.*?)\3/gi,
  )) {
    const roh = m[2] ?? m[4];
    if (!roh) continue;
    try {
      const u = new URL(htmlEntitaeten(roh.trim()), basis);
      if (/(\.pdf|download|expos)/i.test(u.pathname + u.search)) {
        urls.push({ url: u.toString(), punkte: 4 });
      }
    } catch {
      // ignorieren
    }
  }
  const refresh = html.match(
    /<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]+content\s*=\s*["'][^"']*url\s*=\s*([^"'>\s]+)/i,
  )?.[1];
  if (refresh) {
    try {
      urls.push({
        url: new URL(htmlEntitaeten(refresh), basis).toString(),
        punkte: 5,
      });
    } catch {
      // ignorieren
    }
  }
  const eindeutig = new Map<string, number>();
  for (const { url, punkte } of urls) {
    eindeutig.set(url, Math.max(punkte, eindeutig.get(url) ?? 0));
  }
  return [...eindeutig.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 3);
}

async function abrufen(url: string, tiefe: number): Promise<LinkAbrufErgebnis> {
  const manuell = (grund: string): LinkAbrufErgebnis => ({
    art: "manuell",
    url,
    grund,
  });

  if (/(^|\.)(wetransfer\.com|we\.tl)$/i.test(new URL(url).hostname)) {
    return manuell("WeTransfer-Downloads lassen sich nicht automatisch laden.");
  }

  let res: Response;
  let endUrl: string;
  try {
    ({ res, url: endUrl } = await holeMitWeiterleitung(direktDownloadUrl(url)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return manuell(
      /timeout|abort/i.test(msg)
        ? "Seite hat nicht rechtzeitig geantwortet."
        : `Seite nicht erreichbar (${msg}).`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    return manuell(
      "Zugriff verweigert — Portal verlangt vermutlich einen Login.",
    );
  }
  if (res.status === 404 || res.status === 410) {
    await res.body?.cancel().catch(() => undefined);
    return manuell("Link ist abgelaufen oder nicht mehr vorhanden.");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return manuell(`Seite antwortet mit HTTP ${res.status}.`);
  }

  const typ = (res.headers.get("content-type") ?? "").toLowerCase();
  const istHtml = typ.includes("text/html") || typ.includes("xhtml");
  let bytes: Uint8Array;
  try {
    bytes = await leseBegrenzt(
      res,
      istHtml ? MAX_HTML_BYTES : MAX_LINK_PDF_BYTES,
    );
  } catch (err) {
    if (err instanceof GroesseFehler) {
      return manuell(
        istHtml ? "Seite ist zu groß." : "PDF ist größer als 40 MB.",
      );
    }
    return manuell("Download wurde abgebrochen.");
  }

  if (istPdf(bytes)) {
    return {
      art: "pdf",
      url: endUrl,
      dateiname: dateinameAus(res, endUrl),
      bytes,
    };
  }

  if (!istHtml) {
    const art = typ.split(";")[0] || "unbekannt";
    return manuell(`Download ist kein PDF (${art}).`);
  }

  const html = new TextDecoder("utf-8").decode(bytes);
  const sperre = sperreAufSeite(html);
  if (sperre) return manuell(sperre);

  if (tiefe >= 2) {
    return manuell("Auf der Seite wurde kein direkter PDF-Download gefunden.");
  }
  let letzterGrund: string | null = null;
  for (const weiter of pdfLinksAufSeite(html, endUrl)) {
    const r = await abrufen(weiter, tiefe + 1);
    if (r.art === "pdf") return r;
    letzterGrund ??= r.grund;
  }
  return manuell(
    letzterGrund ?? "Auf der Seite wurde kein direkter PDF-Download gefunden.",
  );
}

/**
 * Lädt das Exposé-PDF hinter einem Link. Folgt Weiterleitungen und einfachen
 * Download-Seiten (max. eine Ebene tief); sendet nie Formulare ab.
 */
export async function exposeUeberLinkLaden(
  url: string,
): Promise<LinkAbrufErgebnis> {
  try {
    pruefeUrl(url);
  } catch (err) {
    return {
      art: "manuell",
      url,
      grund: err instanceof Error ? err.message : String(err),
    };
  }
  return abrufen(url, 0);
}

export function linkManuellText(grund: string, url: string | null): string {
  return `${LINK_MANUELL_PRAEFIX}: ${grund}${url ? ` Link: ${url}` : ""}`;
}
