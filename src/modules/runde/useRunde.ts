import { useMemo } from "react";
import { PHASE_LABEL } from "@/lib/db/transaktionen";
import { handelAuswerten } from "@/modules/baumaschinen/logik/baumaschinen";
import { fristenBis } from "@/modules/cockpit/logik/antworten";
import {
  HORIZONT_TAGE,
  kreisReihe,
  tiefpunkt,
  tragbaresEk,
} from "@/modules/liquiditaet/logik/liquiditaet";
import { useLage } from "@/modules/pruefliste/useLage";
import { useGesellschaftsFilter } from "@/modules/shell/daten";
import {
  ankaufKennzahlen,
  ekBedarfAbAngebot,
} from "@/modules/transaktionen/logik/transaktionen";
import { tagesordnung, type RundeEingabe } from "./logik/runde";
import { useBeschluesse } from "./useBeschluesse";

export { useBeschlussAktionen } from "./useBeschluesse";

/** Tagesordnung der Wochenrunde aus der Gesamtlage und den Beschlüssen. */
export function useRunde() {
  const lage = useLage();
  const filter = useGesellschaftsFilter();
  const beschluesse = useBeschluesse();

  const eingabe = useMemo<RundeEingabe | null>(() => {
    const { data: daten, liquiditaet: l, darlehen, faelle, crm } = lage;
    if (!daten || !l || !darlehen || !faelle || !crm || !beschluesse.data)
      return null;
    const passt = (id: string | null | undefined) => filter.passt(id);
    const stichtag = daten.stichtag;
    const kurz = new Map(daten.companies.map((c) => [c.id, c.shortName]));

    const ids = filter.alle ? l.freieIds : [filter.gesellschaft];
    const kreis = daten.companies.filter((c) => ids.includes(c.id));
    const mindest = kreis.reduce((s, c) => s + c.minLiquidity, 0);
    const reihe = kreisReihe(l.verlauf, ids);
    const kurzReihe = reihe.slice(0, HORIZONT_TAGE + 1);

    const handel = handelAuswerten(daten, passt);
    const k = crm.ankaeufe.map((a) => ankaufKennzahlen(a, stichtag));
    const aktiv = k.filter(
      (x) =>
        x.ankauf.phase !== "gekauft" &&
        x.ankauf.phase !== "abgesagt" &&
        (filter.alle || passt(x.ankauf.zielGesellschaftId)),
    );

    return {
      stichtag,
      beschluesse: beschluesse.data.eintraege.filter(
        (b) => filter.alle || b.companyId == null || passt(b.companyId),
      ),
      geld: {
        heute: kurzReihe[0]?.wert ?? 0,
        tief13: (() => {
          const t = tiefpunkt(kurzReihe);
          return { saldo: t.saldo, datum: t.datum };
        })(),
        mindest,
        unterPuffer: l.gesellschaften
          .filter((g) => g.ersteUnterschreitung && passt(g.company.id))
          .sort((a, b) =>
            a.ersteUnterschreitung!.localeCompare(b.ersteUnterschreitung!),
          )
          .map((g) => ({
            name: g.company.name,
            ab: g.ersteUnterschreitung!,
            luecke: g.luecke,
            ampel: g.ampel,
          })),
        kontenOhneSaldo: daten.bankAccounts.filter(
          (b) => ids.includes(b.companyId) && !b.saldoBekannt,
        ).length,
        mindestFehlt: kreis.filter((c) => !c.minLiquidityGesetzt).length,
      },
      fristen: fristenBis(darlehen.staende, stichtag, 90, passt).map((f) => ({
        id: f.stand.loan.id,
        ereignis: f.ereignis,
        datum: f.datum,
        restschuld: f.stand.restschuld,
        nehmer: kurz.get(f.stand.loan.borrowerCompanyId ?? "") ?? "–",
      })),
      deals: aktiv.map((x) => ({
        id: x.ankauf.id,
        name: x.ankauf.name,
        phase: PHASE_LABEL[x.ankauf.phase],
        naechsterSchritt: x.ankauf.naechsterSchritt ?? null,
        naechsterSchrittAm: x.ankauf.naechsterSchrittAm ?? null,
        ekBedarf: x.ekBedarf,
      })),
      ekBedarfAbAngebot: ekBedarfAbAngebot(aktiv),
      ekFrei: tragbaresEk(reihe, stichtag, mindest),
      maschinen: {
        vorhanden: daten.machines.some((m) => passt(m.companyId)),
        lagerwert: handel.lagerwert,
        icFinanzierung: handel.icFinanzierung,
        ueber90: handel.bestand
          .filter((m) => (m.lagerTage ?? 0) >= 90)
          .map((m) => ({
            id: m.machine.id,
            titel: `${m.machine.hersteller} ${m.machine.modell}`,
            tage: m.lagerTage ?? 0,
            einstand: m.einstand,
            ampel: m.ampel,
          })),
      },
      immobilienFaelle: faelle.filter(
        (f) =>
          f.source === "immobilien" &&
          (filter.alle || f.companyId === filter.gesellschaft),
      ),
      luecken: daten.luecken.filter(
        (x) => filter.alle || x.companyId == null || passt(x.companyId),
      ),
    };
  }, [lage, filter, beschluesse.data]);

  const punkte = useMemo(
    () => (eingabe ? tagesordnung(eingabe) : null),
    [eingabe],
  );

  return {
    lage,
    eingabe,
    punkte,
    beschluesse: beschluesse.data,
    fehler: lage.fehler ?? beschluesse.error,
    laedt: !punkte,
  };
}
