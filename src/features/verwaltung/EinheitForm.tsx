import { useEffect, useRef } from "react";
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
import { verwaltungApi } from "@/api/verwaltung";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { useMandant } from "@/hooks/useMandant";
import { apiFehlermeldung, istGueltigeSlugId, slugAusText } from "@/lib/apiFehlermeldung";
import type { Einheit, EinheitStatus } from "@/types";

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte Einheit-ID angeben")
    .refine((value) => istGueltigeSlugId(value, "objekt"), "Nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich"),
  objektId: z.string().min(1, "Bitte Objekt wählen"),
  lage: z.string().trim().min(1, "Bitte Lage angeben"),
  flaecheM2: z.coerce.number().positive("Fläche muss größer als 0 sein"),
  status: z.enum(["vermietet", "leerstand", "wartung", "reserviert"]),
});

type FormValues = z.infer<typeof schema>;

function werteAusEinheit(einheit: Einheit): FormValues {
  return {
    id: einheit.id,
    objektId: einheit.objektId,
    lage: einheit.lage,
    flaecheM2: einheit.flaecheM2,
    status: einheit.status,
  };
}

export function EinheitForm({
  einheit,
  onDone,
  onLoeschenAnfragen,
}: {
  einheit?: Einheit;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(einheit);
  const { aktiveMandantId } = useMandant();
  const { erlaubtOderHinweis } = useAktionGuard();
  const idManuell = useRef(false);

  const objekte = useApi(
    () => verwaltungApi.listObjekte({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );
  const einheiten = useApi(
    () => verwaltungApi.listEinheiten({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: einheit
      ? werteAusEinheit(einheit)
      : {
          id: "",
          objektId: "",
          lage: "",
          flaecheM2: 0,
          status: "leerstand",
        },
  });

  const objektId = form.watch("objektId");
  const lage = form.watch("lage");

  useEffect(() => {
    if (!einheit) return;
    form.reset(werteAusEinheit(einheit));
  }, [einheit, form]);

  useEffect(() => {
    if (istBearbeitung || idManuell.current || !objektId || !lage.trim()) return;
    const suffix = slugAusText(lage, 40, "objekt");
    form.setValue("id", `${objektId}-${suffix}`, { shouldValidate: true });
  }, [objektId, lage, form, istBearbeitung]);

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.verwaltung.einheiten.bearbeiten"
      : "aktion.verwaltung.einheiten.anlegen";
    if (!erlaubtOderHinweis(berechtigung)) return;

    try {
      if (istBearbeitung && einheit) {
        await verwaltungApi.updateEinheit(einheit.id, {
          lage: values.lage.trim(),
          flaecheM2: values.flaecheM2,
          status: values.status as EinheitStatus,
        });
        toast.success("Einheit aktualisiert");
      } else {
        await verwaltungApi.createEinheit({
          id: values.id.trim(),
          objektId: values.objektId,
          lage: values.lage.trim(),
          flaecheM2: values.flaecheM2,
          status: values.status as EinheitStatus,
        });
        toast.success("Einheit angelegt");
      }
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const objektListe = objekte.data?.items ?? [];
  const einheitenProObjekt = (einheiten.data?.items ?? []).filter((e) => e.objektId === objektId).length;
  const aktuellesObjekt = objektListe.find((o) => o.id === einheit?.objektId);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="objektId">Objekt</Label>
        {istBearbeitung ? (
          <Input
            id="objektId"
            readOnly
            value={aktuellesObjekt ? `${aktuellesObjekt.bezeichnung} (${aktuellesObjekt.id})` : einheit?.objektId ?? ""}
            className="bg-surface-muted"
          />
        ) : (
          <Controller
            control={form.control}
            name="objektId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={objektListe.length === 0}>
                <SelectTrigger id="objektId" className="rounded-none">
                  <SelectValue placeholder={objektListe.length === 0 ? "Kein Objekt vorhanden" : "Objekt wählen"} />
                </SelectTrigger>
                <SelectContent>
                  {objektListe.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.bezeichnung}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        {form.formState.errors.objektId ? (
          <p className="text-xs text-danger">{form.formState.errors.objektId.message}</p>
        ) : null}
        {objektId && !istBearbeitung ? (
          <p className="text-xs text-text-muted">
            {einheitenProObjekt} {einheitenProObjekt === 1 ? "Einheit" : "Einheiten"} in diesem Objekt
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lage">Lage / Nr.</Label>
        <Input id="lage" placeholder="EG links" {...form.register("lage")} />
        {form.formState.errors.lage ? (
          <p className="text-xs text-danger">{form.formState.errors.lage.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="id">Einheit-ID</Label>
          <Input
            id="id"
            className="font-mono text-sm"
            readOnly={istBearbeitung}
            {...form.register("id", {
              onChange: () => {
                idManuell.current = true;
              },
            })}
          />
          {form.formState.errors.id ? (
            <p className="text-xs text-danger">{form.formState.errors.id.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="flaecheM2">Fläche (m²)</Label>
          <Input id="flaecheM2" type="number" step="0.01" {...form.register("flaecheM2")} />
          {form.formState.errors.flaecheM2 ? (
            <p className="text-xs text-danger">{form.formState.errors.flaecheM2.message}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="status">Status</Label>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status" className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leerstand">Leerstand</SelectItem>
                <SelectItem value="vermietet">Vermietet</SelectItem>
                <SelectItem value="wartung">Wartung</SelectItem>
                <SelectItem value="reserviert">Reserviert</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
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
            disabled={form.formState.isSubmitting || (!istBearbeitung && objektListe.length === 0)}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}
