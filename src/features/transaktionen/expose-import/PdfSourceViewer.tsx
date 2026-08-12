import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";

import type { PdfPageChunk } from "./extractPdfText";
import { computeQuoteHighlightRects, type HighlightRect } from "./pdfQuoteHighlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scrollMinIntoContainerView } from "@/lib/scrollMinIntoContainerView";
import { cn } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Props = {
  objectUrl: string | null;
  page: number;
  onPageChange: (page: number) => void;
  pages: PdfPageChunk[] | null;
  pageLabels: string[] | null;
  highlight: { page: number; quote: string; hint?: string } | null;
  title?: string;
  className?: string;
  onPdfDrop?: (file: File) => void;
  dropDisabled?: boolean;
};

type TextMatch = { pageNumber: number; charIndex: number };

function hatDateien(dt: DataTransfer): boolean {
  return dt.types.includes("Files") || dt.files.length > 0;
}

function dateiAusDataTransfer(dt: DataTransfer): File | null {
  const files = Array.from(dt.files);
  if (files.length === 0) return null;
  return (
    files.find(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    ) ?? files[0] ?? null
  );
}

function collectTextMatches(pages: PdfPageChunk[], query: string): TextMatch[] {
  const needle = query.trim();
  if (!needle) return [];
  const lowerNeedle = needle.toLowerCase();
  const out: TextMatch[] = [];
  for (const { pageNumber, text } of pages) {
    const t = text.toLowerCase();
    let from = 0;
    for (;;) {
      const i = t.indexOf(lowerNeedle, from);
      if (i < 0) break;
      out.push({ pageNumber, charIndex: i });
      from = i + lowerNeedle.length;
    }
  }
  return out;
}

