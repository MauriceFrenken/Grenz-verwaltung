import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { Mieter } from "@/types";

function ibanNormalisieren(wert: string): string {
  return wert.replace(/\s+/g, "").toUpperCase();
}

const schema = z.object({
  name: z.string().trim().min(2, "Bitte Namen angeben"),
  iban: z
    .string()
    .trim()
    .transform(ibanNormalisieren)
    .refine(
      (v) =>
        v === "" ||
        (v.length >= 15 &&
          v.length <= 34 &&
          /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(v)),
      "Bitte gültige IBAN angeben",
    ),
  bemerkung: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function MieterForm({
  mieter,
  formId = "mieter",
  onDone,
  onLoeschenAnfragen,
}: {
  mieter?: Mieter;
  formId?: string;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(mieter);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: mieter?.anzeigename ?? "",
      iban: mieter?.iban ?? "",
      bemerkung: mieter?.bemerkung ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await verwaltungApi.saveMieter({
        id: mieter?.id,
        nachname: values.name,
        vorname: null,
        firma: null,
        iban: values.iban || null,
        bemerkung: values.bemerkung,
      });
      toast.success(istBearbeitung ? "Mieter aktualisiert" : "Mieter angelegt");
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
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-name`}>Name</Label>
        <Input id={`${formId}-name`} {...form.register("name")} />
        {fehler.name ? (
          <p className="text-xs text-danger">{fehler.name.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formId}-iban`}>IBAN</Label>
        <Input
          id={`${formId}-iban`}
          autoComplete="off"
          spellCheck={false}
          {...form.register("iban")}
        />
        {fehler.iban ? (
          <p className="text-xs text-danger">{fehler.iban.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formId}-bemerkung`}>Bemerkung</Label>
        <Input id={`${formId}-bemerkung`} {...form.register("bemerkung")} />
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
