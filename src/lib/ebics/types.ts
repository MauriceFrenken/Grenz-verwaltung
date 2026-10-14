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
  /** Konten inkl. Gesellschaft aus bankkonten (ein Zugang kann mehrere Firmen abdecken). */
  konten: EbicsKontoStatusDto[];
};
