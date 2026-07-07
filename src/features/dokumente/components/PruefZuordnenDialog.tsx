import type { PruefAufgabe } from "@/types";

import { DokumentMetadatenDialog, dokumentAusPruefAufgabe } from "./DokumentMetadatenDialog";

type PruefZuordnenDialogProps = {
  aufgabe: PruefAufgabe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function PruefZuordnenDialog({
  aufgabe,
  open,
  onOpenChange,
  onSaved,
}: PruefZuordnenDialogProps) {
  return (
    <DokumentMetadatenDialog
      dokument={aufgabe ? dokumentAusPruefAufgabe(aufgabe) : null}
      modus="zuordnen"
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}
