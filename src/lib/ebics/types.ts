export type EbicsKontoStatusDto = {
  iban: string;
  bezeichnung: string | null;
  gesellschaftId: string;
  gesellschaftKuerzel: string;
  gesellschaftName: string;
};

export type EbicsKundeStatusDto = {
  id: string;
  partnerId: string;
  gesellschaftId: string;
  gesellschaftName: string;
  gesellschaftKuerzel: string;
  status: string;
  anzahlKonten: number;
  hatSchluessel: boolean;
  letzterFehler: string | null;
  initialisiertAm: string | null;
  bereitAm: string | null;
  /** Konten inkl. Gesellschaft aus bankkonten. */
  konten: EbicsKontoStatusDto[];
};

export type EbicsUmsaetzeDto = {
  konten: Array<{
    iban: string;
    bezeichnung: string | null;
    /** Letzter Tagesendsaldo aus dem camt.053 (null = noch kein Abruf). */
    saldo: number | null;
    saldoStichtag: string | null;
  }>;
  /** Die letzten 200 Buchungen, neueste zuerst. */
  buchungen: Array<{
    id: string;
    kontoIban: string;
    buchungsdatum: string;
    betrag: number;
    auftraggeberName: string | null;
    verwendungszweck: string | null;
  }>;
};
