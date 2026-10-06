import { toast } from "sonner";

type EbicsSyncToastInput = {
  ergebnisse: Array<{ status: string }>;
  anzahlNeuGesamt: number;
  bankLeer: boolean;
};

/** Toast nach EBICS-Abruf — „Bank lieferte nichts“ nur wenn Abruf ok und Lauf ohne Auszüge. */
export function meldeEbicsSync(
  res: EbicsSyncToastInput,
  opts: { zeitraumLabel: string; prefix?: string },
): void {
  const prefix = opts.prefix ? `${opts.prefix} · ` : "";
  const fehler = res.ergebnisse.filter((e) => e.status === "fehler");

  if (fehler.length > 0) {
    toast.error(
      `${prefix}${res.anzahlNeuGesamt} neu · ${fehler.length} Fehler`,
    );
    return;
  }

  if (res.bankLeer) {
    toast.message(
      `${prefix}Keine Bankauszüge für ${opts.zeitraumLabel} — Bank lieferte nichts`,
    );
    return;
  }

  if (res.anzahlNeuGesamt > 0) {
    toast.success(`${prefix}${res.anzahlNeuGesamt} neue Buchungen`);
    return;
  }

  toast.message(`${prefix}Keine neuen Buchungen`);
}
