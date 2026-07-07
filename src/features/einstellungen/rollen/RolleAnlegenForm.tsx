import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { einstellungenApi } from "@/api/einstellungen";
import { usePermissions } from "@/hooks/useAuth";
import { rollenBezeichnung } from "@/lib/constants";
import { defaultMatrixFuerRolle, slugAusBezeichnung } from "@/lib/permissions";
import { usePermissionsStore } from "@/store/permissions";
import type { RollenDefinition } from "@/types";

const schema = z.object({
  bezeichnung: z.string().trim().min(2, "Bitte Bezeichnung angeben"),
  beschreibung: z.string().trim().max(500).optional(),
  unterhalbVon: z.string().min(1, "Bitte Position wählen"),
});

type FormValues = z.infer<typeof schema>;

interface RolleAnlegenFormProps {
  onDone: (rolle: RollenDefinition) => void;
  onCancel: () => void;
}

export function RolleAnlegenForm({ onDone, onCancel }: RolleAnlegenFormProps) {
  const { platzierbareBezugsRollen, rollen: storeRollen } = usePermissions();
  const setRollen = usePermissionsStore((s) => s.setRollen);
  const setMatrix = usePermissionsStore((s) => s.setMatrix);
  const matrix = usePermissionsStore((s) => s.matrix);

  const bezugsRollen = platzierbareBezugsRollen();
  const defaultBezug = bezugsRollen[bezugsRollen.length - 1]?.id ?? "leser";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bezeichnung: "",
      beschreibung: "",
      unterhalbVon: defaultBezug,
    },
  });

  const vorschauId = useMemo(
    () => slugAusBezeichnung(form.watch("bezeichnung")),
    [form.watch("bezeichnung")],
  );

  const onSubmit = async (values: FormValues) => {
    const id = slugAusBezeichnung(values.bezeichnung);
    if (!id || !/^[a-z][a-z0-9_-]{1,48}$/.test(id)) {
      form.setError("bezeichnung", {
        message: "Bezeichnung ergibt keine gültige Rollen-ID",
      });
      return;
    }

    try {
      const rolle = await einstellungenApi.createRolle({
        id,
        bezeichnung: values.bezeichnung,
        beschreibung: values.beschreibung ?? "",
        unterhalbVon: values.unterhalbVon,
      });

      const aktualisierteRollen = [...storeRollen, rolle].sort((a, b) => a.rang - b.rang);
      setRollen(aktualisierteRollen);
      setMatrix({
        ...matrix,
        [rolle.id]: defaultMatrixFuerRolle(rolle.id),
      });

      toast.success(`Rolle „${rolle.bezeichnung}" angelegt`);
      onDone(rolle);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rolle konnte nicht angelegt werden");
    }
  };

  if (bezugsRollen.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Ihre Rolle erlaubt das Anlegen weiterer Rollen nicht.
      </p>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="bezeichnung">Bezeichnung</Label>
        <Input id="bezeichnung" placeholder="z. B. Sachbearbeiter" {...form.register("bezeichnung")} />
        {vorschauId ? (
          <p className="text-xs text-text-muted">Rollen-ID: {vorschauId}</p>
        ) : null}
        {form.formState.errors.bezeichnung ? (
          <p className="text-xs text-danger">{form.formState.errors.bezeichnung.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="beschreibung">Beschreibung (optional)</Label>
        <Textarea
          id="beschreibung"
          rows={2}
          placeholder="Kurzbeschreibung der Rolle"
          {...form.register("beschreibung")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="unterhalbVon">Position in der Hierarchie</Label>
        <Controller
          control={form.control}
          name="unterhalbVon"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="unterhalbVon" className="rounded-none">
                <SelectValue placeholder="Unterhalb von…" />
              </SelectTrigger>
              <SelectContent>
                {bezugsRollen.map((rolle) => (
                  <SelectItem key={rolle.id} value={rolle.id}>
                    Unterhalb von {rollenBezeichnung(rolle.id, bezugsRollen)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {form.formState.errors.unterhalbVon ? (
          <p className="text-xs text-danger">{form.formState.errors.unterhalbVon.message}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={form.formState.isSubmitting}
        >
          Abbrechen
        </Button>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-heading"
        >
          {form.formState.isSubmitting ? "Wird angelegt…" : "Rolle anlegen"}
        </Button>
      </div>
    </form>
  );
}
