import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buchhaltungApi } from "@/api/buchhaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import {
  parseBankAuszugPdf,
  type BankBuchungEingabe,
} from "@/lib/bankAuszugPdf";
import type { Gesellschaft } from "@/types";

export function BankauszugImportDialog({
  offen,
  onOpenChange,
  laufId,
  gesellschaften,
  vorgabeGesellschaftId,
  onDone,
}: {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  laufId: string;
  gesellschaften: Gesellschaft[];
  vorgabeGesellschaftId?: string | null;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [gesellschaftId, setGesellschaftId] = useState("");
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<{
    anzahl: number;
    mitIban: number;
    eingaenge: number;
    warnungen: string[];
    buchungen: BankBuchungEingabe[];
    zeitraumVon: string | null;
    zeitraumBis: string | null;
  } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [parseLaeuft, setParseLaeuft] = useState(false);

  useEffect(() => {
    if (!offen) return;
    const vorgabe =
      vorgabeGesellschaftId &&
      gesellschaften.some((g) => g.id === vorgabeGesellschaftId)
        ? vorgabeGesellschaftId
        : (gesellschaften[0]?.id ?? "");
    setGesellschaftId(vorgabe);
  }, [offen, vorgabeGesellschaftId, gesellschaften]);

  const reset = () => {
    setDateiname(null);
    setVorschau(null);
    setParseLaeuft(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setDateiname(file.name);
    setVorschau(null);
    setParseLaeuft(true);
    try {
      const parsed = await parseBankAuszugPdf(file);
      const eingaenge = parsed.buchungen.filter((b) => b.betrag > 0);
      setVorschau({
        anzahl: parsed.buchungen.length,
        mitIban: eingaenge.filter((b) => b.gegenkontoIban).length,
        eingaenge: eingaenge.length,
        warnungen: parsed.warnungen,
        buchungen: parsed.buchungen,
        zeitraumVon: parsed.zeitraumVon,
        zeitraumBis: parsed.zeitraumBis,
      });
      for (const w of parsed.warnungen) toast.message(w);
    } catch (err) {
      setVorschau(null);
      toast.error(apiFehlermeldung(err));
    } finally {
      setParseLaeuft(false);
    }
  };

  const importieren = async () => {
    if (!vorschau || !gesellschaftId) {
      toast.error("Gesellschaft und PDF wählen");
      return;
    }
    setLaeuft(true);
    try {
      await buchhaltungApi.importBankauszug({
        laufId,
        gesellschaftId,
        dateiname: dateiname ?? "kontoauszug.pdf",
        zeitraumVon: vorschau.zeitraumVon,
        zeitraumBis: vorschau.zeitraumBis,
        buchungen: vorschau.buchungen,
      });
      toast.success(
        `${vorschau.anzahl} Buchungen importiert · Abgleich aktualisiert`,
      );
      reset();
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog
      open={offen}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] gap-0 p-0 sm:rounded-none">
        <div className="space-y-4 p-6 pb-4">
          <DialogHeader>
            <DialogTitle>Bankauszug importieren</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label
                htmlFor="bank-gesellschaft"
                className="label-caps text-text-subtle"
              >
                Gesellschaft
              </Label>
              <Select value={gesellschaftId} onValueChange={setGesellschaftId}>
                <SelectTrigger
                  id="bank-gesellschaft"
                  className="w-full rounded-none"
                >
                  <SelectValue placeholder="Gesellschaft wählen" />
                </SelectTrigger>
                <SelectContent>
                  {gesellschaften.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {`${g.name} (${g.kuerzel})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="label-caps text-text-subtle">
                Kontoauszug (PDF)
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full justify-start rounded-none px-3 py-2"
                onClick={() => fileRef.current?.click()}
                disabled={parseLaeuft}
              >
                <Upload
                  className="mr-2 h-4 w-4 shrink-0"
                  strokeWidth={1.5}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {parseLaeuft
                    ? "PDF wird gelesen…"
                    : (dateiname ?? "PDF wählen")}
                </span>
              </Button>
            </div>

            {vorschau ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border border-hairline bg-surface-muted p-3 text-sm">
                <dt className="text-text-muted">Buchungen</dt>
                <dd className="text-right tabular-nums text-heading">
                  {vorschau.anzahl}
                </dd>
                <dt className="text-text-muted">Eingänge</dt>
                <dd className="text-right tabular-nums text-heading">
                  {vorschau.eingaenge}
                </dd>
                <dt className="text-text-muted">Mit IBAN</dt>
                <dd className="text-right tabular-nums text-heading">
                  {vorschau.mitIban}
                </dd>
              </dl>
            ) : null}
          </div>
        </div>
        <DialogFooter className="gap-2 border-t border-hairline p-4 sm:space-x-0">
          <Button
            variant="outline"
            className="rounded-none"
            onClick={() => onOpenChange(false)}
            disabled={laeuft}
          >
            Abbrechen
          </Button>
          <Button
            className="rounded-none bg-primary text-primary-foreground hover:bg-heading"
            onClick={() => void importieren()}
            disabled={laeuft || parseLaeuft || !vorschau || !gesellschaftId}
          >
            {laeuft ? "Import…" : "Importieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
