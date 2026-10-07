/**
 * Mietrechtliche Fristen (reine Funktionen).
 *
 * § 558b BGB Mieterhöhung bis zur ortsüblichen Vergleichsmiete:
 *   Zustimmungsfrist bis zum Ablauf des zweiten Kalendermonats nach Zugang,
 *   erhöhte Miete ab Beginn des dritten Kalendermonats nach Zugang.
 * § 573c BGB Kündigungsfristen Wohnraum:
 *   Zugang spätestens am dritten Werktag eines Monats → Ablauf des übernächsten Monats.
 *   Vermieter: + 3 Monate nach 5 Jahren, + 6 Monate nach 8 Jahren Überlassung.
 * Werktage: Montag bis Samstag; gesetzliche Feiertage werden nicht berücksichtigt (Annahme).
 */
import {
  monatsanfang,
  monatsende,
  nterWerktag,
  plusMonate,
  tageZwischen,
  teile,
  type IsoDatum,
} from "@/lib/kalender";

export interface MieterhoehungFristen {
  zustimmungBis: IsoDatum;
  wirksamAb: IsoDatum;
}

export function mieterhoehungFristen(zugang: IsoDatum): MieterhoehungFristen {
  return {
    zustimmungBis: monatsende(plusMonate(monatsanfang(zugang), 2)),
    wirksamAb: monatsanfang(plusMonate(monatsanfang(zugang), 3)),
  };
}

/** Kündigungsfrist in Monaten nach § 573c Abs. 1 BGB. */
export function kuendigungsfristMonate(
  durch: "mieter" | "vermieter",
  mietbeginn: IsoDatum,
  zugang: IsoDatum,
): number {
  if (durch === "mieter") return 3;
  const jahre = tageZwischen(mietbeginn, zugang) / 365.25;
  if (jahre >= 8) return 9;
  if (jahre >= 5) return 6;
  return 3;
}

/** Letzter Tag des Mietverhältnisses nach ordentlicher Kündigung. */
export function kuendigungFristende(
  durch: "mieter" | "vermieter",
  mietbeginn: IsoDatum,
  zugang: IsoDatum,
): IsoDatum {
  const { jahr, monat } = teile(zugang);
  const rechtzeitig = zugang <= nterWerktag(jahr, monat, 3);
  const monate = kuendigungsfristMonate(durch, mietbeginn, zugang);
  // Rechtzeitig: der Zugangsmonat zählt mit (3 Monate → Ablauf des übernächsten Monats).
  const versatz = rechtzeitig ? monate - 1 : monate;
  return monatsende(plusMonate(monatsanfang(zugang), versatz));
}
