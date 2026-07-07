import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOESCHEN_ANTWORT = "14";

interface LoeschenDialogProps {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  titel?: string;
  beschreibung: string;
  onLoeschen: () => void | Promise<void>;
  isLoading?: boolean;
}

export function LoeschenDialog({
  offen,
  onOpenChange,
  titel = "Eintrag löschen",
  beschreibung,
  onLoeschen,
  isLoading = false,
}: LoeschenDialogProps) {
  const [antwort, setAntwort] = useState("");
  const korrekt = antwort.trim() === LOESCHEN_ANTWORT;

  useEffect(() => {
    if (!offen) setAntwort("");
  }, [offen]);

  return (
    <AlertDialog open={offen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titel}</AlertDialogTitle>
          <AlertDialogDescription>{beschreibung}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="loeschen-antwort">Zur Bestätigung: Was ist 7 + 7?</Label>
          <Input
            id="loeschen-antwort"
            inputMode="numeric"
            autoComplete="off"
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
            placeholder="Antwort eingeben"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Abbrechen</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!korrekt || isLoading}
            onClick={async () => {
              await onLoeschen();
            }}
          >
            {isLoading ? "Wird gelöscht…" : "Endgültig löschen"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
