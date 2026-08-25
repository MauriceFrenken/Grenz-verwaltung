import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verwaltungApi } from "@/api/verwaltung";
import {
  apiFehlermeldung,
  istGueltigeSlugId,
  slugAusText,
} from "@/lib/apiFehlermeldung";
import type { Gesellschaft } from "@/types";

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte ID angeben")
    .refine(
      (v) => istGueltigeSlugId(v),
      "Nur Buchstaben, Zahlen, Bindestrich und Unterstrich",
    ),
  name: z.string().trim().min(2, "Bitte Namen angeben"),
  kuerzel: z
    .string()
    .trim()
    .min(1, "Bitte Kürzel angeben")
    .max(12, "Höchstens 12 Zeichen"),
  datevPostfach: z
    .string()
    .trim()
    .email("Bitte gültige Adresse angeben")
    .or(z.literal("")),
  datevPostfachBezeichnung: z.string().trim(),
  bemerkung: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function GesellschaftForm({
  gesellschaft,
  onDone,
  onLoeschenAnfragen,
}: {
  gesellschaft?: Gesellschaft;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(gesellschaft);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: gesellschaft?.id ?? "",
      name: gesellschaft?.name ?? "",
      kuerzel: gesellschaft?.kuerzel ?? "",
      datevPostfach: gesellschaft?.datevPostfach ?? "",
      datevPostfachBezeichnung: gesellschaft?.datevPostfachBezeichnung ?? "",
      bemerkung: gesellschaft?.bemerkung ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await verwaltungApi.saveGesellschaft({
        id: values.id,
        name: values.name,
        kuerzel: values.kuerzel,
        datevPostfach: values.datevPostfach,
        datevPostfachBezeichnung: values.datevPostfachBezeichnung,
        bemerkung: values.bemerkung,
      });
      toast.success(
        istBearbeitung ? "Gesellschaft aktualisiert" : "Gesellschaft angelegt",
      );
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const fehler = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid w-full min-w-0 gap-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="id">ID</Label>
          <Input
            id="id"
            placeholder="G-06"
            readOnly={istBearbeitung}
            className={istBearbeitung ? "bg-muted text-text-muted" : undefined}
            {...form.register("id")}
          />
          {fehler.id ? (
            <p className="text-xs text-danger">{fehler.id.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kuerzel">Kürzel</Label>
          <Input id="kuerzel" placeholder="FHG" {...form.register("kuerzel")} />
          {fehler.kuerzel ? (
            <p className="text-xs text-danger">{fehler.kuerzel.message}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Gesellschaft</Label>
        <Input
          id="name"
          placeholder="FRENKEN Holding GmbH"
          {...form.register("name", {
            onBlur: (e) => {
              if (istBearbeitung || form.getValues("id")) return;
              form.setValue(
                "id",
                slugAusText(e.target.value, 48).toUpperCase(),
              );
            },
          })}
        />
        {fehler.name ? (
          <p className="text-xs text-danger">{fehler.name.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="datevPostfach">DATEV-Postfach (Rechnungseingang)</Label>
        <Input
          id="datevPostfach"
          type="email"
          placeholder="…@uploadmail.datev.de"
          {...form.register("datevPostfach")}
        />
        {fehler.datevPostfach ? (
          <p className="text-xs text-danger">{fehler.datevPostfach.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="datevPostfachBezeichnung">Bezeichnung Postfach</Label>
        <Input
          id="datevPostfachBezeichnung"
          {...form.register("datevPostfachBezeichnung")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bemerkung">Bemerkung</Label>
        <Input id="bemerkung" {...form.register("bemerkung")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
        {onLoeschenAnfragen ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onLoeschenAnfragen}
          >
            Löschen
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDone}
            disabled={form.formState.isSubmitting}
          >
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}
