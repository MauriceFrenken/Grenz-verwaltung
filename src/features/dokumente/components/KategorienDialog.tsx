import { Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useApi } from "@/hooks/useApi";
import { dokumenteApi } from "@/api/dokumente";
import type { DokumentKategorie } from "@/types";

type KategorienDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function KategorienDialog({ open, onOpenChange }: KategorienDialogProps) {
  const { data, isLoading, reload } = useApi(
    () => (open ? dokumenteApi.listKategorien() : Promise.resolve({ items: [], gesamt: 0 })),
    [open],
  );
  const [name, setName] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DokumentKategorie | null>(null);

  const resetForm = () => {
    setName("");
    setBeschreibung("");
    setEditing(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Kategoriename ist erforderlich");
      return;
    }
    setSaving(true);
    try {
      await dokumenteApi.saveKategorie({
        id: editing?.id,
        name: name.trim(),
        beschreibung: beschreibung.trim(),
      });
      toast.success(editing ? "Kategorie aktualisiert" : "Kategorie angelegt");
      resetForm();
      reload();
    } catch {
      toast.error("Kategorie konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (kategorie: DokumentKategorie) => {
    setEditing(kategorie);
    setName(kategorie.name);
    setBeschreibung(kategorie.beschreibung);
  };

  const handleDelete = async (id: string) => {
    try {
      await dokumenteApi.deleteKategorie(id);
      toast.success("Kategorie gelöscht");
      if (editing?.id === id) resetForm();
      reload();
    } catch {
      toast.error("Kategorie konnte nicht gelöscht werden");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" strokeWidth={1.5} />
            Dokument-Kategorien
          </DialogTitle>
        </DialogHeader>

        <PermissionGate berechtigung="aktion.dokumente.kategorien.verwalten">
          <div className="space-y-3 border border-hairline bg-surface-muted p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
              {editing ? "Kategorie bearbeiten" : "Neue Kategorie"}
            </p>
            <div className="space-y-2">
              <Label htmlFor="kat-name">Name</Label>
              <Input
                id="kat-name"
                placeholder="z. B. Rechnung, Kündigung, Mietvertrag"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kat-beschreibung">Beschreibung für die KI</Label>
              <Textarea
                id="kat-beschreibung"
                placeholder="Wann gilt diese Kategorie? Was erkennt die KI daran?"
                rows={3}
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                )}
                {editing ? "Speichern" : "Hinzufügen"}
              </Button>
              {editing && (
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  Abbrechen
                </Button>
              )}
            </div>
          </div>
        </PermissionGate>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            Vorhandene Kategorien
          </p>
          {isLoading ? (
            <p className="text-sm text-text-muted">Laden…</p>
          ) : (data?.items ?? []).length === 0 ? (
            <p className="text-sm text-text-muted">Keine Einträge vorhanden</p>
          ) : (
            <ul className="divide-y divide-hairline border border-hairline">
              {(data?.items ?? []).map((kategorie) => (
                <li key={kategorie.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-heading">{kategorie.name}</p>
                    {kategorie.beschreibung ? (
                      <p className="mt-0.5 text-xs text-text-muted">{kategorie.beschreibung}</p>
                    ) : null}
                  </div>
                  <PermissionGate berechtigung="aktion.dokumente.kategorien.verwalten">
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(kategorie)}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => void handleDelete(kategorie.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </PermissionGate>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