export function PdfSourceViewer({
  objectUrl,
  page,
  onPageChange,
  pages,
  pageLabels,
  highlight,
  title,
  className,
  onPdfDrop,
  dropDisabled = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const dragCountRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropAktiv = Boolean(onPdfDrop) && !dropDisabled;

  const [loadedPdf, setLoadedPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<TextMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [findSummary, setFindSummary] = useState("");
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);
  const [canvasBox, setCanvasBox] = useState<{ w: number; h: number } | null>(null);

  const displayPage = numPages > 0 ? Math.min(numPages, Math.max(1, page)) : Math.max(1, page);

  const printedLabel =
    pageLabels &&
    displayPage >= 1 &&
    displayPage <= pageLabels.length &&
    typeof pageLabels[displayPage - 1] === "string"
      ? pageLabels[displayPage - 1]!.trim()
      : "";
  const showPrintedLabel =
    printedLabel.length > 0 &&
    printedLabel !== String(displayPage) &&
    printedLabel.toLowerCase() !== `page ${displayPage}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!objectUrl) {
      setLoadedPdf((prev) => {
        prev?.destroy();
        return null;
      });
      setNumPages(0);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);
    const task = pdfjsLib.getDocument({ url: objectUrl });

    task.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setLoadedPdf((prev) => {
          prev?.destroy();
          return doc;
        });
        setNumPages(doc.numPages);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "PDF konnte nicht geöffnet werden");
        setNumPages(0);
        setLoadedPdf(null);
      });

    return () => {
      cancelled = true;
      void task.destroy();
      setLoadedPdf((prev) => {
        prev?.destroy();
        return null;
      });
      setNumPages(0);
    };
  }, [objectUrl]);

  useEffect(() => {
    const pdf = loadedPdf;
    const canvas = canvasRef.current;
    const w = containerWidth;
    if (!pdf || !canvas || !w || numPages < 1) return;

    renderTaskRef.current?.cancel?.();
    let cancelled = false;
    const pageNum = displayPage;

    setRendering(true);
    setCanvasBox(null);
    setHighlightRects([]);
    pdf
      .getPage(pageNum)
      .then((pdfPage) => {
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.max(0.25, (w - 16) / base.width);
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = renderTask;
        return renderTask.promise.then(async () => {
          if (cancelled) return;
          try {
            if (canvas.width > 0 && canvas.height > 0) {
              setCanvasBox({ w: canvas.width, h: canvas.height });
            }
            const hl = highlightRef.current;
            const hlPage = Number(hl?.page);
            const q = typeof hl?.quote === "string" ? hl.quote.trim() : String(hl?.quote ?? "").trim();
            if (hl && hlPage === pageNum && q.length > 0) {
              const rects = await computeQuoteHighlightRects(pdfPage, viewport, {
                verbatimQuote: q,
                hint: typeof hl.hint === "string" && hl.hint.trim() ? hl.hint.trim() : undefined,
              });
              if (!cancelled) setHighlightRects(rects);
            } else if (!cancelled) {
              setHighlightRects([]);
            }
          } catch {
            if (!cancelled) setHighlightRects([]);
          }
        });
      })
      .catch(() => {
        /* cancelled or render error */
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      renderTaskRef.current = null;
      setCanvasBox(null);
      setHighlightRects([]);
    };
  }, [loadedPdf, numPages, displayPage, containerWidth, highlight]);

  useEffect(() => {
    if (highlightRects.length === 0 || !canvasBox) return;
    const id = requestAnimationFrame(() => {
      const child = highlightWrapRef.current;
      const scrollParent = containerRef.current;
      if (child && scrollParent) scrollMinIntoContainerView(child, scrollParent, 16);
    });
    return () => cancelAnimationFrame(id);
  }, [highlightRects, displayPage, canvasBox]);

  const runSearch = useCallback(() => {
    if (!pages?.length) {
      setMatches([]);
      setFindSummary("Kein Text zum Durchsuchen");
      return;
    }
    const found = collectTextMatches(pages, searchQuery);
    setMatches(found);
    setMatchIndex(0);
    const q = searchQuery.trim();
    setFindSummary(q ? `${found.length} Treffer` : "");
    if (found.length > 0) {
      onPageChange(found[0].pageNumber);
    }
  }, [pages, searchQuery, onPageChange]);

  const goPrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    const next = (matchIndex - 1 + matches.length) % matches.length;
    setMatchIndex(next);
    onPageChange(matches[next].pageNumber);
  }, [matches, matchIndex, onPageChange]);

  const goNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    const next = (matchIndex + 1) % matches.length;
    setMatchIndex(next);
    onPageChange(matches[next].pageNumber);
  }, [matches, matchIndex, onPageChange]);

  useEffect(() => {
    if (searchOpen) {
      queueMicrotask(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  useEffect(() => {
    setFindSummary("");
  }, [searchQuery]);

  const prevPage = () => onPageChange(displayPage - 1);
  const nextPage = () => onPageChange(displayPage + 1);

  const resetDrag = useCallback(() => {
    dragCountRef.current = 0;
    setIsDragOver(false);
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onPdfDrop || !hatDateien(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current += 1;
      if (!dropDisabled) setIsDragOver(true);
    },
    [onPdfDrop, dropDisabled],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onPdfDrop || !hatDateien(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = dropDisabled ? "none" : "copy";
    },
    [onPdfDrop, dropDisabled],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onPdfDrop) return;
      e.preventDefault();
      e.stopPropagation();
      resetDrag();
      if (dropDisabled) return;
      const file = dateiAusDataTransfer(e.dataTransfer);
      if (file) onPdfDrop(file);
    },
    [onPdfDrop, dropDisabled, resetDrag],
  );

  const dateiWaehlen = useCallback(() => {
    if (!onPdfDrop || dropDisabled) return;
    fileInputRef.current?.click();
  }, [onPdfDrop, dropDisabled]);

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-hairline bg-surface",
        isDragOver && dropAktiv && "border-heading",
        className,
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {onPdfDrop ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPdfDrop(file);
          }}
        />
      ) : null}
      <div className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-surface-muted/40 px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading" title={title}>
            {title ?? "PDF-Vorschau"}
          </span>
          {objectUrl && (
            <>
              <Button
                type="button"
                variant={searchOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-expanded={searchOpen}
                aria-label="Im Dokument suchen"
                title="Im Dokument suchen"
                onClick={() => setSearchOpen((o) => !o)}
              >
                <Search className="h-4 w-4" />
              </Button>
              <div className="flex shrink-0 items-center gap-0.5 border border-hairline bg-surface p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Vorherige Seite"
                  disabled={displayPage <= 1}
                  onClick={prevPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span
                  className="flex min-w-[5.5rem] max-w-[7.5rem] flex-col items-center px-0.5 text-center text-xs tabular-nums text-text-muted sm:max-w-[9rem] sm:text-sm"
                  title={
                    showPrintedLabel
                      ? `Seite ${displayPage} von ${numPages} (PDF-Label: ${printedLabel})`
                      : undefined
                  }
                >
                  <span>{numPages > 0 ? `${displayPage} / ${numPages}` : "—"}</span>
                  {showPrintedLabel && (
                    <span className="w-full truncate text-[10px] font-normal normal-case leading-tight text-text-subtle">
                      {printedLabel}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Nächste Seite"
                  disabled={numPages > 0 && displayPage >= numPages}
                  onClick={nextPage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {searchOpen && objectUrl && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-2">
            <div className="flex min-w-[12rem] flex-1 items-center gap-1">
              <Input
                ref={searchInputRef}
                placeholder="Im Dokument suchen…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      if (matches.length > 0) goPrevMatch();
                    } else if (matches.length > 0) {
                      goNextMatch();
                    } else {
                      runSearch();
                    }
                  }
                }}
              />
              <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0" onClick={runSearch}>
                Suchen
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <span className="max-w-[10rem] truncate text-xs text-text-muted sm:max-w-none">
                {findSummary}
                {matches.length > 0 ? ` · ${matchIndex + 1} von ${matches.length}` : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Vorheriger Treffer"
                disabled={matches.length === 0}
                onClick={goPrevMatch}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Nächster Treffer"
                disabled={matches.length === 0}
                onClick={goNextMatch}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Suche schließen"
                onClick={() => setSearchOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="relative isolate min-h-0 flex-1 overflow-auto bg-surface-muted/30 outline-none"
        onKeyDown={(e) => {
          if (!objectUrl) return;
          if ((e.metaKey || e.ctrlKey) && e.key === "f") {
            e.preventDefault();
            setSearchOpen(true);
          }
        }}
      >
        {!objectUrl && (
          <div
            className={cn(
              "flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-4 text-center",
              dropAktiv && "cursor-pointer",
            )}
            role={dropAktiv ? "button" : undefined}
            tabIndex={dropAktiv ? 0 : undefined}
            aria-label={dropAktiv ? "Exposé-PDF hochladen" : undefined}
            onClick={dropAktiv ? dateiWaehlen : undefined}
            onKeyDown={
              dropAktiv
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      dateiWaehlen();
                    }
                  }
                : undefined
            }
          >
            {onPdfDrop ? (
              <>
                <Upload className="h-8 w-8 text-text-subtle" aria-hidden />
                <p className="text-sm text-text-muted">
                  Exposé-PDF hierher ziehen
                </p>
                <p className="text-xs text-text-subtle">
                  oder klicken zum Auswählen
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted">
                Laden Sie ein Exposé-PDF hoch, um es hier anzuzeigen.
              </p>
            )}
          </div>
        )}
        {objectUrl && loadError && (
          <div className="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-sm text-danger">
            {loadError}
          </div>
        )}
        {objectUrl && !loadError && (
          <div className="relative flex min-h-full flex-col items-center justify-start p-2">
            {rendering && (
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 bg-surface/90 px-2 py-1 text-xs text-text-muted shadow">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Rendern…
              </div>
            )}
            <div
              ref={highlightWrapRef}
              className="relative inline-block w-max max-w-none shadow-sm"
              style={canvasBox ? { width: canvasBox.w, height: canvasBox.h } : undefined}
            >
              <canvas ref={canvasRef} className="block h-auto w-auto" />
              {highlight &&
                Number(highlight.page) === displayPage &&
                highlightRects.length > 0 &&
                canvasBox && (
                  <div
                    className="pointer-events-none absolute left-0 top-0 z-[1]"
                    style={{ width: canvasBox.w, height: canvasBox.h }}
                  >
                    {highlightRects.map((r, i) => (
                      <div
                        key={i}
                        className="absolute rounded-sm bg-yellow-300/45"
                        style={{
                          left: `${r.x}px`,
                          top: `${r.y}px`,
                          width: `${r.w}px`,
                          height: `${r.h}px`,
                        }}
                      />
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {isDragOver && dropAktiv ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-heading bg-heading/10">
          <Upload className="h-8 w-8 text-heading" aria-hidden />
          <p className="text-sm font-medium text-heading">PDF hier ablegen</p>
        </div>
      ) : null}
    </div>
  );
}
