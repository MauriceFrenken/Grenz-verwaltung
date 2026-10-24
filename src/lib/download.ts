/** Base64-Datei aus einer Server-Funktion im Browser herunterladen. */
export function base64Herunterladen(datei: { base64: string; dateiname: string; mime: string }): void {
  const bytes = Uint8Array.from(atob(datei.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: datei.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = datei.dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Datei aus einem <input type="file"> als Base64 (ohne Data-URI-Präfix). */
export function dateiAlsBase64(datei: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(datei);
  });
}
