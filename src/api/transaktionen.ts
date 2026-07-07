import { NotImplementedError } from "@/lib/errors";
import type { ExposeImportAufgabe, Filter, Paginated, Transaktion } from "@/types";

export const transaktionenApi = {
  async listTransaktionen(_filter: Filter = {}): Promise<Paginated<Transaktion>> {
    return { items: [], gesamt: 0 };
  },
  async getTransaktion(_id: string): Promise<Transaktion | null> {
    return null;
  },
  async listExposeImportAufgaben(_filter: Filter = {}): Promise<Paginated<ExposeImportAufgabe>> {
    return { items: [], gesamt: 0 };
  },
  async uebernehmeInSalesforce(_id: string): Promise<{ salesforceId: string }> {
    throw new NotImplementedError("transaktionen.uebernehmeInSalesforce");
  },
  async korrigiereExposeAufgabe(_id: string, _korrektur: Partial<ExposeImportAufgabe["extrahiert"]>): Promise<void> {
    throw new NotImplementedError("transaktionen.korrigiereExposeAufgabe");
  },
  async verwerfeExposeAufgabe(_id: string): Promise<void> {
    throw new NotImplementedError("transaktionen.verwerfeExposeAufgabe");
  },
  async uploadExpose(_file: File): Promise<{ aufgabeId: string }> {
    throw new NotImplementedError("transaktionen.uploadExpose");
  },
};

export type TransaktionenApi = typeof transaktionenApi;