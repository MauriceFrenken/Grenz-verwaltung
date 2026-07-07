import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { useMandant } from "@/hooks/useMandant";
import { apiFehlermeldung, istGueltigeSlugId, slugAusText } from "@/lib/apiFehlermeldung";
import type { Objekt } from "@/types";

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte Objekt-ID angeben")
    .refine((value) => istGueltigeSlugId(value, "objekt"), "Nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich"),
  bezeichnung: z.string().trim().min(2, "Bitte Bezeichnung angeben"),
  mandantId: z.string().min(1, "Bitte Mandant wählen"),
  strasse: z.string().trim().min(1, "Bitte Straße angeben"),
  plz: z.string().trim().min(4, "Bitte PLZ angeben"),
  ort: z.string().trim().min(2, "Bitte Ort angeben"),
  land: z.string().trim().min(2).default("DE"),
});

type FormValues = z.infer<typeof schema>;

function werteAusObjekt(objekt: Objekt): FormValues {
  return {
    id: objekt.id,
    bezeichnung: objekt.bezeichnung,
    mandantId: objekt.mandantId,
    strasse: objekt.adresse.strasse,
    plz: objekt.adresse.plz,
    ort: objekt.adresse.ort,
    land: objekt.adresse.land,
  };
}

export function ObjektForm({
  objekt,
  onDone,
  onLoeschenAnfragen,
}: {
  objekt?: Objekt;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(objekt);
  const { aktiveMandantId } = useMandant();
  const { erlaubtOderHinweis } = useAktionGuard();
  const mandanten = useApi(() => einstellungenApi.listMandanten(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: objekt
      ? werteAusObjekt(objekt)
      : {
          id: "",
          bezeichnung: "",
          mandantId: aktiveMandantId ?? "",
          strasse: "",
          plz: "",
          ort: "",
          land: "DE",
        },
  });

  const bezeichnung = form.watch("bezeichnung");

  useEffect(() => {
    if (!objekt) return;
    form.reset(werteAusObjekt(objekt));
  }, [objekt, form]);

  useEffect(() => {
    if (istBearbeitung) return;
    if (aktiveMandantId && !form.getValues("mandantId")) {
      form.setValue("mandantId", aktiveMandantId);
    }
  }, [aktiveMandantId, form, istBearbeitung]);

  useEffect(() => {
    if (istBearbeitung) return;
    const currentId = form.getValues("id");
    if (!currentId && bezeichnung.trim().length >= 2) {
      form.setValue("id", slugAusText(bezeichnung, 63, "objekt"), { shouldValidate: true });
    }
  }, [bezeichnung, form, istBearbeitung]);

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.verwaltung.objekte.bearbeiten"
      : "aktion.verwaltung.objekte.anlegen";
    if (!erlaubtOderHinweis(berechtigung)) return;

    const payload = {
      bezeichnung: values.bezeichnung.trim(),
      mandantId: values.mandantId,
      adresse: {
        strasse: values.strasse.trim(),
        plz: values.plz.trim(),
        ort: values.ort.trim(),
        land: values.land.trim() || "DE",
      },
      status: objekt?.status ?? ("aktiv" as const),
    };

    try {
      if (istBearbeitung && objekt) {
        await verwaltungApi.updateObjekt(objekt.id, payload);
        toast.success("Objekt aktualisiert");
      } else {
        await verwaltungApi.createObjekt({ ...payload, id: values.id.trim() });
        toast.success("Objekt angelegt");
      }
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const mandantenListe = mandanten.data?.items ?? [];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="bezeichnung">Bezeichnung</Label>
        <Input id="bezeichnung" placeholder="Musterstraße 12" {...form.register("bezeichnung")} />
        {form.formState.errors.bezeichnung ? (
          <p className="text-xs text-danger">{form.formState.errors.bezeichnung.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="id">Objekt-ID</Label>
          <Input id="id" className="font-mono text-sm" readOnly={istBearbeitung} {...form.register("id")} />
          {form.formState.errors.id ? (
            <p className="text-xs text-danger">{form.formState.errors.id.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mandantId">Mandant</Label>
          <Controller
            control={form.control}
            name="mandantId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={mandantenListe.length === 0}>
                <SelectTrigger id="mandantId" className="rounded-none">
                  <SelectValue placeholder={mandantenListe.length === 0 ? "Kein Mandant vorhanden" : "Mandant wählen"} />
                </SelectTrigger>
                <SelectContent>
                  {mandantenListe.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.mandantId ? (
            <p className="text-xs text-danger">{form.formState.errors.mandantId.message}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="strasse">Straße</Label>
        <Input id="strasse" {...form.register("strasse")} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="plz">PLZ</Label>
          <Input id="plz" {...form.register("plz")} />
        </div>
        <div className="col-span-2 grid gap-2">
          <Label htmlFor="ort">Ort</Label>
          <Input id="ort" {...form.register("ort")} />
        </div>
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
            disabled={form.formState.isSubmitting || mandantenListe.length === 0}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}
