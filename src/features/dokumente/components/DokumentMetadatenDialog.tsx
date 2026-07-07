import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dokumenteApi } from "@/api/dokumente";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import { usePermissions } from "@/hooks/useAuth";
import type { Dokument, DokumentMetadatenKorrektur, PruefAufgabe } from "@/types";

export type DokumentMetadatenModus = "zuordnen" | "bearbeiten";

type DokumentMetadatenDialogProps = {
  dokument: Dokument | null;
  modus: DokumentMetadatenModus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function ausPruefAufgabe(aufgabe: PruefAufgabe): Dokument {
  return {
    id: aufgabe.id,
    dateiname: aufgabe.dateiname,
    mandantId: aufgabe.vorschlag.mandantId,
    objektId: aufgabe.vorschlag.objektId,
    kategorieId: aufgabe.vorschlag.kategorieId,
    transaktionId: null,
    typ: aufgabe.vorschlag.typ,
    datum: aufgabe.eingegangenAm,
    ablageort: "",
    status: "in_pruefung",
    kategorieName: aufgabe.vorschlag.kategorieName,
    betreff: aufgabe.betreff,
    absender: aufgabe.absender,
    anhangName: aufgabe.anhangName,
    emailText: aufgabe.emailText,
  };
}

export function dokumentAusPruefAufgabe(aufgabe: PruefAufgabe): Dokument {
  return ausPruefAufgabe(aufgabe);
}

export function modusFuerDokument(dokument: Dokument): DokumentMetadatenModus {
  return dokument.status === "in_pruefung" ? "zuordnen" : "bearbeiten";
}

const MODUS_KONFIG: Record<
  DokumentMetadatenModus,
  { titel: string; beschreibung: string; speichernLabel: string; berechtigung: "aktion.dokumente.pruefordner.neu_zuordnen" | "aktion.dokumente.ablage.bearbeiten" }
> = {
  zuordnen: {
    titel: "Manuell zuordnen",
    beschreibung:
      "Die KI konnte nicht alle Felder sicher zuordnen. Prüfen Sie E-Mail und Anhang und ergänzen Sie die Angaben.",
    speichernLabel: "Zuordnen & ablegen",
    berechtigung: "aktion.dokumente.pruefordner.neu_zuordnen",
  },
  bearbeiten: {
    titel: "Dokument bearbeiten",
    beschreibung:
      "E-Mail und Metadaten prüfen. Änderungen an Mandant, Objekt, Kategorie oder Dateiname werden übernommen.",
    speichernLabel: "Speichern",
    berechtigung: "aktion.dokumente.ablage.bearbeiten",
  },
};

export function DokumentMetadatenDialog({
  dokument,
  modus,
  open,
  onOpenChange,
  onSaved,
}: DokumentMetadatenDialogProps) {
  const { darfAktion, istOpAdmin, permissionsLoading } = usePermissions();
  const konfig = MODUS_KONFIG[modus];
  const darfBearbeiten =
    !permissionsLoading &&
    (istOpAdmin() ||
      darfAktion(konfig.berechtigung) ||
      darfAktion("aktion.dokumente.pruefordner.neu_zuordnen"));

  const [mandantId, setMandantId] = useState("");
  const [objektId, setObjektId] = useState("");
  const [kategorieId, setKategorieId] = useState("");
  const [dateiname, setDateiname] = useState("");
  const [saving, setSaving] = useState(false);

  const [mandanten, setMandanten] = useState<Array<{ id: string; name: string }>>([]);
  const [objekte, setObjekte] = useState<Array<{ id: string; bezeichnung: string; mandantId: string }>>([]);
  const [kategorien, setKategorien] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      einstellungenApi.listMandanten(),
      verwaltungApi.listObjekte(),
      dokumenteApi.listKategorien(),
    ]).then(([m, o, k]) => {
      setMandanten(m.items.map((x) => ({ id: x.id, name: x.name })));
      setObjekte(o.items.map((x) => ({ id: x.id, bezeichnung: x.bezeichnung, mandantId: x.mandantId })));
      setKategorien(k.items.map((x) => ({ id: x.id, name: x.name })));
    });
  }, [open]);

  useEffect(() => {
    if (!dokument) return;
    setMandantId(dokument.mandantId ?? "");
    setObjektId(dokument.objektId ?? "");
    setKategorieId(dokument.kategorieId ?? "");
    setDateiname(dokument.dateiname);
  }, [dokument]);

  const gefilterteObjekte = mandantId
    ? objekte.filter((o) => o.mandantId === mandantId)
    : objekte;

  const handleMandantChange = (value: string) => {
    setMandantId(value);
    if (objektId && !objekte.some((o) => o.id === objektId && o.mandantId === value)) {
      setObjektId("");
    }
  };

  const korrekturAusFormular = (): DokumentMetadatenKorrektur | null => {
    if (!mandantId || !objektId || !kategorieId || !dateiname.trim()) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return null;
    }
    return { mandantId, objektId, kategorieId, dateiname: dateiname.trim() };
  };

  const handleSave = async () => {
    if (!dokument || !darfBearbeiten) return;
    const korrektur = korrekturAusFormular();
    if (!korrektur) return;

    setSaving(true);
    try {
      if (modus === "zuordnen") {
        await dokumenteApi.entscheidePruefAufgabe(dokument.id, "neu_zugeordnet", korrektur);
        toast.success("Dokument zugeordnet und abgelegt");
      } else {
        await dokumenteApi.updateDokumentMetadaten(dokument.id, korrektur);
        toast.success("Metadaten gespeichert");
      }
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(modus === "zuordnen" ? "Zuordnung fehlgeschlagen" : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const felderDeaktiviert = !darfBearbeiten;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{konfig.titel}</DialogTitle>
          <DialogDescription>{konfig.beschreibung}</DialogDescription>
        </DialogHeader>

        {dokument && (
          <div className="space-y-4">
            <div className="space-y-2 border border-hairline bg-surface-muted p-3 text-sm">
              <p>
                <span className="text-text-subtle">Betreff:</span> {dokument.betreff ?? "–"}
              </p>
              <p>
                <span className="text-text-subtle">Absender:</span> {dokument.absender ?? "–"}
              </p>
              {dokument.anhangName ? (
                <p>
                  <span className="text-text-subtle">Anhang:</span> {dokument.anhangName}
                </p>
              ) : null}
              {dokument.emailText ? (
                <div className="mt-2">
                  <p className="text-xs font-medium uppercase text-text-subtle">E-Mail-Text</p>
                  <Textarea readOnly rows={6} value={dokument.emailText} className="mt-1 text-xs" />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mandant</Label>
                <Select value={mandantId} onValueChange={handleMandantChange} disabled={felderDeaktiviert}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mandant wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {mandanten.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Objekt</Label>
                <Select value={objektId} onValueChange={setObjektId} disabled={felderDeaktiviert}>
                  <SelectTrigger>
                    <SelectValue placeholder="Objekt wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {gefilterteObjekte.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.bezeichnung}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kategorie</Label>
                <Select value={kategorieId} onValueChange={setKategorieId} disabled={felderDeaktiviert}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kategorie wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {kategorien.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dateiname</Label>
                <Input
                  value={dateiname}
                  onChange={(e) => setDateiname(e.target.value)}
                  disabled={felderDeaktiviert}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {darfBearbeiten ? "Abbrechen" : "Schließen"}
          </Button>
          {darfBearbeiten ? (
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {konfig.speichernLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
