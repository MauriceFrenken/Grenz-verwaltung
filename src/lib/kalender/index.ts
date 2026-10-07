/**
 * Reine Datumsarithmetik auf ISO-Strings (JJJJ-MM-TT), immer in UTC gerechnet.
 * Keine Zeitzonen-Überraschungen, keine Abhängigkeit von "heute": der Stichtag
 * wird von außen übergeben.
 */
export type IsoDatum = string;

const TAG_MS = 86_400_000;

export function parse(iso: IsoDatum): Date {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t));
}

export function iso(d: Date): IsoDatum {
  return d.toISOString().slice(0, 10);
}

export function datum(jahr: number, monat: number, tag: number): IsoDatum {
  return iso(new Date(Date.UTC(jahr, monat - 1, tag)));
}

export function teile(d: IsoDatum): {
  jahr: number;
  monat: number;
  tag: number;
} {
  const [jahr, monat, tag] = d.slice(0, 10).split("-").map(Number);
  return { jahr, monat, tag };
}

export function plusTage(d: IsoDatum, tage: number): IsoDatum {
  return iso(new Date(parse(d).getTime() + tage * TAG_MS));
}

/** Monate addieren; der Tag wird auf das Monatsende gekappt (31.01. + 1 M = 28./29.02.). */
export function plusMonate(d: IsoDatum, monate: number): IsoDatum {
  const { jahr, monat, tag } = teile(d);
  const ziel = new Date(Date.UTC(jahr, monat - 1 + monate, 1));
  const letzter = tageImMonat(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1);
  return datum(
    ziel.getUTCFullYear(),
    ziel.getUTCMonth() + 1,
    Math.min(tag, letzter),
  );
}

export function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

export function monatsende(d: IsoDatum): IsoDatum {
  const { jahr, monat } = teile(d);
  return datum(jahr, monat, tageImMonat(jahr, monat));
}

export function monatsanfang(d: IsoDatum): IsoDatum {
  const { jahr, monat } = teile(d);
  return datum(jahr, monat, 1);
}

export function istMonatsende(d: IsoDatum): boolean {
  return monatsende(d) === d.slice(0, 10);
}

/** Tage von a bis b (b − a), positiv wenn b später liegt. */
export function tageZwischen(a: IsoDatum, b: IsoDatum): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / TAG_MS);
}

export function vergleiche(a: IsoDatum, b: IsoDatum): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(a: IsoDatum, b: IsoDatum): IsoDatum {
  return a <= b ? a : b;
}

export function max(a: IsoDatum, b: IsoDatum): IsoDatum {
  return a >= b ? a : b;
}

/** 0 = Sonntag … 6 = Samstag */
export function wochentag(d: IsoDatum): number {
  return parse(d).getUTCDay();
}

/** Werktag im Sinne von § 573c BGB: Montag bis Samstag (Feiertage werden nicht berücksichtigt). */
export function istWerktag(d: IsoDatum): boolean {
  return wochentag(d) !== 0;
}

export function istBankarbeitstag(d: IsoDatum): boolean {
  const w = wochentag(d);
  return w !== 0 && w !== 6;
}

/** n-ter Werktag (Mo–Sa) eines Monats. */
export function nterWerktag(jahr: number, monat: number, n: number): IsoDatum {
  let d = datum(jahr, monat, 1);
  let gezaehlt = 0;
  for (;;) {
    if (istWerktag(d)) gezaehlt += 1;
    if (gezaehlt === n) return d;
    d = plusTage(d, 1);
  }
}

/** Nächster Bankarbeitstag (Mo–Fr) ab d (inklusive). */
export function naechsterBankarbeitstag(d: IsoDatum): IsoDatum {
  let x = d;
  while (!istBankarbeitstag(x)) x = plusTage(x, 1);
  return x;
}

/** Liste aller Tage von a bis b (inklusive). */
export function tageVonBis(a: IsoDatum, b: IsoDatum): IsoDatum[] {
  const out: IsoDatum[] = [];
  for (let d = a; d <= b; d = plusTage(d, 1)) out.push(d);
  return out;
}

/** Monatsschlüssel JJJJ-MM */
export function monatsSchluessel(d: IsoDatum): string {
  return d.slice(0, 7);
}

export function heuteIso(): IsoDatum {
  const jetzt = new Date();
  return datum(jetzt.getFullYear(), jetzt.getMonth() + 1, jetzt.getDate());
}
