import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Knopf } from "@/components/board/Knopf";
import { boardRepository } from "@/lib/db/config";
import type { BoardDaten } from "@/lib/db/typen";
import { excelLesen } from "@/lib/integrations/excel";
import { BOARD_DATEN_KEY } from "@/modules/shell/daten";
import { importiereDarlehen, type ImportErgebnis } from "./logik/import";

export function ImportDialog({
  offen,
  onSchliessen,
  daten,
}: {
  offen: boolean;
  onSchliessen: () => void;
  daten: BoardDaten;
}) {
  const [datei, setDatei] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const queryClient = useQueryClient();

  const zuruecksetzen = () => {
    setDatei(null);
    setErgebnis(null);
    setFehler(null);
  };

  const lesen = async (file: File) => {
    zuruecksetzen();
    setDatei(file.name);
    try {
      const zeilen = excelLesen(await file.arrayBuffer());
      setErgebnis(
        importiereDarlehen(zeilen, {
          companies: daten.companies,
          parties: daten.parties,
          propertyIds: daten.properties.map((p) => p.id),
          vorhandeneIds: daten.loans.map((l) => l.id),
        }),
      );
    } catch {
      setFehler(
        "Die Datei konnte nicht gelesen werden. Bitte eine .xlsx-Datei wählen.",
      );
    }
  };

  const uebernehmen = async () => {
    if (!ergebnis) return;
    setSpeichert(true);
    try {
      const r = await boardRepository().darlehenSpeichern(ergebnis.gueltig);
      await queryClient.invalidateQueries({ queryKey: BOARD_DATEN_KEY });
      toast.success(`${r.neu} neu, ${r.aktualisiert} aktualisiert`);
      zuruecksetzen();
      onSchliessen();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog.Root
      open={offen}
      onOpenChange={(o) => {
        if (!o) {
          zuruecksetzen();
          onSchliessen();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 flex max-h-[80vh] w-[calc(100%-2rem)] max-w-[600px] -translate-x-1/2 flex-col border border-hairline bg-elevated shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <Dialog.Title className="text-[15px] font-semibold text-heading">
              Darlehensregister importieren
            </Dialog.Title>
            <Dialog.Close
              className="flex size-7 cursor-pointer items-center justify-center text-text-muted hover:bg-surface-muted"
              aria-label="Schließen"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Excel-Datei mit einer Zeile je Darlehen hochladen
          </Dialog.Description>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-input bg-surface-muted/50 px-4 py-8 text-center transition-colors hover:bg-surface-muted">
              <FileSpreadsheet
                className="size-6 text-primary"
                strokeWidth={1.75}
              />
              <span className="text-sm font-medium text-heading">
                {datei ?? "Excel-Datei wählen (.xlsx)"}
              </span>
              <span className="text-xs text-text-muted">
                Eine Zeile je Darlehen, Kopfzeile laut Spezifikation
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void lesen(f);
                  e.target.value = "";
                }}
              />
            </label>
            {fehler ? <p className="mt-3 text-sm text-bad">{fehler}</p> : null}
            {ergebnis ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 bg-ok-soft px-2 py-1 text-ok">
                    <CheckCircle2 className="size-3.5" />{" "}
                    {ergebnis.gueltig.length} gültig
                  </span>
                  <span className=" bg-surface-muted px-2 py-1 text-text-muted">
                    {ergebnis.neu.length} neu
                  </span>
                  <span className=" bg-surface-muted px-2 py-1 text-text-muted">
                    {ergebnis.aktualisiert.length} aktualisiert
                  </span>
                  {ergebnis.fehler.length ? (
                    <span className=" bg-bad-soft px-2 py-1 text-bad">
                      {ergebnis.fehler.length} Fehler
                    </span>
                  ) : null}
                </div>
                {ergebnis.fehler.length ? (
                  <ul className="max-h-[220px] divide-y divide-hairline overflow-y-auto border border-hairline text-sm">
                    {ergebnis.fehler.map((f, i) => (
                      <li key={i} className="flex gap-3 px-3 py-2">
                        <span className="w-16 shrink-0 tabular-nums text-text-muted">
                          Zeile {f.zeile}
                        </span>
                        <span className="w-32 shrink-0 truncate text-text-muted">
                          {f.feld}
                        </span>
                        <span className="text-foreground">{f.meldung}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
            <Dialog.Close asChild>
              <Knopf variante="geist">Abbrechen</Knopf>
            </Dialog.Close>
            <Knopf
              variante="primaer"
              disabled={!ergebnis || ergebnis.gueltig.length === 0 || speichert}
              onClick={() => void uebernehmen()}
            >
              <Upload />{" "}
              {ergebnis
                ? `${ergebnis.gueltig.length} Darlehen übernehmen`
                : "Übernehmen"}
            </Knopf>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
