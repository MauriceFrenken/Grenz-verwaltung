import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { Util } from "pdfjs-dist";

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isTextItem(x: unknown): x is TextItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "str" in x &&
    typeof (x as { str: unknown }).str === "string" &&
    "transform" in x &&
    Array.isArray((x as { transform: unknown }).transform)
  );
}

function collapseWs(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(s: string): string {
  return s.replace(/[\s\-().]/g, "");
}

function buildQuoteCandidates(verbatimQuote: string, hint?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (s: string) => {
    const t = s.trim();
    if (t.length < 3 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  add(verbatimQuote);
  if (hint) add(hint);

  const verb = verbatimQuote.trim();
  for (const part of verb.split(/[,;|\n/]+/)) add(part);

  for (const m of verb.matchAll(/\+?[\d][\d\s\-().]{6,}[\d]/g)) add(m[0]);
  for (const m of verb.matchAll(/[\w.+-]+@[\w.-]+\.\w{2,}/g)) add(m[0]);

  for (const len of [100, 70, 50, 35, 25]) {
    if (verb.length > len) add(verb.slice(0, len));
  }

  const words = collapseWs(verb).split(" ").filter((w) => w.length >= 2);
  for (let n = Math.min(words.length, 10); n >= 2; n--) {
    add(words.slice(0, n).join(" "));
  }

  return out.sort((a, b) => b.length - a.length);
}

function findTextItemRangeForQuoteFlexible(items: TextItem[], quote: string): { from: number; to: number } | null {
  const direct = findTextItemRangeForQuote(items, quote);
  if (direct) return direct;

  const collapsedNeedle = collapseWs(quote);
  const phoneNeedle = normalizePhone(quote);
  if (phoneNeedle.length >= 8) {
    let tight = "";
    let from = -1;
    for (let i = 0; i < items.length; i++) {
      tight += normalizePhone(items[i].str);
      if (from < 0 && tight.length >= phoneNeedle.length) from = i;
      if (tight.includes(phoneNeedle)) {
        return { from: Math.max(0, from), to: i };
      }
      if (tight.length > phoneNeedle.length * 3) {
        tight = normalizePhone(items.slice(Math.max(0, i - 30), i + 1).map((it) => it.str).join(""));
        from = -1;
      }
    }
  }

  if (collapsedNeedle.length >= 8) {
    const words = collapsedNeedle.split(" ").filter((w) => w.length >= 3);
    for (let n = Math.min(words.length, 8); n >= 2; n--) {
      const sub = words.slice(0, n).join(" ");
      const span = findTextItemRangeForQuote(items, sub);
      if (span) return span;
    }
  }

  return null;
}

export function findTextItemRangeForQuote(items: TextItem[], quote: string): { from: number; to: number } | null {
  const raw = quote.trim().normalize("NFKC");
  if (raw.length < 1) return null;
  const needles = Array.from(new Set([raw, collapseWs(raw)])).filter((n) => n.length >= 1);

  const maxSpan = Math.min(items.length, 200);
  const maxJoinLen = 20000;

  let best: { from: number; to: number } | null = null;
  let bestSpan = Infinity;

  for (const needle of needles) {
    const nCollapsed = collapseWs(needle);
    for (let i = 0; i < items.length; i++) {
      let joinedTight = "";
      let joinedSpace = "";
      for (let j = i; j < Math.min(items.length, i + maxSpan); j++) {
        const piece = items[j].str.normalize("NFKC");
        joinedTight += piece;
        joinedSpace = joinedSpace ? `${joinedSpace} ${piece}` : piece;
        if (joinedTight.length > maxJoinLen) break;
        const hit =
          joinedTight.includes(needle) ||
          joinedSpace.includes(needle) ||
          collapseWs(joinedTight).includes(nCollapsed) ||
          collapseWs(joinedSpace).includes(nCollapsed) ||
          joinedTight.toLowerCase().includes(needle.toLowerCase()) ||
          joinedSpace.toLowerCase().includes(needle.toLowerCase());
        if (hit) {
          const span = j - i + 1;
          if (span < bestSpan) {
            bestSpan = span;
            best = { from: i, to: j };
          }
          break;
        }
      }
    }
  }

  return best;
}

export type HighlightRect = { x: number; y: number; w: number; h: number };

function itemToViewportRect(item: TextItem, viewport: PageViewport): HighlightRect {
  const m = item.transform;
  const x = m[4];
  const y = m[5];
  const w = item.width;
  const h =
    item.height > 0
      ? item.height
      : Math.max(Math.hypot(m[2], m[3]) * 0.85, 1e-6);

  const pdfRect = [x, y - h, x + w, y];
  const r = viewport.convertToViewportRectangle(pdfRect);
  const x1 = Math.min(r[0], r[2]);
  const y1 = Math.min(r[1], r[3]);
  const x2 = Math.max(r[0], r[2]);
  const y2 = Math.max(r[1], r[3]);
  const out = { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  if (![out.x, out.y, out.w, out.h].every(Number.isFinite)) {
    return fallbackTextLayerRect(item, viewport);
  }
  return out;
}

function fallbackTextLayerRect(item: TextItem, viewport: PageViewport): HighlightRect {
  const { pageX, pageY, pageHeight } = viewport.rawDims;
  const textRoot: [number, number, number, number, number, number] = [1, 0, 0, -1, -pageX, pageY + pageHeight];
  const tx = Util.transform(textRoot, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const fontAscent = fontHeight * 0.8;
  const left = tx[4];
  const top = tx[5] - fontAscent;
  const wPdf = item.width * (fontHeight / (item.height || fontHeight || 1));
  const hPdf = fontHeight;
  const r = viewport.convertToViewportRectangle([left, top, left + wPdf, top + hPdf]);
  const x1 = Math.min(r[0], r[2]);
  const y1 = Math.min(r[1], r[3]);
  const x2 = Math.max(r[0], r[2]);
  const y2 = Math.max(r[1], r[3]);
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

function mergeRectsVertical(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: HighlightRect[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const sameBand = Math.abs(r.y - cur.y) < cur.h * 0.6 && Math.abs(r.y + r.h - (cur.y + cur.h)) < cur.h * 0.6;
    const overlapX = !(r.x > cur.x + cur.w + 2 || cur.x > r.x + r.w + 2);
    if (sameBand && overlapX) {
      const nx = Math.min(cur.x, r.x);
      const ny = Math.min(cur.y, r.y);
      const nx2 = Math.max(cur.x + cur.w, r.x + r.w);
      const ny2 = Math.max(cur.y + cur.h, r.y + r.h);
      cur = { x: nx, y: ny, w: nx2 - nx, h: ny2 - ny };
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out;
}

function buildRectsFromSpan(
  items: TextItem[],
  viewport: PageViewport,
  span: { from: number; to: number },
): HighlightRect[] {
  const rects: HighlightRect[] = [];
  for (let k = span.from; k <= span.to; k++) {
    rects.push(itemToViewportRect(items[k], viewport));
  }
  return mergeRectsVertical(rects);
}

function hasRenderableHighlight(rects: HighlightRect[]): boolean {
  return rects.some(
    (r) =>
      Number.isFinite(r.x) &&
      Number.isFinite(r.y) &&
      Number.isFinite(r.w) &&
      Number.isFinite(r.h) &&
      r.w >= 0.5 &&
      r.h >= 0.5,
  );
}

export type HighlightMatchInput = {
  verbatimQuote: string;
  /** Kurzer Suchhinweis aus dem extrahierten Feldwert (z. B. Firmenname) */
  hint?: string;
};

function tryHighlightFromQuote(
  items: TextItem[],
  viewport: PageViewport,
  quote: string,
): HighlightRect[] | null {
  const span = findTextItemRangeForQuoteFlexible(items, quote);
  if (!span) return null;
  const rects = buildRectsFromSpan(items, viewport, span);
  return hasRenderableHighlight(rects) ? rects : null;
}

export async function computeQuoteHighlightRects(
  pdfPage: PDFPageProxy,
  viewport: PageViewport,
  input: string | HighlightMatchInput,
): Promise<HighlightRect[]> {
  const verbatimQuote = typeof input === "string" ? input : input.verbatimQuote;
  const hint = typeof input === "string" ? undefined : input.hint?.trim();

  const tc = await pdfPage.getTextContent();
  const items = tc.items.filter(isTextItem);
  if (items.length === 0) return [];

  const verb = verbatimQuote.trim();
  if (!verb) return [];

  for (const candidate of buildQuoteCandidates(verb, hint)) {
    const rects = tryHighlightFromQuote(items, viewport, candidate);
    if (rects) return rects;
  }

  return [];
}
