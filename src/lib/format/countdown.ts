/**
 * Countdown bis zu einem Stichtag im Stil einer Auktion („3 T 04 Std“).
 * Ein Fälligkeitsdatum gilt ab 0:00 Uhr Ortszeit des Tages. Stunden erscheinen
 * nur in der letzten Woche, darüber reichen ganze Tage.
 */
export interface Countdown {
  /** Anzeige, z. B. „3 T 04 Std“, „5 Std 12 Min“, „heute“, „seit 2 T“ */
  text: string;
  /** volle Tage bis zum Stichtag (negativ = überfällig) */
  tage: number;
  ueberfaellig: boolean;
  /** weniger als 7 Tage oder überfällig */
  dringend: boolean;
}

const MIN = 60_000;
const STD = 60 * MIN;
const TAG = 24 * STD;

function zweistellig(n: number): string {
  return String(n).padStart(2, "0");
}

/** Beginn des Tages `iso` (YYYY-MM-DD) in Ortszeit. */
export function tagesbeginn(iso: string): Date {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Date(j, m - 1, t);
}

export function countdown(zielIso: string, jetzt: Date): Countdown {
  const diff = tagesbeginn(zielIso).getTime() - jetzt.getTime();
  if (diff <= 0) {
    const her = -diff;
    // am Fälligkeitstag selbst: „heute“
    if (her < TAG)
      return { text: "heute", tage: 0, ueberfaellig: false, dringend: true };
    const tage = Math.floor(her / TAG);
    return {
      text: `seit ${tage} T`,
      tage: -tage,
      ueberfaellig: true,
      dringend: true,
    };
  }
  const tage = Math.floor(diff / TAG);
  const std = Math.floor((diff % TAG) / STD);
  const min = Math.floor((diff % STD) / MIN);
  const text =
    tage >= 7
      ? `${tage} T`
      : tage >= 1
        ? `${tage} T ${zweistellig(std)} Std`
        : `${std} Std ${zweistellig(min)} Min`;
  return { text, tage, ueberfaellig: false, dringend: tage < 7 };
}

/** Countdown ohne Uhrzeit (serverseitig und für Tests): nur ganze Tage ab Stichtag. */
export function countdownTage(zielIso: string, stichtagIso: string): Countdown {
  const tage = Math.round(
    (tagesbeginn(zielIso).getTime() - tagesbeginn(stichtagIso).getTime()) / TAG,
  );
  if (tage === 0)
    return { text: "heute", tage, ueberfaellig: false, dringend: true };
  if (tage < 0)
    return {
      text: `seit ${-tage} T`,
      tage,
      ueberfaellig: true,
      dringend: true,
    };
  return { text: `${tage} T`, tage, ueberfaellig: false, dringend: tage < 7 };
}
