/** Browser-Seite der PDF-Umwandlung: PowerPoint in Teilen (Base64) an den Server schicken. */

export async function inTeilenHochladen(
  daten: Uint8Array,
  teilBytes: number,
  senden: (teil: {
    offset: number;
    gesamt: number;
    base64: string;
  }) => Promise<unknown>,
  fortschritt: (prozent: number) => void,
): Promise<void> {
  const gesamt = daten.byteLength;
  for (let offset = 0; offset < gesamt; offset += teilBytes) {
    const teil = daten.subarray(offset, offset + teilBytes);
    let binaer = "";
    for (let i = 0; i < teil.length; i += 0x8000)
      binaer += String.fromCharCode(...teil.subarray(i, i + 0x8000));
    fortschritt(Math.round(((offset + teil.length) / gesamt) * 100));
    await senden({ offset, gesamt, base64: btoa(binaer) });
  }
}

export function linkOeffnen(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
