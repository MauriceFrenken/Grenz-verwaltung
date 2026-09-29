export type EbicsKundeStatusDto = {
  id: string;
  gesellschaftId: string;
  gesellschaftName: string;
  gesellschaftKuerzel: string;
  status: string;
  anzahlKonten: number;
  hatSchluessel: boolean;
  letzterFehler: string | null;
  initialisiertAm: string | null;
  bereitAm: string | null;
};
