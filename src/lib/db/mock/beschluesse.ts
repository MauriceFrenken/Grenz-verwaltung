/** Fiktive Beschlüsse der letzten Wochenrunden (nur Demo und Tests). */
import { plusTage } from "@/lib/kalender";
import type { Beschluss, BoardDaten } from "../typen";

export function musterBeschluesse(daten: BoardDaten): Beschluss[] {
  const t = daten.stichtag;
  const runde = plusTage(t, -7);
  const vorletzte = plusTage(t, -14);
  const darlehen = daten.loans.find((l) => l.kind === "bank");
  const maschine = daten.machines.find((m) => m.status === "inseriert");
  const objekt = daten.properties[0];
  return [
    {
      id: "BE-2026-001",
      rundeAm: vorletzte,
      text: "Mindestliquidität je Gesellschaft festlegen und im Board eintragen",
      verantwortlich: "Max Mustermann",
      faelligAm: plusTage(vorletzte, 7),
      bezugTyp: null,
      bezugId: null,
      companyId: null,
      status: "erledigt",
      erledigtAm: plusTage(vorletzte, 5),
    },
    {
      id: "BE-2026-002",
      rundeAm: runde,
      text: "Zwei Banken um ein Angebot zur Anschlussfinanzierung bitten",
      verantwortlich: "Max Mustermann",
      faelligAm: plusTage(t, 10),
      bezugTyp: darlehen ? "darlehen" : null,
      bezugId: darlehen?.id ?? null,
      companyId: darlehen?.borrowerCompanyId ?? null,
      status: "offen",
      erledigtAm: null,
    },
    {
      id: "BE-2026-003",
      rundeAm: runde,
      text: "Maschinen über 90 Tage Standzeit in die nächste Auktion geben",
      verantwortlich: "Moritz Mustermann",
      faelligAm: plusTage(t, -1),
      bezugTyp: maschine ? "maschine" : null,
      bezugId: maschine?.id ?? null,
      companyId: maschine?.companyId ?? null,
      status: "offen",
      erledigtAm: null,
    },
    {
      id: "BE-2026-004",
      rundeAm: runde,
      text: "Mieterhöhung nach § 558 BGB für das Objekt vorbereiten",
      verantwortlich: "Erika Musterfrau",
      faelligAm: plusTage(t, 21),
      bezugTyp: objekt ? "objekt" : null,
      bezugId: objekt?.id ?? null,
      companyId: objekt?.companyId ?? null,
      status: "offen",
      erledigtAm: null,
    },
  ];
}
