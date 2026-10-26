/**
 * Nächtlicher Abgleich der Objektordner: für jedes offene Mandat den Ordner suchen und,
 * wenn noch keiner da ist, den Steckbrief aus den Unterlagen erstellen. So steht die
 * Mandatsakte morgens fertig im Überblick. Server-only.
 */

import type { createServiceRoleClient } from "@/lib/server/aufrufer";
import { istTest, OFFENE_PHASEN } from "@/lib/uebersicht/berechnen";

import { mandatOrdnerLaden, steckbriefErzeugen } from "./ordner-server-fn";

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Steckbriefe je Lauf, parallel erstellt; der Rest folgt in der nächsten Nacht. */
const MAX_STECKBRIEFE = 4;

export type AbgleichErgebnis = {
  mandate: number;
  mitOrdner: number;
  ohneOrdner: string[];
  steckbriefeNeu: string[];
  fehler: { mandat: string; fehler: string }[];
};

export async function objektordnerAbgleich(
  admin: Admin,
): Promise<AbgleichErgebnis> {
  const { data, error } = await admin
    .from("sf_mandate")
    .select("sf_id, name")
    .in("status", [...OFFENE_PHASEN])
    .order("sf_geaendert_am", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const mandate = (data ?? []).filter((m) => !istTest(String(m.name ?? "")));

  const ergebnis: AbgleichErgebnis = {
    mandate: mandate.length,
    mitOrdner: 0,
    ohneOrdner: [],
    steckbriefeNeu: [],
    fehler: [],
  };
  const offen: { sfId: string; name: string; ordnerId: string }[] = [];
  for (const m of mandate) {
    const name = String(m.name ?? m.sf_id);
    const dto = await mandatOrdnerLaden(admin, String(m.sf_id));
    if (dto.fehler) {
      // Zugang fehlt: alle weiteren Mandate würden genauso scheitern.
      ergebnis.fehler.push({ mandat: name, fehler: dto.fehler });
      if (
        /Zugriff|freigegeben|Anmeldung|eingerichtet|nicht gefunden/i.test(
          dto.fehler,
        )
      )
        break;
      continue;
    }
    if (!dto.ordner) {
      ergebnis.ohneOrdner.push(name);
      continue;
    }
    ergebnis.mitOrdner++;
    if (!dto.steckbrief && dto.speichernMoeglich)
      offen.push({ sfId: String(m.sf_id), name, ordnerId: dto.ordner.id });
  }

  await Promise.all(
    offen.slice(0, MAX_STECKBRIEFE).map(async (o) => {
      try {
        await steckbriefErzeugen(admin, o.sfId, o.ordnerId);
        ergebnis.steckbriefeNeu.push(o.name);
      } catch (e) {
        ergebnis.fehler.push({
          mandat: o.name,
          fehler: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );
  return ergebnis;
}
