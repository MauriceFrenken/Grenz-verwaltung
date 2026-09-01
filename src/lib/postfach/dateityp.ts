/** Dateityp-Erkennung für Postfach-Anhänge (Name + MIME). */

function nameUndMime(name: string, contentType: string | null) {
  return {
    ct: (contentType ?? "").toLowerCase(),
    n: name.toLowerCase(),
  };
}

export function istPdfDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return ct.includes("pdf") || n.endsWith(".pdf");
}

export function istBildDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return (
    ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|tiff?|bmp)$/i.test(n)
  );
}

export function istOfficeDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return (
    ct.includes("wordprocessingml") ||
    ct.includes("msword") ||
    ct.includes("spreadsheetml") ||
    ct.includes("ms-excel") ||
    ct.includes("presentationml") ||
    ct.includes("ms-powerpoint") ||
    /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(n)
  );
}

export function istTextDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return (
    ct.startsWith("text/") ||
    ct.includes("csv") ||
    /\.(txt|csv|tsv|rtf)$/i.test(n)
  );
}

export function istDocxDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return ct.includes("wordprocessingml") || n.endsWith(".docx");
}

export function istDocDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return (ct.includes("msword") && !ct.includes("openxml")) || n.endsWith(".doc");
}

export function istExcelDatei(name: string, contentType: string | null): boolean {
  const { ct, n } = nameUndMime(name, contentType);
  return (
    ct.includes("spreadsheetml") ||
    ct.includes("ms-excel") ||
    /\.(xlsx?|ods)$/i.test(n)
  );
}

export function bildMediaType(name: string, contentType: string | null): string {
  const ct = (contentType ?? "").trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
  if (n.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}
