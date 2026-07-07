import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { einstellungenApi } from "@/api/einstellungen";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { apiFehlermeldung, istGueltigeSlugId, slugAusText } from "@/lib/apiFehlermeldung";
import { useMandantStore } from "@/store/mandant";
import type { Mandant } from "@/types";

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte Mandanten-ID angeben")
    .refine(istGueltigeSlugId, "Nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich"),
  name: z.string().trim().min(2, "Bitte Name angeben"),
  kuerzel: z.string().trim().min(1, "Bitte Kürzel angeben").max(12, "Maximal 12 Zeichen"),
});

type FormValues = z.infer<typeof schema>;

export function MandantForm({
  mandant,
  onDone,
  onLoeschenAnfragen,
}: {
  mandant?: Mandant;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(mandant);
  const { erlaubtOderHinweis } = useAktionGuard();
  const setMandanten = useMandantStore((s) => s.setMandanten);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: mandant
      ? { id: mandant.id, name: mandant.name, kuerzel: mandant.kuerzel }
      : { id: "", name: "", kuerzel: "" },
  });

  const name = form.watch("name");

  useEffect(() => {
    if (istBearbeitung || !name.trim()) return;
    const currentId = form.getValues("id");
    if (!currentId && name.trim().length >= 2) {
      form.setValue("id", slugAusText(name), { shouldValidate: true });
    }
  }, [name, form, istBearbeitung]);

  useEffect(() => {
    if (!mandant) return;
    form.reset({ id: mandant.id, name: mandant.name, kuerzel: mandant.kuerzel });
  }, [mandant, form]);

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.verwaltung.mandanten.bearbeiten"
      : "aktion.verwaltung.mandanten.anlegen";
    if (!erlaubtOderHinweis(berechtigung)) return;

    try {
      await einstellungenApi.saveMandant({
        id: values.id.trim(),
        name: values.name.trim(),
        kuerzel: values.kuerzel.trim(),
      });
      const { items } = await einstellungenApi.listMandanten();
      setMandanten(items);
      toast.success(istBearbeitung ? "Mandant aktualisiert" : "Mandant angelegt");
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="z. B. FRENKEN Holding GmbH" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="id">Mandanten-ID</Label>
        <Input
          id="id"
          placeholder="frenken-holding"
          className="font-mono text-sm"
          readOnly={istBearbeitung}
          {...form.register("id")}
        />
        {form.formState.errors.id ? (
          <p className="text-xs text-danger">{form.formState.errors.id.message}</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="kuerzel">Kürzel</Label>
        <Input id="kuerzel" placeholder="FV" maxLength={12} {...form.register("kuerzel")} />
        {form.formState.errors.kuerzel ? (
          <p className="text-xs text-danger">{form.formState.errors.kuerzel.message}</p>
        ) : null}
      </div>
      <div className="flex justify-between gap-2 pt-2">
        <div>
          {istBearbeitung && onLoeschenAnfragen ? (
            <Button type="button" variant="destructive" onClick={onLoeschenAnfragen}>
              Löschen
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={form.formState.isSubmitting}>
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
